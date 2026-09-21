import datetime
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional, Any, Dict
from ..database import get_db
from ..models import Campaign, Slot, Household, Lead, AnalyticsEvent, CostSettings, CampaignRoute
from ..schemas import CampaignCreate, CampaignResponse, CampaignStatusUpdate, SlotUpdate, SlotResponse
# One cost model for the whole system: the campaign reads it, never its own copy.
from .costs import (
    unit_cost as cost_unit_per_piece,
    fixed_cost as cost_fixed_per_drop,
    prices_for_campaign,
)

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])

INITIAL_SLOT_DEFS = [
    (1, "Odontología Familiar", "FRONT", "HERO", 12.0, 3.2, 850.0),
    (2, "HVAC / Aire Acondicionado", "FRONT", "STANDARD_FRONT", 4.3, 4.2, 497.0),
    (3, "Hospital Veterinario", "FRONT", "STANDARD_FRONT", 4.3, 4.2, 497.0),
    (4, "Plomería Residencial", "FRONT", "STANDARD_FRONT", 4.3, 4.2, 497.0),
    (5, "Taller Mecánico / Frenos", "FRONT", "STANDARD_FRONT", 4.3, 4.2, 497.0),
    (6, "Pizzería Artesanal", "FRONT", "STANDARD_FRONT", 4.3, 4.2, 497.0),
    (7, "Gimnasio Boutique / Fitness", "FRONT", "STANDARD_FRONT", 4.3, 4.2, 497.0),
    (8, "Techado y Paneles Solares", "BACK", "STANDARD_BACK", 4.3, 3.8, 497.0),
    (9, "Quiropráctico / Fisioterapia", "BACK", "STANDARD_BACK", 4.3, 3.8, 497.0),
    (10, "Limpieza de Alfombras y Pisos", "BACK", "STANDARD_BACK", 4.3, 3.8, 497.0),
    (11, "Detailing Móvil de Autos", "BACK", "STANDARD_BACK", 4.3, 3.8, 497.0),
    (12, "Peluquería Canina", "BACK", "STANDARD_BACK", 4.3, 3.8, 497.0),
    (13, "Restaurante Mexicano", "BACK", "STANDARD_BACK", 4.3, 3.8, 497.0),
    # 7" x 3" = 21 in2 contra los 16.3 in2 de un estandar del reverso: 28% mas
    # papel, 28% mas caro. Arrastraba $450, por debajo de sus vecinos mas
    # pequenos, que era un error de la tabla original y no del modelo.
    (14, "Agencia de Seguros", "BACK", "MEDIUM_BACK", 7.0, 3.0, 640.0)
]

PRODUCTION_STATUSES = ("IN_PRODUCTION", "MAILED")

# The prices in INITIAL_SLOT_DEFS are the rate card at 5,000 households. They
# survive as the *weights* — what each position is worth relative to the others
# — and as the fallback when no cost model has been configured yet. The price
# itself comes from the cost of the drop: see prices_for_campaign in costs.py.
BASELINE_HOUSEHOLDS = 5000


def price_for(base_price: float, households: int) -> float:
    """The rate card scaled to the reach. Fallback only, when costs are unknown."""
    return round(base_price * households / BASELINE_HOUSEHOLDS)


def slot_prices(db: Optional[Session], camp: Campaign) -> Dict[int, float]:
    """
    The price of every box for this campaign, derived from what the drop costs.

    Falls back to the scaled rate card when there is no cost model to derive
    from, which is the only honest thing to do with no figures: a made-up price
    is worse than the list price the operator already knows.
    """
    # Price on the pieces that will actually be printed. Once carrier routes
    # are selected the drop is their delivery count, not the round figure the
    # operator typed, and charging fourteen advertisers for a reach the drop no
    # longer has is how a campaign loses money quietly.
    households = billable_households(camp, db)
    if db is not None:
        derived = prices_for_campaign(db, camp.mode or "DEMO", households)
        if derived:
            return derived
    return {num: price_for(price, households) for num, *_rest, price in
            ((d[0], d[6]) for d in INITIAL_SLOT_DEFS)}


def effective_unit_cost(camp: Campaign, db: Optional[Session]) -> float:
    """
    What one piece costs us today.

    There is one cost model in the system and it lives in cost_settings, edited
    from section 1. A campaign only keeps its own figure once it has gone to the
    printer: from that moment the cost is history and must not move when the
    next quote changes.
    """
    if camp.status in PRODUCTION_STATUSES or db is None:
        return camp.unit_cost_usd or 0.60
    row = db.query(CostSettings).filter(CostSettings.mode == (camp.mode or "DEMO")).first()
    return cost_unit_per_piece(row) if row else (camp.unit_cost_usd or 0.60)


