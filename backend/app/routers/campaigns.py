from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Campaign, Slot
from ..schemas import CampaignCreate, CampaignResponse, SlotUpdate, SlotResponse

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])

INITIAL_SLOT_DEFS = [
    (1, "Odontología Familiar", "FRONT", "HERO", 9.0, 3.2, 850.0),
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
    (14, "Agencia de Seguros", "BACK", "MEDIUM_BACK", 4.3, 3.6, 450.0)
]

@router.post("/", response_model=CampaignResponse)
def create_campaign(req: CampaignCreate, db: Session = Depends(get_db)):
    code = f"IE-{req.target_city[:4].upper()}-{req.target_zip}"
    camp = Campaign(
        id=f"camp_{code.lower()}",
        code=code,
        name=req.name,
        target_city=req.target_city,
        target_zip=req.target_zip,
        radius_miles=req.radius_miles,
        target_households=5000,
        target_gross_revenue=7264.0,
        operating_cost_est=3000.0,
        net_margin_est=4264.0,
        status="PROSPECTING"
    )
    db.add(camp)
    db.flush()

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
            price_usd=price,
            status="VACANT"
        )
        db.add(s)

    db.commit()
    db.refresh(camp)
    return camp

@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign(campaign_id: str, db: Session = Depends(get_db)):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    paid_slots = [s for s in camp.slots if s.status == "PAID"]
    camp.paid_count = len(paid_slots)
    camp.total_collected_usd = sum(s.price_usd for s in paid_slots)
    return camp

@router.patch("/{campaign_id}/slots/{slot_number}", response_model=SlotResponse)
def update_slot(campaign_id: str, slot_number: int, req: SlotUpdate, db: Session = Depends(get_db)):
    slot = db.query(Slot).filter(Slot.campaign_id == campaign_id, Slot.slot_number == slot_number).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(slot, key, value)
    
    db.commit()
    db.refresh(slot)
    return slot
