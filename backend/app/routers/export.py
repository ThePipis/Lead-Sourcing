import io
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
import pandas as pd
from ..database import get_db
from ..models import Campaign, Household, Slot, AnalyticsEvent
from ..services.postal_export_service import PostalExportService

router = APIRouter(tags=["Export & QR Tracking"])

@router.get("/export/{campaign_id}/manifest.csv")
def download_postal_manifest(campaign_id: str, db: Session = Depends(get_db)):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        camp = db.query(Campaign).filter(Campaign.code.ilike(f"%{campaign_id}%")).first()
    if not camp:
        camp = db.query(Campaign).order_by(Campaign.created_at.desc()).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    households = db.query(Household).filter(
        Household.campaign_id == camp.id,
        Household.selected_for_drop == True
    ).all()

    # Si aún no se ha ejecutado la curación, generar el pool de 5,000 hogares certificados al vuelo
    if not households:
        from ..services.propensity_engine import PropensityEngine
        engine = PropensityEngine()
        df_pool = engine.generate_synthetic_pool(
            city=camp.target_city or "Eastvale",
            zip_code=camp.target_zip or "92880",
            n=max(15000, (camp.target_households or 5000) * 3),
            id_scope=camp.id,
        )
        top_5k, _ = engine.run_curation(
            df_pool, target_cutoff=camp.target_households or 5000
        )
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

        households = db.query(Household).filter(
            Household.campaign_id == camp.id,
            Household.selected_for_drop == True
        ).all()

    csv_content = PostalExportService.build_manifest_csv(households)
    filename = (
        f"production_manifest_{campaign_id}_"
        f"{camp.target_households or len(households)}_ActionMail.csv"
    )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/export/{campaign_id}/preview")
def preview_postal_manifest(campaign_id: str, limit: int = 10, db: Session = Depends(get_db)):
    """Returns the first 10 rows of the certified postal manifest for preview."""
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        camp = db.query(Campaign).filter(Campaign.code.ilike(f"%{campaign_id}%")).first()
    if not camp:
        camp = db.query(Campaign).order_by(Campaign.created_at.desc()).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    households = db.query(Household).filter(
        Household.campaign_id == camp.id,
        Household.selected_for_drop == True
    ).all()

    if not households:
        from ..services.propensity_engine import PropensityEngine
        engine = PropensityEngine()
        df_pool = engine.generate_synthetic_pool(
            city=camp.target_city or "Eastvale",
            zip_code=camp.target_zip or "92880",
            n=max(15000, (camp.target_households or 5000) * 3),
            id_scope=camp.id,
        )
        top_5k, _ = engine.run_curation(
            df_pool, target_cutoff=camp.target_households or 5000
        )
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

        households = db.query(Household).filter(
            Household.campaign_id == camp.id,
            Household.selected_for_drop == True
        ).all()

    all_rows = PostalExportService.build_manifest_rows(households)
    return {
        "campaign_id": campaign_id,
        "filename": (
            f"production_manifest_{campaign_id}_"
            f"{camp.target_households or len(households)}_ActionMail.csv"
        ),
        "total_records": len(all_rows),
        "preview_count": min(limit, len(all_rows)),
        "columns": [
            "RECORD_ID",
            "ENDORSEMENT_LINE",
            "PRIMARY_ADDRESS",
            "CITY",
            "STATE",
            "ZIP_CODE",
            "ZIP4",
            "CARRIER_ROUTE",
            "WALK_SEQUENCE",
            "HOUSEHOLD_SCORE"
        ],
        "rows": all_rows[:limit]
    }

@router.get("/r/{campaign_id}/{business_slug}")
def redirect_qr_code(campaign_id: str, business_slug: str, request: Request, db: Session = Depends(get_db)):
    """Dynamic short URL redirect with scan analytics tracking."""
    slot = db.query(Slot).filter(Slot.campaign_id == campaign_id).first()
    
    # Log analytics scan event
    event = AnalyticsEvent(
        id=f"scan_{campaign_id}_{business_slug}_{int(request.state.timestamp if hasattr(request.state, 'timestamp') else 1)}",
        campaign_id=campaign_id,
        slot_number=slot.slot_number if slot else 1,
        business_name=business_slug,
        device_type="Mobile",
        city="Eastvale",
        user_agent=request.headers.get("user-agent", "")
    )
    db.add(event)
    if slot:
        slot.scan_count += 1
    db.commit()

    destination = slot.website if (slot and slot.website) else "https://coop-mail.inlandempire.direct/offer"
    return RedirectResponse(url=destination, status_code=302)