def drop_fixed_cost(camp: Campaign, db: Optional[Session]) -> float:
    """Setup, prepress and the run to the USPS entry unit: charged once per drop."""
    if camp.status in PRODUCTION_STATUSES or db is None:
        return 0.0
    row = db.query(CostSettings).filter(CostSettings.mode == (camp.mode or "DEMO")).first()
    return cost_fixed_per_drop(row) if row else 0.0


def billable_households(camp: Campaign, db: Optional[Session] = None) -> int:
    """
    How many pieces this drop actually prints and mails.

    Once carrier routes are selected, that is the number: a saturation drop buys
    whole routes and the USPS bills on their delivery counts, not on the round
    figure the operator had in mind. Before then, the target stands.
    """
    if db is not None:
        covered = (
            db.query(func.sum(CampaignRoute.residential))
            .filter(CampaignRoute.campaign_id == camp.id, CampaignRoute.selected == True)  # noqa: E712
            .scalar()
        )
        if covered:
            return int(covered)
    return camp.target_households or 0


def drop_cost(camp: Campaign, db: Optional[Session] = None) -> float:
    unit = effective_unit_cost(camp, db)
    return round(billable_households(camp, db) * unit + drop_fixed_cost(camp, db), 2)


def _populate_campaign_computed(camp: Campaign, db: Optional[Session] = None) -> Campaign:
    paid_slots = [s for s in camp.slots if s.status == "PAID"]
    camp.paid_count = len(paid_slots)
    # Cost follows the drop size rather than sitting at a fixed $3,000.
    camp.unit_cost_usd = effective_unit_cost(camp, db)
    if db is not None:
        selected = (
            db.query(CampaignRoute)
            .filter(CampaignRoute.campaign_id == camp.id, CampaignRoute.selected == True)  # noqa: E712
            .all()
        )
        camp.covered_households = sum(r.residential for r in selected)
        camp.selected_routes = len(selected)
    else:
        camp.covered_households = 0
        camp.selected_routes = 0
    camp.fixed_cost_usd = drop_fixed_cost(camp, db)
    cost_row = (
        db.query(CostSettings).filter(CostSettings.mode == (camp.mode or "DEMO")).first()
        if db is not None
        else None
    )
    camp.target_margin = cost_row.target_margin if cost_row else 0.58
    camp.operating_cost_est = drop_cost(camp, db)
    if db is not None:
        camp.curated_count = db.query(Household).filter(
            Household.campaign_id == camp.id
        ).count()
    camp.total_collected_usd = sum(s.price_usd for s in paid_slots)
    camp.target_gross_revenue = sum(s.price_usd for s in camp.slots)
    camp.net_margin_est = max(0.0, camp.target_gross_revenue - camp.operating_cost_est)
    camp.slots.sort(key=lambda s: s.slot_number)
    return camp

@router.post("/", response_model=CampaignResponse)
def create_campaign(req: CampaignCreate, db: Session = Depends(get_db)):
    mode = (req.mode or "DEMO").upper()
    zone = f"IE-{req.target_city[:4].upper()}-{req.target_zip}"

    # `campaigns.code` is unique, and the same microzone is mailed again and
    # again, so a real campaign is identified by its drop: zone plus year and
    # month. Practice campaigns keep the bare zone code they were seeded with.
    if mode == "DEMO":
        code = zone
        camp_id = f"camp_{code.lower()}"
    else:
        code = f"{zone}-{datetime.datetime.utcnow():%y%m}"
        camp_id = f"camp_{code.lower()}"

    if db.query(Campaign).filter(Campaign.code == code).first():
        raise HTTPException(
            status_code=409,
            detail=f"A campaign with code {code} already exists",
        )

    camp = Campaign(
        id=camp_id,
        code=code,
        name=req.name,
        target_city=req.target_city,
        target_zip=req.target_zip,
        radius_miles=req.radius_miles,
        target_households=req.target_households,
        unit_cost_usd=req.unit_cost_usd,
        target_gross_revenue=0.0,
        operating_cost_est=0.0,
        net_margin_est=0.0,
        status="PROSPECTING",
        mode=mode,
    )
    db.add(camp)
    db.flush()

    derived = prices_for_campaign(db, mode, camp.target_households or 0)
    for num, cat_name, side, stype, w, h, price in INITIAL_SLOT_DEFS:
        s = Slot(
            campaign_id=camp.id,
            slot_number=num,
            category_id=num,
            category_name=cat_name,
            side=side,
            slot_type=stype,
            width_inches=w,
            height_inches=h,
            price_usd=derived.get(num, price_for(price, camp.target_households)),
            status="VACANT",
        )
        db.add(s)

    db.commit()
    db.refresh(camp)
    return _populate_campaign_computed(camp, db)

