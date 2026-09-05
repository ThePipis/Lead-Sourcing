from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Campaign, Household, Slot
from ..schemas import CurationRequest, CurationSummaryResponse
from ..services.propensity_engine import PropensityEngine

router = APIRouter(prefix="/curation", tags=["Curation Engine"])
engine = PropensityEngine()

@router.post("/execute", response_model=CurationSummaryResponse)
def execute_curation(req: CurationRequest, db: Session = Depends(get_db)):
    camp = db.query(Campaign).filter(Campaign.id == req.campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Enforce Business Rule: Campaign must have >= 12 paid slots (or 14)
    paid_count = db.query(Slot).filter(Slot.campaign_id == camp.id, Slot.status == "PAID").count()
    if paid_count < 12:
        raise HTTPException(
            status_code=400,
            detail=f"Cash Rule Violation: Campaign has only {paid_count}/14 PAID slots. Minimum 12 paid slots required to unlock algorithmic curation."
        )

    # Generate synthetic pool of 15k households or fetch from Data Axle in live mode
    df_pool = engine.generate_synthetic_pool(
        city=camp.target_city,
        zip_code=camp.target_zip,
        n=req.synthetic_pool_size
    )

    top_5k, summary = engine.run_curation(df_pool, target_cutoff=req.target_count)

    # Persist top households in database
    db.query(Household).filter(Household.campaign_id == camp.id).delete()
    for _, r in top_5k.iterrows():
        hh = Household(
            id=r["household_id"],
            campaign_id=camp.id,
            resident_name=r["resident_name"],
            street_address=r["street_address"],
            city=r["city"],
            state=r["state"],
            zip5=r["zip5"],
            zip4=r["zip4"],
            carrier_route=r["carrier_route"],
            walk_sequence=int(r["walk_sequence"]),
            income_score=float(r["income_score"]),
            home_ownership_score=float(r["home_ownership_score"]),
            home_age_years=int(r["home_age_years"]),
            home_age_score=float(r["home_age_score"]),
            children_present_score=float(r["children_present_score"]),
            vehicles_count=int(r["vehicles_count"]),
            vehicles_score=float(r["vehicles_score"]),
            pet_owner_score=float(r["pet_owner_score"]),
            home_value_score=float(r["home_value_score"]),
            composite_score=float(r["composite_score"]),
            selected_for_drop=True
        )
        db.add(hh)

    camp.status = "CURATED"
    db.commit()

    return CurationSummaryResponse(
        campaign_id=camp.id,
        total_analyzed=summary["total_analyzed"],
        total_selected=summary["total_selected"],
        min_score=summary["min_score"],
        max_score=summary["max_score"],
        avg_score=summary["avg_score"],
        carrier_route_breakdown=summary["carrier_route_breakdown"],
        category_synergies=[],
        histogram=summary["histogram"]
    )
