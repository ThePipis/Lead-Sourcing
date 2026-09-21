import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Lead, Campaign, Slot
from ..schemas import LeadResponse, ProspectingQuery, LeadStatusUpdate
from ..services.lead_sourcing_service import LeadSourcingService, CATEGORY_TAXONOMY, TICKET_ESTIMATES

router = APIRouter(prefix="/prospecting", tags=["Prospecting"])
sourcing_service = LeadSourcingService()

@router.post("/generate-pitch")
async def generate_pitch_endpoint(req: dict = Body(...)):
    """
    Genera un pitch de prospección telefónica bilingüe (EN/ES) de un solo golpe,
    conectando con llama-server en red local (o fallback resiliente de nicho).
    """
    niche = req.get("niche") or req.get("category_name") or req.get("category") or "HVAC"
    business_name = req.get("business_name") or req.get("businessName") or "Local Merchant"
    avg_ticket = req.get("avg_ticket") or req.get("avgTicket")
    if avg_ticket is not None:
        try:
            avg_ticket = float(avg_ticket)
        except (ValueError, TypeError):
            avg_ticket = None

    result = await sourcing_service.generate_pitch(
        business_name=business_name,
        niche=niche,
        avg_ticket=avg_ticket
    )
    return result

@router.get("/search", response_model=List[LeadResponse])
async def search_leads(
    city: str = Query("Eastvale"),
    zip_code: str = Query("92880"),
    category_id: Optional[int] = Query(None),
    mock_mode: Optional[bool] = Query(None),
    exclude_names: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    categories = [category_id] if category_id else list(range(1, 15))
    results = []

    campaign_for_zip = db.query(Campaign).filter(Campaign.target_zip == zip_code).first()
    campaign_id_for_zip = campaign_for_zip.id if campaign_for_zip else None

    # Lista negra: comercios rechazados en BD o provistos en exclude_names
    blacklist = set()
    if campaign_id_for_zip:
        rej_rows = db.query(Lead.business_name).filter(
            (Lead.campaign_id == campaign_id_for_zip) | (Lead.zip == zip_code),
            Lead.status == "REJECTED"
        ).all()
    else:
        rej_rows = db.query(Lead.business_name).filter(
            Lead.zip == zip_code,
            Lead.status == "REJECTED"
        ).all()

    for r in rej_rows:
        if r[0]:
            blacklist.add(r[0].strip().lower())

    if exclude_names:
        for en in exclude_names.split(","):
            if en.strip():
                blacklist.add(en.strip().lower())

    for cat_id in categories:
        taxonomy = CATEGORY_TAXONOMY.get(cat_id, CATEGORY_TAXONOMY[1])
        # Consulta de candidatos orquestada respetando MOCK_MODE y lista negra
        candidates = await sourcing_service.search_candidates(
            category_id=cat_id,
            city=city,
            zip_code=zip_code,
            mock_mode=mock_mode,
            exclude_names=list(blacklist),
            limit=3
        )

        # Check if slot in DB has a customized avg_ticket_usd and price_usd
        custom_slot = db.query(Slot).filter(Slot.slot_number == cat_id).first()
        custom_ticket = custom_slot.avg_ticket_usd if (custom_slot and custom_slot.avg_ticket_usd) else None
        custom_price = custom_slot.price_usd if (custom_slot and custom_slot.price_usd) else None
        
        ticket = custom_ticket or TICKET_ESTIMATES.get(cat_id, 500.0)
        ad_price = custom_price or taxonomy.get("price", 497.0)
        breakeven_deals = max(1, round(ad_price / (ticket if ticket > 0 else 1)))
        breakeven_ratio = round(ad_price / (ticket if ticket > 0 else 1), 2)

        # One pitch per candidate against a real LLM. Awaiting them one at a
        # time made a single category take ~100s; the calls are independent, so
        # run them together and wait once.
        pitches = await asyncio.gather(*[
            sourcing_service.generate_llm_pitch(
                cand["business_name"], taxonomy["name_es"], ticket
            )
            for cand in candidates
        ])

        for idx, cand in enumerate(candidates):
            llm_result = pitches[idx]

            norm_zip = cand.get("zip_code") or cand.get("zip") or zip_code
            lead_id = f"lead_{cat_id}_{idx}_{norm_zip}"
            lead_resp = LeadResponse(
                id=lead_id,
                category_id=cat_id,
                category_name=taxonomy["name_es"],
                business_name=cand["business_name"],
                name=cand.get("name") or cand["business_name"],
                address=cand.get("address"),
                city=cand.get("city", city),
                zip=norm_zip,
                zip_code=norm_zip,
                phone=cand.get("phone"),
                rating=cand.get("rating"),
                review_count=cand.get("review_count"),
                website_url=cand.get("website_url"),
                category=cand.get("category") or taxonomy["yelp_category"],
                source=cand["source"],
                decision_maker=llm_result.get("decision_maker"),
                decision_maker_title="Owner / Decision Maker",
                avg_ticket_estimated=ticket,
                hook_en=llm_result.get("en"),
                hook_es=llm_result.get("es"),
                roi_pitch=f"Inversión: ${ad_price:.0f} USD | Ticket: ${ticket:.0f} USD | Breakeven: {breakeven_deals} {'cierre' if breakeven_deals == 1 else 'cierres'} ({breakeven_ratio} ventas requeridas).",
                status="NEW"
            )

            # Leads arrive from Yelp/Geoapify on every search. Persist the row
            # so the CRM status the user sets survives a refetch; the id is
            # deterministic per category+zip, so re-searching finds the same row.
            row = db.query(Lead).filter(Lead.id == lead_id).first()
            if row is None:
                row = Lead(
                    id=lead_id,
                    campaign_id=campaign_id_for_zip,
                    category_id=cat_id,
                    category_name=taxonomy["name_es"],
                    business_name=cand["business_name"],
                    address=cand.get("address"),
                    city=cand.get("city", city),
                    zip=norm_zip,
                    phone=cand.get("phone"),
                    rating=cand.get("rating"),
                    review_count=cand.get("review_count"),
                    source=cand["source"],
                    decision_maker=llm_result.get("decision_maker"),
                    decision_maker_title="Owner / Decision Maker",
                    avg_ticket_estimated=ticket,
                    hook_en=llm_result.get("en"),
                    hook_es=llm_result.get("es"),
                    roi_pitch=lead_resp.roi_pitch,
                    status="NEW",
                )
                db.add(row)
            else:
                # Refresh the sourced facts, never the operator's own CRM status.
                row.business_name = cand["business_name"]
                row.phone = cand.get("phone")
                row.rating = cand["rating"]
                row.review_count = cand["review_count"]

            lead_resp.status = row.status
            results.append(lead_resp)

    db.commit()
    return results


@router.get("/replacement", response_model=LeadResponse)
async def get_replacement_lead(
    category_id: int = Query(...),
    city: str = Query("Eastvale"),
    zip_code: str = Query("92880"),
    exclude_names: Optional[str] = Query(None),
    mock_mode: Optional[bool] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Busca un nuevo candidato calificado que no esté en la lista negra o descartado,
    genera su guion de prospección y lo entrega para reemplazo inmediato.
    """
    campaign_for_zip = db.query(Campaign).filter(Campaign.target_zip == zip_code).first()
    campaign_id_for_zip = campaign_for_zip.id if campaign_for_zip else None

    blacklist = set()
    if campaign_id_for_zip:
        rej_rows = db.query(Lead.business_name).filter(
            (Lead.campaign_id == campaign_id_for_zip) | (Lead.zip == zip_code),
            Lead.status == "REJECTED"
        ).all()
    else:
        rej_rows = db.query(Lead.business_name).filter(
            Lead.zip == zip_code,
            Lead.status == "REJECTED"
        ).all()

    for r in rej_rows:
        if r[0]:
            blacklist.add(r[0].strip().lower())

    if exclude_names:
        for en in exclude_names.split(","):
            if en.strip():
                blacklist.add(en.strip().lower())

    taxonomy = CATEGORY_TAXONOMY.get(category_id, CATEGORY_TAXONOMY[1])
    candidates = await sourcing_service.search_candidates(
        category_id=category_id,
        city=city,
        zip_code=zip_code,
        mock_mode=mock_mode,
        exclude_names=list(blacklist),
        limit=1
    )

    if not candidates:
        raise HTTPException(status_code=404, detail="No se encontraron candidatos disponibles fuera de la lista de exclusión.")

    cand = candidates[0]
    custom_slot = db.query(Slot).filter(Slot.slot_number == category_id).first()
    custom_ticket = custom_slot.avg_ticket_usd if (custom_slot and custom_slot.avg_ticket_usd) else None
    custom_price = custom_slot.price_usd if (custom_slot and custom_slot.price_usd) else None

    ticket = custom_ticket or TICKET_ESTIMATES.get(category_id, 500.0)
    ad_price = custom_price or taxonomy.get("price", 497.0)
    breakeven_deals = max(1, round(ad_price / (ticket if ticket > 0 else 1)))
    breakeven_ratio = round(ad_price / (ticket if ticket > 0 else 1), 2)

    llm_result = await sourcing_service.generate_llm_pitch(
        cand["business_name"], taxonomy["name_es"], ticket
    )

    norm_zip = cand.get("zip_code") or cand.get("zip") or zip_code
    lead_id = f"lead_{category_id}_{abs(hash(cand['business_name'].lower())) % 10**6}_{norm_zip}"

    lead_resp = LeadResponse(
        id=lead_id,
        category_id=category_id,
        category_name=taxonomy["name_es"],
        business_name=cand["business_name"],
        name=cand.get("name") or cand["business_name"],
        address=cand.get("address"),
        city=cand.get("city", city),
        zip=norm_zip,
        zip_code=norm_zip,
        phone=cand.get("phone"),
        rating=cand.get("rating"),
        review_count=cand.get("review_count"),
        website_url=cand.get("website_url"),
        category=cand.get("category") or taxonomy["yelp_category"],
        source=cand["source"],
        decision_maker=llm_result.get("decision_maker"),
        decision_maker_title="Owner / Decision Maker",
        avg_ticket_estimated=ticket,
        hook_en=llm_result.get("en"),
        hook_es=llm_result.get("es"),
        roi_pitch=f"Inversión: ${ad_price:.0f} USD | Ticket: ${ticket:.0f} USD | Breakeven: {breakeven_deals} {'cierre' if breakeven_deals == 1 else 'cierres'} ({breakeven_ratio} ventas requeridas).",
        status="NEW"
    )

    row = db.query(Lead).filter(Lead.id == lead_id).first()
    if row is None:
        row = Lead(
            id=lead_id,
            campaign_id=campaign_id_for_zip,
            category_id=category_id,
            category_name=taxonomy["name_es"],
            business_name=cand["business_name"],
            address=cand.get("address"),
            city=cand.get("city", city),
            zip=norm_zip,
            phone=cand.get("phone"),
            rating=cand.get("rating"),
            review_count=cand.get("review_count"),
            source=cand["source"],
            decision_maker=llm_result.get("decision_maker"),
            decision_maker_title="Owner / Decision Maker",
            avg_ticket_estimated=ticket,
            hook_en=llm_result.get("en"),
            hook_es=llm_result.get("es"),
            roi_pitch=lead_resp.roi_pitch,
            status="NEW",
        )
        db.add(row)
        db.commit()

    return lead_resp

@router.post("/assign-slot/{campaign_id}/{lead_id}/{slot_number}")
def assign_lead_to_slot(campaign_id: str, lead_id: str, slot_number: int, db: Session = Depends(get_db)):
    slot = db.query(Slot).filter(Slot.campaign_id == campaign_id, Slot.slot_number == slot_number).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    slot.status = "RESERVED"
    db.commit()
    return {"message": "Lead assigned to slot successfully", "slot_number": slot_number}


@router.patch("/leads/{lead_id}", response_model=LeadResponse)
def update_lead_status(
    lead_id: str,
    req: LeadStatusUpdate,
    db: Session = Depends(get_db),
):
    """
    Persiste el estado CRM de un lead (NEW, CONTACTED, REJECTED, WON).
    Sin esto el estado vive solo en memoria y se pierde al recargar.
    """
    allowed = {"NEW", "CONTACTED", "REJECTED", "WON"}
    if req.status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"status must be one of {sorted(allowed)}",
        )

    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")

    lead.status = req.status
    db.commit()
    db.refresh(lead)
    return lead