@router.get("", response_model=List[CampaignResponse])
@router.get("/", response_model=List[CampaignResponse])
def list_campaigns(
    mode: Optional[str] = Query(None, description="DEMO or LIVE; omit for every campaign"),
    db: Session = Depends(get_db),
):
    """
    The campaigns in the file, newest first. DEMO carries the seeded practice
    data and LIVE the real business; the operator sees one set at a time, so
    the numbers on screen are never a mix of the two.
    """
    q = db.query(Campaign)
    if mode:
        q = q.filter(Campaign.mode == mode.upper())
    camps = q.order_by(Campaign.created_at.desc()).all()
    return [_populate_campaign_computed(c, db) for c in camps]


@router.patch("/{campaign_id}", response_model=CampaignResponse)
def update_campaign_status(
    campaign_id: str,
    req: CampaignStatusUpdate,
    db: Session = Depends(get_db),
):
    """Advance a campaign into production or mark the drop mailed."""
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id} not found")

    if req.target_households is not None or req.unit_cost_usd is not None:
        paid = [s for s in camp.slots if s.status == "PAID"]
        if paid:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{len(paid)} slot(s) already paid at the current reach; "
                    "resizing would change what those advertisers bought"
                ),
            )
        if camp.status in PRODUCTION_STATUSES:
            raise HTTPException(
                status_code=409,
                detail="The drop is already at the printer; its size is fixed",
            )

        if req.unit_cost_usd is not None:
            camp.unit_cost_usd = req.unit_cost_usd

        if req.target_households is not None and req.target_households != camp.target_households:
            camp.target_households = req.target_households
            # Nothing is sold yet, so every box re-prices — from the cost of the
            # new drop, not from a rate card multiplied by the reach. At five
            # households that multiplication gives fifty cents a box against a
            # drop that still costs $428 in setup and delivery.
            repriced = slot_prices(db, camp)
            by_number = {d[0]: d[6] for d in INITIAL_SLOT_DEFS}
            for slot in camp.slots:
                price = repriced.get(slot.slot_number)
                if price is None:
                    base = by_number.get(slot.slot_number)
                    price = price_for(base, camp.target_households) if base is not None else None
                if price is not None:
                    slot.price_usd = price

            # The persisted audience was cut to the old reach, so it no longer
            # describes this drop. Drop it and send the campaign back to the
            # curation step rather than leaving a manifest of the wrong size.
            removed = (
                db.query(Household).filter(Household.campaign_id == camp.id).delete()
            )
            if removed and camp.status == "CURATED":
                camp.status = "PROSPECTING"

    if req.archived is not None:
        camp.archived_at = datetime.datetime.utcnow() if req.archived else None

    if req.status:
        camp.status = req.status
        now = datetime.datetime.utcnow()
        if req.status == "IN_PRODUCTION" and camp.production_at is None:
            camp.production_at = now
            # Freeze what the drop actually cost. From here the cost settings can
            # move with the next quote without rewriting this drop's history.
            camp.unit_cost_usd = effective_unit_cost(camp, db)
    if db is not None:
        selected = (
            db.query(CampaignRoute)
            .filter(CampaignRoute.campaign_id == camp.id, CampaignRoute.selected == True)  # noqa: E712
            .all()
        )
        camp.covered_households = sum(r.residential for r in selected)
        camp.selected_routes = len(selected)
    else:
        camp.covered_households = 0
        camp.selected_routes = 0
        if req.status == "MAILED":
            if camp.production_at is None:
                camp.production_at = now
            if camp.mailed_at is None:
                camp.mailed_at = now

    db.commit()
    db.refresh(camp)
    return _populate_campaign_computed(camp, db)


