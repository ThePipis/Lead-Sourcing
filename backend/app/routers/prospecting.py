import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional, Union
from pydantic import BaseModel
from ..database import get_db
from ..models import Lead, Campaign, Slot, LeadRegeneration, LeadContact
from ..schemas import LeadResponse, ProspectingQuery, LeadStatusUpdate
from ..services.lead_sourcing_service import LeadSourcingService, CATEGORY_TAXONOMY, TICKET_ESTIMATES, _is_national_chain
from ..routers.datasources import disabled_lead_sources

router = APIRouter(prefix="/prospecting", tags=["Prospecting"])

# How long a stored lead counts as current. A local trade directory does not
# turn over in a day, and asking Yelp again for the same three dentists costs
# the operator twenty seconds and a slice of a 300-call allowance.
CACHE_FRESH_HOURS = 72


def _row_to_response(r: Lead) -> LeadResponse:
    """A stored lead, in the shape the screen already knows how to draw."""
    return LeadResponse(
        id=r.id,
        category_id=r.category_id,
        category_name=r.category_name or "",
        business_name=r.business_name,
        name=r.business_name,
        address=r.address,
        city=r.city,
        zip=r.zip,
        zip_code=r.zip,
        phone=r.phone,
        email=r.email,
        rating=r.rating,
        review_count=r.review_count,
        website_url=r.website_url,
        website_ok=r.website_ok,
        website_source=r.website_source,
        has_street_address=bool(r.has_street_address) if r.has_street_address is not None else True,
        latitude=r.latitude,
        longitude=r.longitude,
        simulated=False,
        category=r.category_name,
        source=r.source or "",
        decision_maker=r.decision_maker,
        decision_maker_title=r.decision_maker_title,
        avg_ticket_estimated=r.avg_ticket_estimated or 500.0,
        distance_miles=r.distance_miles,
        distance_m=(r.distance_miles or 0) * 1609.344 if r.distance_miles else None,
        geo_tier=r.geo_tier,
        status=r.status or "NEW",
    )
sourcing_service = LeadSourcingService()



def _campaign_for(db: Session, campaign_id: Optional[str], zip_code: str) -> Optional[Campaign]:
    """The campaign a search is for: the one named, else the zone's first (older clients)."""
    if campaign_id:
        camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if camp:
            return camp
    return db.query(Campaign).filter(Campaign.target_zip == zip_code).first()


def _held_elsewhere(db: Session, camp: Optional[Campaign]) -> set:
    if camp is None:
        return set()
    from .campaigns import businesses_held_elsewhere
    return set(businesses_held_elsewhere(db, camp))


