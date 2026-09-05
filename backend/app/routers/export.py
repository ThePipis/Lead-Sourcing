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
        raise HTTPException(status_code=404, detail="Campaign not found")

    households = db.query(Household).filter(
        Household.campaign_id == campaign_id,
        Household.selected_for_drop == True
    ).all()

    if not households:
        raise HTTPException(status_code=400, detail="Audience not curated yet. Run curation engine first.")

    # Convert to pandas DataFrame for normalization & sorting
    data = [{
        "household_id": h.id,
        "resident_name": h.resident_name,
        "street_address": h.street_address,
        "city": h.city,
        "state": h.state,
        "zip5": h.zip5,
        "zip4": h.zip4,
        "carrier_route": h.carrier_route,
        "walk_sequence": h.walk_sequence,
        "composite_score": h.composite_score
    } for h in households]

    df = pd.DataFrame(data)
    csv_content = PostalExportService.build_manifest_csv(df)

    filename = f"production_manifest_{camp.code}_5000_ActionMail.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

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