@router.get("/active", response_model=CampaignResponse)
def get_active_campaign(zip_code: Optional[str] = Query(None), db: Session = Depends(get_db)):
    if zip_code:
        camp = db.query(Campaign).filter(Campaign.target_zip == zip_code).first()
    else:
        camp = db.query(Campaign).order_by(Campaign.created_at.desc()).first()

    if not camp:
        # Autocrear campaña para la microzona solicitada
        if zip_code == "92882" or (zip_code and "corona" in zip_code.lower()):
            code = "IE-CORO-92882"
            camp_id = "camp_ie-coro-92882"
            city = "Corona"
            zip_val = "92882"
            name = "Co-Op Direct Mail - Corona Spring Run"
        elif zip_code:
            city = "Eastvale" if zip_code == "92880" else "Inland Empire"
            code = f"IE-{city[:4].upper()}-{zip_code}"
            camp_id = f"camp_{code.lower()}"
            zip_val = zip_code
            name = f"Co-Op Direct Mail - {city} Spring Run"
        else:
            code = "IE-EAST-92880"
            camp_id = "camp_ie-east-92880"
            city = "Eastvale"
            zip_val = "92880"
            name = "Co-Op Direct Mail - Eastvale Spring Run"

        camp = Campaign(
            id=camp_id,
            code=code,
            name=name,
            target_city=city,
            target_zip=zip_val,
            radius_miles=5.0,
            target_households=5000,
            target_gross_revenue=7264.0,
            operating_cost_est=3000.0,
            net_margin_est=4264.0,
            status="PROSPECTING"
        )
        db.add(camp)
        db.flush()

        initial_defaults = {}
        if zip_val == "92880":
            initial_defaults = {
                1: ("Eastvale Premier Family Dentistry", "PAID", "Doctor, 5,000 familias propietarias recibirán la postal gigante.", 12),
                2: ("Inland Air Pro Heating & Cooling", "PAID", "Servicio integral de aire acondicionado y calefacción.", 8),
                3: ("Eastvale Animal Hospital & Urgent Pet Care", "PAID", "Atención veterinaria y urgencias para mascotas.", 0),
                8: ("Inland Solar & Roofing Dynamics", "RESERVED", "Instalación de paneles solares y reparación de techos.", 0),
                13: ("Taquería El Tapatío & Cantina Familiar", "PROSPECTING", "Auténtica comida mexicana para toda la familia.", 0)
            }
        elif zip_val == "92882":
            initial_defaults = {
                1: ("Corona Valley Family Dental", "PAID", "Sonrisas saludables en Corona. Cobertura completa.", 5),
                2: ("Corona Climate & HVAC Master", "PAID", "Mantenimiento integral A/C para Corona.", 4),
                4: ("Corona Master Rooter & Plumbing", "RESERVED", "Plomería de emergencia 24/7 en Corona.", 0),
            }

        for num, cat_name, side, stype, w, h, price in INITIAL_SLOT_DEFS:
            b_data = initial_defaults.get(num, ("", "VACANT", "", 0))
            s = Slot(
                campaign_id=camp.id,
                slot_number=num,
                category_id=num,
                category_name=cat_name,
                side=side,
                slot_type=stype,
                width_inches=w,
                height_inches=h,
                price_usd=price,
                business_name=b_data[0] if b_data[0] else None,
                status=b_data[1],
                offer_headline=b_data[2] if b_data[2] else None,
                scan_count=b_data[3]
            )
            db.add(s)

        db.commit()
        db.refresh(camp)
    else:
        # Ensure all 14 slots exist for the active campaign
        existing_numbers = {s.slot_number for s in camp.slots}
        if len(existing_numbers) < 14:
            for num, cat_name, side, stype, w, h, price in INITIAL_SLOT_DEFS:
                if num not in existing_numbers:
                    s = Slot(
                        campaign_id=camp.id,
                        slot_number=num,
                        category_id=num,
                        category_name=cat_name,
                        side=side,
                        slot_type=stype,
                        width_inches=w,
                        height_inches=h,
                        price_usd=price,
                        status="VACANT"
                    )
                    db.add(s)
            db.commit()
            db.refresh(camp)

    return _populate_campaign_computed(camp, db)

@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign(campaign_id: str, zip_code: Optional[str] = Query(None), db: Session = Depends(get_db)):
    if campaign_id == "active":
        return get_active_campaign(zip_code=zip_code, db=db)

    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    return _populate_campaign_computed(camp, db)