@router.get("/search", response_model=List[LeadResponse])
async def search_leads(
    city: str = Query("Eastvale"),
    zip_code: str = Query("92880"),
    category_id: Optional[int] = Query(None),
    mock_mode: Optional[bool] = Query(False),
    exclude_names: Optional[str] = Query(None),
    force_refresh: bool = Query(False, description="Ignora la caché y vuelve a preguntar a las fuentes"),
    campaign_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    results = []

    campaign_for_zip = _campaign_for(db, campaign_id, zip_code)
    campaign_id_for_zip = campaign_for_zip.id if campaign_for_zip else None

    # Without a category, search the niches actually on this card (each costs
    # Yelp calls); without a card, every niche there is a search taxonomy for.
    if category_id:
        categories = [category_id]
    elif campaign_for_zip:
        categories = sorted({
            s.category_id for s in campaign_for_zip.slots
            if s.category_id in CATEGORY_TAXONOMY and not (s.notes and "Covered by" in s.notes)
        })
    else:
        categories = sorted(CATEGORY_TAXONOMY)

    # Lista negra: comercios rechazados en BD o provistos en exclude_names
    # A business set aside is resting, not banned. It comes back on its own
    # when the clock its reason set runs out — see COOLDOWN_DAYS. Offering it
    # again the same afternoon is what made "regenerate" feel broken.
    blacklist = set()
    now = datetime.datetime.utcnow()
    resting = (
        db.query(LeadRegeneration.business_key)
        .filter(LeadRegeneration.cooldown_until != None)  # noqa: E711
        .filter(LeadRegeneration.cooldown_until > now)
        .distinct()
        .all()
    )
    cooling = {r[0] for r in resting}
    blacklist |= cooling
    # A business on another open campaign of this microzone is not on offer here.
    blacklist |= _held_elsewhere(db, campaign_for_zip)

    if exclude_names:
        for en in exclude_names.split(","):
            if en.strip():
                blacklist.add(en.strip().lower())

    # ------------------------------------------------------------------ cache
    #
    # Every lead already lands in SQLite with a deterministic id. Until now the
    # providers were asked again anyway, on every open of the side panel: the
    # same three dentists, the same Yelp call, thirteen to twenty seconds, and
    # a bite out of a 300-a-day allowance for an answer already on disk.
    #
    # So: if this niche was searched recently enough, serve what was stored.
    # `FRESH_HOURS` is a judgement about how fast a local trade directory
    # changes, not a technical limit — a dentist does not move this week.
    fresh_cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=CACHE_FRESH_HOURS)
    if not force_refresh:
        cached: List[LeadResponse] = []
        # Match the search, not the business: a lead keeps its own ZIP, and the
        # nearby towns (Norco 92860, Ontario 91752) were stored but never read
        # back, so a niche with one out-of-ZIP result showed two boxes, not three.
        searched = (
            Lead.campaign_id == campaign_id_for_zip if campaign_id_for_zip else Lead.zip == zip_code
        )
        for cat_id in categories:
            rows = (
                db.query(Lead)
                .filter(
                    Lead.category_id == cat_id,
                    searched,
                    Lead.created_at >= fresh_cutoff,
                )
                .order_by(Lead.distance_miles.asc())
                .all()
            )
            usable, seen_names = [], set()
            for r in rows:
                key = (r.business_name or "").strip().lower()
                # Rows stored before chains were filtered must not come back either.
                if key in blacklist or key in seen_names or _is_national_chain({"name": r.business_name}):
                    continue
                seen_names.add(key)
                usable.append(r)
            # One fresh row is enough to answer from disk.
            #
            # The threshold used to be three, which is how many the screen
            # draws — and a niche with only two real businesses in the
            # microzone, like the vets in Eastvale, therefore never hit the
            # cache at all. It went back to Yelp and Geoapify on every open of
            # the panel to be told the same two names again. The question this
            # cache answers is "was this niche searched recently", not "did it
            # produce a full house".
            if not usable:
                cached = []
                break
            cached.extend(_row_to_response(r) for r in usable[:3])
        if cached:
            return cached

    # Build set of disabled source IDs for the current campaign mode
    disabled_sources = disabled_lead_sources(db, campaign_for_zip.mode if campaign_for_zip else None)

    for cat_id in categories:
        taxonomy = CATEGORY_TAXONOMY.get(cat_id, CATEGORY_TAXONOMY[1])
        # Consulta de candidatos orquestada homologada (fuentes reales)
        candidates = await sourcing_service.search_candidates(
            category_id=cat_id,
            city=city,
            zip_code=zip_code,
            mock_mode=False,
            exclude_names=list(blacklist),
            limit=3,
            disabled_sources=disabled_sources,
        )

        # Check if slot in DB has a customized avg_ticket_usd and price_usd,
        # filtered to the correct campaign to avoid picking up another campaign's prices.
        custom_slot = None
        if campaign_id_for_zip is not None:
            custom_slot = (
                db.query(Slot)
                .filter(Slot.campaign_id == campaign_id_for_zip, Slot.category_id == cat_id)
                .first()
            )
        custom_ticket = custom_slot.avg_ticket_usd if (custom_slot and custom_slot.avg_ticket_usd) else None
        
        ticket = custom_ticket or TICKET_ESTIMATES.get(cat_id, 500.0)

        for idx, cand in enumerate(candidates):
            norm_zip = cand.get("zip_code") or cand.get("zip") or zip_code
            lead_id = f"lead_{cat_id}_{idx}_{campaign_id_for_zip or zip_code}"
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
                email=cand.get("email"),
                rating=cand.get("rating"),
                review_count=cand.get("review_count"),
                website_url=cand.get("website_url"),
                website_ok=cand.get("website_ok"),
                website_source=cand.get("website_source"),
                has_street_address=bool(cand.get("has_street_address", True)),
                latitude=(cand.get("coordinates") or {}).get("latitude"),
                longitude=(cand.get("coordinates") or {}).get("longitude"),
                simulated=bool(cand.get("simulated")),
                category=cand.get("category") or taxonomy["yelp_category"],
                source=cand["source"],
                decision_maker=cand.get("decision_maker"),
                decision_maker_title="Owner / Decision Maker",
                avg_ticket_estimated=ticket,
                distance_miles=cand.get("distance_miles"),
                distance_m=cand.get("distance_m"),
                geo_tier=cand.get("geo_tier"),
                status="NEW"
            )

            # Leads arrive from Yelp/Geoapify on every search. Persist the row
            # so the CRM status the user sets survives a refetch; the id is
            # deterministic per category+zip, so re-searching finds the same row.
            row = db.query(Lead).filter(Lead.id == lead_id).first()
            if campaign_id_for_zip is None:
                pass  # no campaign in this microzone yet: nothing to file the lead under
            elif row is None:
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
                    email=cand.get("email"),
                    website_url=cand.get("website_url"),
                    rating=cand.get("rating"),
                    review_count=cand.get("review_count"),
                    source=cand["source"],
                    decision_maker=cand.get("decision_maker"),
                    decision_maker_title="Owner / Decision Maker",
                    avg_ticket_estimated=ticket,
                    distance_miles=cand.get("distance_miles"),
                    website_ok=cand.get("website_ok"),
                    website_source=cand.get("website_source"),
                    has_street_address=bool(cand.get("has_street_address", True)),
                    latitude=(cand.get("coordinates") or {}).get("latitude"),
                    longitude=(cand.get("coordinates") or {}).get("longitude"),
                    geo_tier=cand.get("geo_tier"),
                    status="NEW",
                )
                db.add(row)
            else:
                # Refresh the sourced facts, never the operator's own CRM status.
                # Every sourced field, not some of them.
                #
                # The id is `lead_{category}_{index}_{zip}`, so row number two
                # is whichever business the provider returned second — and that
                # changes between searches. `address` was missing from this
                # list, so a row kept the previous occupant's street while
                # showing the new one's name: Trident Orthodontics was on the
                # card at 13334 Limonite Ave, which belongs to Eastvale Smiles
                # Dentistry. A wrong address on a prospect card is a partner
                # driving to the wrong building.
                row.campaign_id = campaign_id_for_zip
                row.business_name = cand["business_name"]
                row.address = cand.get("address")
                row.category_name = taxonomy["name_es"]
                row.source = cand["source"]
                row.zip = norm_zip
                row.decision_maker = cand.get("decision_maker")
                row.avg_ticket_estimated = ticket
                row.city = cand.get("city", city)
                row.phone = cand.get("phone")
                row.email = cand.get("email")
                row.website_url = cand.get("website_url")
                row.rating = cand["rating"]
                row.review_count = cand["review_count"]
                row.distance_miles = cand.get("distance_miles")
                row.website_ok = cand.get("website_ok")
                row.website_source = cand.get("website_source")
                row.has_street_address = bool(cand.get("has_street_address", True))
                row.latitude = (cand.get("coordinates") or {}).get("latitude")
                row.longitude = (cand.get("coordinates") or {}).get("longitude")
                row.geo_tier = cand.get("geo_tier")
                row.created_at = datetime.datetime.utcnow()

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
    mock_mode: Optional[bool] = Query(False),
    campaign_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Busca un nuevo candidato calificado que no esté en la lista negra o descartado,
    genera su guion de prospección y lo entrega para reemplazo inmediato.
    """
    campaign_for_zip = _campaign_for(db, campaign_id, zip_code)
    campaign_id_for_zip = campaign_for_zip.id if campaign_for_zip else None

    # No permanent exclusion any more. A business set aside last month is a
    # candidate this month, with its history attached — see LeadRegeneration.
    # The only names dropped are the ones the caller says are already on screen.
    # Same cooldown as the search: a business resting is not offered as a
    # replacement either, which was the whole point of setting it aside.
    blacklist = set()
    now = datetime.datetime.utcnow()
    cooling = {
        r[0]
        for r in db.query(LeadRegeneration.business_key)
        .filter(LeadRegeneration.cooldown_until != None)  # noqa: E711
        .filter(LeadRegeneration.cooldown_until > now)
        .distinct()
        .all()
    }
    blacklist |= cooling
    # A business on another open campaign of this microzone is not on offer here.
    blacklist |= _held_elsewhere(db, campaign_for_zip)

    if exclude_names:
        for en in exclude_names.split(","):
            if en.strip():
                blacklist.add(en.strip().lower())

    taxonomy = CATEGORY_TAXONOMY.get(category_id, CATEGORY_TAXONOMY[1])

    # Build disabled sources from settings (same logic as search_leads)
    disabled_sources = disabled_lead_sources(db, campaign_for_zip.mode if campaign_for_zip else None)

    candidates = await sourcing_service.search_candidates(
        category_id=category_id,
        city=city,
        zip_code=zip_code,
        mock_mode=False,
        exclude_names=list(blacklist),
        limit=1,
        disabled_sources=disabled_sources,
    )

    if not candidates:
        raise HTTPException(status_code=404, detail="No se encontraron candidatos disponibles fuera de la lista de exclusión.")

    cand = candidates[0]
    # Filter slot by campaign to avoid picking prices from another campaign (Issue 4)
    custom_slot = None
    if campaign_id_for_zip is not None:
        custom_slot = (
            db.query(Slot)
            .filter(Slot.campaign_id == campaign_id_for_zip, Slot.category_id == category_id)
            .first()
        )
    custom_ticket = custom_slot.avg_ticket_usd if (custom_slot and custom_slot.avg_ticket_usd) else None

    ticket = custom_ticket or TICKET_ESTIMATES.get(category_id, 500.0)

    norm_zip = cand.get("zip_code") or cand.get("zip") or zip_code
    lead_id = f"lead_{category_id}_{abs(hash(cand['business_name'].lower())) % 10**6}_{campaign_id_for_zip or zip_code}"

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
        email=cand.get("email"),
        rating=cand.get("rating"),
        review_count=cand.get("review_count"),
        website_url=cand.get("website_url"),
        website_ok=cand.get("website_ok"),
        website_source=cand.get("website_source"),
        has_street_address=bool(cand.get("has_street_address", True)),
        latitude=(cand.get("coordinates") or {}).get("latitude"),
        longitude=(cand.get("coordinates") or {}).get("longitude"),
        simulated=bool(cand.get("simulated")),
        category=cand.get("category") or taxonomy["yelp_category"],
        source=cand["source"],
        decision_maker=cand.get("decision_maker"),
        decision_maker_title="Owner / Decision Maker",
        avg_ticket_estimated=ticket,
        distance_miles=cand.get("distance_miles"),
        distance_m=cand.get("distance_m"),
        geo_tier=cand.get("geo_tier"),
        status="NEW"
    )

    row = db.query(Lead).filter(Lead.id == lead_id).first()
    if row is None and campaign_id_for_zip is not None:
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
            email=cand.get("email"),
            website_url=cand.get("website_url"),
            rating=cand.get("rating"),
            review_count=cand.get("review_count"),
            source=cand["source"],
            decision_maker=cand.get("decision_maker"),
            decision_maker_title="Owner / Decision Maker",
            avg_ticket_estimated=ticket,
            distance_miles=cand.get("distance_miles"),
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


# ---------------------------------------------------------------- regeneración
#
# "Rechazado" used to mean "never show me this business again". That is the
# wrong verb for what actually happens on the phone: the owner was busy, the
# budget was spent, the person who decides was away. A microzone has one
# dentist worth having, and burning it over one call leaves the box empty
# forever. So the business is set aside, the reason is written down, and it
# comes back next time with its history attached.

REASON_CODES = {
    "NO_CONTESTA": "No contesta / no devuelve la llamada",
    "SIN_PRESUPUESTO": "Sin presupuesto ahora",
    "NO_INTERESA": "No le interesa el correo directo",
    "YA_ANUNCIA": "Ya se anuncia en otro medio",
    "DECISOR_AUSENTE": "El que decide no estaba",
    "PIDE_LLAMAR_LUEGO": "Pide que lo llamen más adelante",
    "CERRADO": "Cerrado o fuera de servicio",
    "OTRO": "Otro motivo",
}

# How long a business rests before it is offered again, by reason.
#
# One global window would be wrong in both directions: a week is too long to
# wait for somebody who was simply out of the office, and too short for a
# practice that just signed a year with a competitor. The reason the partner
# already picks is exactly the information that sets the clock.
#
# The numbers follow how the decision was actually made, not a rule of thumb:
# a marketing budget moves by quarter, an advertising contract by half a year, an
# absent owner by days. `None` means the business is gone and is not coming
# back into the pool at all.
COOLDOWN_DAYS = {
    "DECISOR_AUSENTE": 7,        # "he's back next week" — call next week
    "NO_CONTESTA": 14,           # two more attempts inside a fortnight is fair
    "PIDE_LLAMAR_LUEGO": 30,     # they set the appointment; one drop cycle
    "OTRO": 30,                  # conservative default when nothing is known
    "SIN_PRESUPUESTO": 90,       # budgets move by quarter
    "YA_ANUNCIA": 180,           # advertising contracts run six to twelve months
    "NO_INTERESA": 180,          # a considered no deserves half a year
    "CERRADO": None,             # the business does not exist any more
}


def _business_key(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


class RegenerationIn(BaseModel):
    business_name: str
    campaign_id: Optional[str] = None
    category_id: Optional[int] = None
    slot_number: Optional[int] = None
    business_address: Optional[str] = None
    reason_code: str = "OTRO"
    reason_note: Optional[str] = None
    # Only honoured for "OTRO": the reason does not fix the clock, so the
    # person who made the call does.
    cooldown_days: Optional[int] = None


@router.get("/regeneration-reasons")
def regeneration_reasons():
    """
    The picker's options, each carrying how long it rests.

    The duration travels with the label so the seller reads "Sin presupuesto
    ahora (90 días)" and knows what they are committing to before choosing,
    instead of finding out afterwards.
    """
    return [
        {"code": c, "label": l, "cooldown_days": COOLDOWN_DAYS.get(c)}
        for c, l in REASON_CODES.items()
    ]


@router.post("/regenerations")
def record_regeneration(req: RegenerationIn, db: Session = Depends(get_db)):
    """
    Write down that this business was set aside, and why.

    Never touches the lead's own status: the business stays in the pool. What
    changes is that the next time it surfaces, the partner can see it has been
    here before and read what happened last time.
    """
    key = _business_key(req.business_name)
    if not key:
        raise HTTPException(status_code=422, detail="Falta el nombre del comercio")

    code = req.reason_code if req.reason_code in REASON_CODES else "OTRO"
    days = COOLDOWN_DAYS.get(code, 30)
    if code == "OTRO" and req.cooldown_days is not None:
        days = max(0, min(int(req.cooldown_days), 3650))
    # `None` is not "no cooldown", it is "forever": a closed business is the one
    # case where the pool should genuinely forget it.
    until = (
        datetime.datetime.utcnow() + datetime.timedelta(days=days)
        if days is not None
        else datetime.datetime.utcnow() + datetime.timedelta(days=36500)
    )

    row = LeadRegeneration(
        campaign_id=req.campaign_id,
        cooldown_until=until,
        business_key=key,
        business_name=req.business_name.strip(),
        business_address=(req.business_address or "").strip() or None,
        category_id=req.category_id,
        slot_number=req.slot_number,
        reason_code=code,
        reason_note=(req.reason_note or "").strip() or None,
    )
    db.add(row)
    db.commit()

    total = db.query(LeadRegeneration).filter(LeadRegeneration.business_key == key).count()
    return {
        "business_name": row.business_name,
        "count": total,
        "reason_code": code,
        "reason_label": REASON_CODES[code],
        "reason_note": row.reason_note,
        "at": row.created_at.isoformat() if row.created_at else None,
        "cooldown_days": days,
        "cooldown_until": until.isoformat(),
    }


@router.get("/regenerations")
def list_regenerations(
    names: str = Query("", description="Nombres de comercio separados por |"),
    db: Session = Depends(get_db),
):
    """
    How many times each of these businesses has been set aside, and the last
    reason. Queried per visible card, so the panel asks once for the three it
    is about to draw rather than once per business.
    """
    keys = [_business_key(n) for n in names.split("|") if n.strip()]
    if not keys:
        return {}

    rows = (
        db.query(LeadRegeneration)
        .filter(LeadRegeneration.business_key.in_(keys))
        .order_by(LeadRegeneration.created_at.asc())
        .all()
    )

    out: dict = {}
    for r in rows:
        entry = out.setdefault(r.business_key, {"count": 0, "last": None})
        entry["count"] += 1
        entry["last"] = {
            "reason_code": r.reason_code,
            "reason_label": REASON_CODES.get(r.reason_code, r.reason_code),
            "reason_note": r.reason_note,
            "at": r.created_at.isoformat() if r.created_at else None,
            # When it comes back on its own. The partner can see the clock
            # rather than wondering whether the business was lost.
            "cooldown_until": r.cooldown_until.isoformat() if r.cooldown_until else None,
            "resting": bool(r.cooldown_until and r.cooldown_until > datetime.datetime.utcnow()),
        }
    return out


# ------------------------------------------------------------------ contacto
#
# Marcar "contactado" y nada más pierde lo único que importa tres semanas
# después: quién atendió, qué pidieron, cuándo volver. Cada llamada deja nota,
# hora y, si procede, un recordatorio con fecha.

CONTACT_OUTCOMES = {
    "DEJE_MENSAJE": ("Dejé mensaje / buzón", 3),
    "HABLE_RECEPCION": ("Hablé con recepción", 4),
    "PIDE_INFO": ("Pidió que le enviara información", 5),
    "PIDE_LLAMAR": ("Pidió que lo llamara otro día", 7),
    "INTERESADO": ("Interesado, evaluando", 7),
    "NO_DISPONIBLE": ("No estaba disponible", 2),
    "OTRO": ("Otro", 7),
}


class ContactIn(BaseModel):
    business_name: str
    campaign_id: Optional[str] = None
    category_id: Optional[int] = None
    slot_number: Optional[int] = None
    outcome_code: str = "OTRO"
    note: Optional[str] = None
    # Días o minutos hasta el recordatorio.
    follow_up_days: Optional[Union[float, int]] = None
    follow_up_minutes: Optional[int] = None


@router.get("/contact-outcomes")
def contact_outcomes():
    return [
        {"code": c, "label": l, "follow_up_days": d}
        for c, (l, d) in CONTACT_OUTCOMES.items()
    ]


@router.post("/contacts")
def record_contact(req: ContactIn, db: Session = Depends(get_db)):
    """Write down the call, and when to make the next one."""
    key = _business_key(req.business_name)
    if not key:
        raise HTTPException(status_code=422, detail="Falta el nombre del comercio")

    code = req.outcome_code if req.outcome_code in CONTACT_OUTCOMES else "OTRO"
    follow = None
    if req.follow_up_minutes is not None:
        if req.follow_up_minutes > 0:
            follow = datetime.datetime.utcnow() + datetime.timedelta(minutes=int(req.follow_up_minutes))
    elif req.follow_up_days is not None:
        if float(req.follow_up_days) > 0:
            follow = datetime.datetime.utcnow() + datetime.timedelta(days=float(req.follow_up_days))

    row = LeadContact(
        campaign_id=req.campaign_id,
        business_key=key,
        business_name=req.business_name.strip(),
        category_id=req.category_id,
        slot_number=req.slot_number,
        outcome_code=code,
        note=(req.note or "").strip() or None,
        follow_up_at=follow,
    )
    db.add(row)
    db.commit()

    total = db.query(LeadContact).filter(LeadContact.business_key == key).count()
    return _contact_payload(row, total)


def _contact_payload(row: LeadContact, total: int) -> dict:
    now = datetime.datetime.utcnow()
    return {
        "business_name": row.business_name,
        "count": total,
        "outcome_code": row.outcome_code,
        "outcome_label": CONTACT_OUTCOMES.get(row.outcome_code, ("Otro", 7))[0],
        "note": row.note,
        "at": row.created_at.isoformat() if row.created_at else None,
        "follow_up_at": row.follow_up_at.isoformat() if row.follow_up_at else None,
        # True once the promised day has arrived. The card blinks on this.
        "due": bool(row.follow_up_at and row.follow_up_at <= now),
    }


@router.get("/contacts")
def list_contacts(
    names: str = Query("", description="Nombres separados por |"),
    db: Session = Depends(get_db),
):
    """Last call per business, for the cards about to be drawn."""
    keys = [_business_key(n) for n in names.split("|") if n.strip()]
    if not keys:
        return {}
    rows = (
        db.query(LeadContact)
        .filter(LeadContact.business_key.in_(keys))
        .order_by(LeadContact.created_at.asc())
        .all()
    )
    out: dict = {}
    for r in rows:
        entry = out.setdefault(r.business_key, {"count": 0, "last": None})
        entry["count"] += 1
        entry["last"] = _contact_payload(r, entry["count"])
    return out


@router.get("/contacts/by-slot")
def contacts_by_slot(
    campaign_id: str = Query("", description="Campana cuyas casillas se dibujan"),
    db: Session = Depends(get_db),
):
    """
    Every business being worked in each box, not only the one written on it.

    A box is sold by calling several businesses at the same time, so the card
    has to show several conversations, each with its own clock. Grouping by
    business alone collapses them into whichever happened to be called last.
    """
    q = db.query(LeadContact).filter(LeadContact.slot_number != None)  # noqa: E711
    if campaign_id:
        q = q.filter(LeadContact.campaign_id == campaign_id)
    rows = q.order_by(LeadContact.created_at.asc()).all()

    grouped: dict = {}
    for r in rows:
        entry = grouped.setdefault(
            (r.slot_number, r.business_key), {"count": 0, "row": None}
        )
        entry["count"] += 1
        entry["row"] = r

    out: dict = {}
    for (slot_number, _key), entry in grouped.items():
        out.setdefault(str(slot_number), []).append(
            _contact_payload(entry["row"], entry["count"])
        )

    # Overdue first, then the coldest call: the next one to make is on top.
    for calls in out.values():
        calls.sort(key=lambda c: (not c["due"], c["at"] or ""))
    return out


# --------------------------------------------------------------- cuarentena
#
# Sacar a alguien del descanso antes de tiempo: el vendedor se enteró de algo
# que el reloj no sabe — cambió el dueño, llamaron ellos, se liberó presupuesto.


@router.get("/quarantine")
def list_quarantine(
    q: str = Query("", description="Busca por nombre o dirección; vale un trozo"),
    db: Session = Depends(get_db),
):
    """
    Businesses currently resting, newest first, filtered as the operator types.

    The address comes from the lead row when there is one: somebody searching
    for "Limonite" is thinking of a street, not of a company name.
    """
    now = datetime.datetime.utcnow()
    rows = (
        db.query(LeadRegeneration)
        .filter(LeadRegeneration.cooldown_until != None)  # noqa: E711
        .filter(LeadRegeneration.cooldown_until > now)
        .order_by(LeadRegeneration.created_at.desc())
        .all()
    )

    # One row per business: the most recent regeneration is the one in force.
    seen: dict = {}
    for r in rows:
        if r.business_key in seen:
            continue
        seen[r.business_key] = r

    needle = q.strip().lower()
    out = []
    for key, r in seen.items():
        address = (r.business_address or "").strip()
        if not address:
            lead = (
                db.query(Lead)
                .filter(func.lower(Lead.business_name) == key)
                .order_by(Lead.created_at.desc())
                .first()
            )
            address = ((lead.address or "") + " " + (lead.city or "")).strip() if lead else ""
        if needle and needle not in key and needle not in address.lower():
            continue
        out.append(
            {
                "business_key": key,
                "business_name": r.business_name,
                "address": address,
                "reason_code": r.reason_code,
                "reason_label": REASON_CODES.get(r.reason_code, r.reason_code),
                "reason_note": r.reason_note,
                "at": r.created_at.isoformat() if r.created_at else None,
                "cooldown_until": r.cooldown_until.isoformat() if r.cooldown_until else None,
            }
        )
    return out[:25]


@router.post("/quarantine/release")
def release_quarantine(
    business_name: str = Query(..., description="Nombre del comercio a liberar"),
    db: Session = Depends(get_db),
):
    """
    End the rest now.

    The history is not deleted — how many times it was set aside and why stays
    on the record. Only the clock is cleared, because the operator knows
    something the clock does not.
    """
    key = _business_key(business_name)
    rows = (
        db.query(LeadRegeneration)
        .filter(LeadRegeneration.business_key == key)
        .filter(LeadRegeneration.cooldown_until != None)  # noqa: E711
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Ese comercio no está en cuarentena")
    for r in rows:
        r.cooldown_until = None
    db.commit()
    return {"business_name": business_name, "released": len(rows)}
