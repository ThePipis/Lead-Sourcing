import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Campaign, Household, Slot
from ..schemas import CurationRequest, CurationSummaryResponse
from ..services.propensity_engine import PropensityEngine
from ..services import census_service

router = APIRouter(prefix="/curation", tags=["Curation Engine"])
default_engine = PropensityEngine()

@router.post("/execute", response_model=CurationSummaryResponse)
async def execute_curation(req: CurationRequest, db: Session = Depends(get_db)):
    camp = db.query(Campaign).filter(Campaign.id == req.campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Enforce Business Rule: Campaign must have >= 10 paid commercial slots (salvo en simulación/mock)
    paid_count = db.query(Slot).filter(Slot.campaign_id == camp.id, Slot.status == "PAID", Slot.slot_number != 32).count()
    if paid_count < 10 and not req.mock_mode:
        raise HTTPException(
            status_code=400,
            detail=f"Regla de Cobro: La campaña tiene solo {paid_count}/31 espacios PAGADOS. Se requiere un mínimo de 10 espacios pagados para desbloquear la curación algorítmica."
        )

    # Use custom weights matrix if provided, otherwise default taxonomy matrix
    if req.weights and len(req.weights) == 14:
        engine = PropensityEngine(weights_matrix=np.array(req.weights))
    else:
        engine = default_engine

    # The drop size is the campaign's, not a constant. The pool has to be
    # comfortably larger than the cut or "top N by propensity" selects almost
    # everything and stops meaning anything.
    target = req.target_count or camp.target_households or 5000
    pool_size = max(req.synthetic_pool_size or 0, target * 3)

    # Real demographics for this ZIP when a Census key is configured, so a
    # simulated audience is drawn from the neighbourhood's actual profile. The
    # survey is free; without a key the engine uses its built-in distributions.
    acs_profile = await census_service.zcta_profile(camp.target_zip)

    df_pool = engine.generate_synthetic_pool(
        city=camp.target_city,
        zip_code=camp.target_zip,
        n=pool_size,
        id_scope=camp.id,
        profile=acs_profile,
    )

    top_5k, summary = engine.run_curation(df_pool, target_cutoff=target)

    # Persist the cut atomically in SQLite
    db.query(Household).filter(Household.campaign_id == camp.id).delete()
    household_objs = [
        Household(
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
        for _, r in top_5k.iterrows()
    ]
    db.bulk_save_objects(household_objs)

    camp.status = "CURATED"
    db.commit()

    carrier_route_dist = [
        {
            "route": str(r.get("carrier_route") or r.get("route")),
            "count": int(r.get("count", 0)),
            "zip": camp.target_zip
        }
        for r in summary["carrier_route_breakdown"]
    ]

    summary_dict = {
        "totalAnalyzed": summary["total_analyzed"],
        "totalSelected": summary["total_selected"],
        "minScore": summary["min_score"],
        "maxScore": summary["max_score"],
        "avgScore": summary["avg_score"],
        "carrierRouteDistribution": carrier_route_dist,
        "categorySynergyBreakdown": summary.get("category_synergies", []),
        "scoreHistogram": summary["histogram"]
    }

    top_5k_records = []
    for _, r in top_5k.iterrows():
        top_5k_records.append({
            "id": r["household_id"],
            "residentName": r["resident_name"],
            "streetAddress": r["street_address"],
            "city": r["city"],
            "state": "CA",
            "zip5": r["zip5"],
            "zip4": r["zip4"],
            "carrierRoute": r["carrier_route"],
            "walkSequence": int(r["walk_sequence"]),
            "incomeScore": float(r["income_score"]),
            "homeOwnershipScore": float(r["home_ownership_score"]),
            "homeAgeYears": int(r["home_age_years"]),
            "homeAgeScore": float(r["home_age_score"]),
            "childrenPresentScore": float(r["children_present_score"]),
            "vehiclesCount": int(r["vehicles_count"]),
            "vehiclesScore": float(r["vehicles_score"]),
            "petOwnerScore": float(r["pet_owner_score"]),
            "homeValueScore": float(r["home_value_score"]),
            "matchScores": {},
            "compositeScore": float(r["composite_score"]),
            "selectedForDrop": True
        })

    return CurationSummaryResponse(
        campaign_id=camp.id,
        total_analyzed=summary["total_analyzed"],
        total_selected=summary["total_selected"],
        min_score=summary["min_score"],
        max_score=summary["max_score"],
        avg_score=summary["avg_score"],
        carrier_route_breakdown=summary["carrier_route_breakdown"],
        category_synergies=[],
        histogram=summary["histogram"],
        summary=summary_dict,
        top_5k=top_5k_records
    )