@router.put("/{campaign_id}/slots/{slot_id}", response_model=SlotResponse)
@router.patch("/{campaign_id}/slots/{slot_id}", response_model=SlotResponse)
def update_slot(campaign_id: str, slot_id: str, req: SlotUpdate, db: Session = Depends(get_db)):
    if campaign_id == "active":
        camp = db.query(Campaign).order_by(Campaign.created_at.desc()).first()
        if not camp:
            camp = get_active_campaign(db)
    else:
        camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    query = db.query(Slot).filter(Slot.campaign_id == camp.id)
    if slot_id.isdigit():
        num = int(slot_id)
        slot = query.filter(or_(Slot.slot_number == num, Slot.id == num)).first()
    else:
        raise HTTPException(status_code=400, detail="Invalid slot identifier")
    
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(slot, key, value)
    
    # Recalculate campaign financials dynamically
    all_slots = db.query(Slot).filter(Slot.campaign_id == camp.id).all()
    camp.target_gross_revenue = sum(s.price_usd for s in all_slots)
    camp.operating_cost_est = 3000.0
    camp.net_margin_est = max(0.0, camp.target_gross_revenue - camp.operating_cost_est)
    camp.total_collected_usd = sum(s.price_usd for s in all_slots if s.status == "PAID")

    paid_count = len([s for s in all_slots if s.status == "PAID"])
    if paid_count >= 14:
        camp.status = "LOCKED_READY"
    elif camp.status != "CURATED":
        camp.status = "PROSPECTING"
    db.commit()
    db.refresh(slot)
    db.refresh(camp)

    return slot

@router.put("/{campaign_id}/batch-slots", response_model=List[SlotResponse])
def batch_update_slots(campaign_id: str, updates: List[dict] = Body(...), db: Session = Depends(get_db)):
    if campaign_id == "active":
        camp = db.query(Campaign).order_by(Campaign.created_at.desc()).first()
        if not camp:
            camp = get_active_campaign(db)
    else:
        camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()

    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    updated_slots = []
    for item in updates:
        slot_num = item.get("slot_number") or item.get("slotNumber")
        if slot_num is None:
            continue
        slot = db.query(Slot).filter(Slot.campaign_id == camp.id, Slot.slot_number == int(slot_num)).first()
        if not slot:
            continue
        # The category travels with the advertiser, not with the box. Moving a
        # dentist into the hero makes the hero the dentistry slot; the box keeps
        # its size and its price, which belong to the paper.
        if "category_id" in item or "categoryId" in item:
            slot.category_id = int(item.get("category_id") or item.get("categoryId"))
        if "category_name" in item or "categoryName" in item:
            slot.category_name = item.get("category_name") or item.get("categoryName")
        if "business_address" in item or "businessAddress" in item:
            slot.business_address = item.get("business_address") or item.get("businessAddress")
        if "business_name" in item or "businessName" in item:
            slot.business_name = item.get("business_name") or item.get("businessName")
        if "status" in item:
            slot.status = item["status"]
        if "offer_headline" in item or "offerHeadline" in item:
            slot.offer_headline = item.get("offer_headline") or item.get("offerHeadline")
        if "logo_url" in item or "logoUrl" in item:
            slot.logo_url = item.get("logo_url") or item.get("logoUrl")
        if "contact_person" in item or "contactPerson" in item:
            slot.contact_person = item.get("contact_person") or item.get("contactPerson")
        if "phone" in item:
            slot.phone = item["phone"]
        if "scan_count" in item or "scanCount" in item:
            slot.scan_count = item.get("scan_count") if "scan_count" in item else item.get("scanCount", slot.scan_count)
        if "price_usd" in item or "priceUsd" in item:
            slot.price_usd = float(item.get("price_usd") if "price_usd" in item else item.get("priceUsd"))
        if "avg_ticket_usd" in item or "avgTicketUsd" in item:
            slot.avg_ticket_usd = float(item.get("avg_ticket_usd") if "avg_ticket_usd" in item else item.get("avgTicketUsd"))
        updated_slots.append(slot)

    db.commit()
    for s in updated_slots:
        db.refresh(s)

    all_slots = db.query(Slot).filter(Slot.campaign_id == camp.id).all()
    camp.target_gross_revenue = sum(s.price_usd for s in all_slots)
    camp.net_margin_est = max(0.0, camp.target_gross_revenue - camp.operating_cost_est)
    camp.total_collected_usd = sum(s.price_usd for s in all_slots if s.status == "PAID")
    paid_count = len([s for s in all_slots if s.status == "PAID"])
    if paid_count >= 14:
        camp.status = "LOCKED_READY"
    elif camp.status != "CURATED":
        camp.status = "PROSPECTING"
    db.commit()
    db.refresh(camp)
    db.commit()

    return updated_slots


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(campaign_id: str, db: Session = Depends(get_db)):
    """
    Destroy a campaign and everything hanging off it.

    The two worlds have different rules here, because they hold different
    things. A DEMO campaign is practice and can always go: the drawer promises
    that nothing there has consequences, and a rule that contradicts that
    promise is worse than no rule.

    A LIVE campaign is a business record, but only once money has actually moved
    or the drop has been printed. Those two are irreversible and are refused with
    a 409 that says to archive instead.

    A reserved or negotiating slot is not one of them: it is a name typed into a
    box, and an abandoned campaign carrying one has to be removable or it sits in
    the drawer forever. Curated households are not one either — an audience can
    always be cut again. Both are covered by the confirmation in the interface.
    """
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id} not found")

    if (camp.mode or "DEMO").upper() == "LIVE":
        paid = [s for s in camp.slots if s.status == "PAID"]
        if paid or camp.status in PRODUCTION_STATUSES:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"This campaign already holds money or print: {len(paid)} paid "
                    f"slot(s), status {camp.status}. Archive it instead."
                ),
            )

    # Households are not in the ORM cascade; slots and leads are cleared here so
    # no orphan rows are left behind pointing at a campaign that is gone.
    db.query(Household).filter(Household.campaign_id == camp.id).delete()
    db.query(Lead).filter(Lead.campaign_id == camp.id).delete()
    db.query(AnalyticsEvent).filter(AnalyticsEvent.campaign_id == camp.id).delete()
    db.query(CampaignRoute).filter(CampaignRoute.campaign_id == camp.id).delete()
    db.delete(camp)
    db.commit()
    return None


@router.post("/{campaign_id}/reset-slots", response_model=CampaignResponse)
def reset_slot_layout(
    campaign_id: str,
    wipe: bool = Query(False, description="Also empty every box: a blank card, as on day one"),
    db: Session = Depends(get_db),
):
    """
    Put every niche back in the box it was designed for.

    The advertiser travels with their niche, so this is not a wipe: whoever is
    sold as the dentistry goes back to the hero with their name, their headline
    and their payment intact. Only the arrangement returns to the factory
    layout. Prices and sizes never moved in the first place — they belong to the
    paper — so they are left exactly as the operator set them.
    """
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id} not found")

    home = {num: (num, cat_name) for num, cat_name, *_ in INITIAL_SLOT_DEFS}

    if wipe:
        # A blank card, as on day one. This throws away advertisers, headlines
        # and recorded payments, so it is a rehearsal tool: in the live file
        # those are business records, not clutter.
        if (camp.mode or "DEMO").upper() != "DEMO":
            raise HTTPException(
                status_code=409,
                detail=(
                    "Solo en modo simulación. Vaciar los espacios borraría comercios y "
                    "cobros registrados, que en el archivo real son documentación."
                ),
            )
        for slot in camp.slots:
            cat_id, cat_name = home.get(slot.slot_number, (slot.slot_number, slot.category_name))
            slot.category_id = cat_id
            slot.category_name = cat_name
            slot.status = "VACANT"
            for field in (
                "business_name",
                "contact_person",
                "phone",
                "email",
                "website",
                "business_address",
                "logo_url",
                "offer_headline",
                "payment_ref",
                "paid_at",
            ):
                setattr(slot, field, None)
            slot.avg_ticket_usd = 0.0
            slot.amount_collected_usd = 0.0
            slot.scan_count = 0
        camp.status = "PROSPECTING"
        db.commit()
        db.refresh(camp)
        return _populate_campaign_computed(camp, db)
    # What each niche is carrying right now, keyed by niche.
    carried = {
        s.category_id: {
            "business_name": s.business_name,
            "contact_person": s.contact_person,
            "phone": s.phone,
            "email": s.email,
            "website": s.website,
            "business_address": s.business_address,
            "status": s.status,
            "logo_url": s.logo_url,
            "offer_headline": s.offer_headline,
            "avg_ticket_usd": s.avg_ticket_usd,
            "payment_ref": s.payment_ref,
            "paid_at": s.paid_at,
            "amount_collected_usd": s.amount_collected_usd,
            "scan_count": s.scan_count,
        }
        for s in camp.slots
    }

    for slot in camp.slots:
        cat_id, cat_name = home.get(slot.slot_number, (slot.slot_number, slot.category_name))
        slot.category_id = cat_id
        slot.category_name = cat_name
        payload = carried.get(cat_id)
        if payload is None:
            continue
        for field, value in payload.items():
            setattr(slot, field, value)

    db.commit()
    db.refresh(camp)
    return _populate_campaign_computed(camp, db)
