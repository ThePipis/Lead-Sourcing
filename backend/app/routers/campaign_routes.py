"""
The campaign's audience, as carrier routes.

Planning writes the whole candidate set for a ZIP and marks the ones that cover
the target; toggling a route moves it in or out of the drop. Everything
downstream — the household count printed on the card, the postage in the ledger,
the manifest the lettershop receives — reads from what is stored here.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Campaign, CampaignRoute
from ..services import census_service, eddm_service

router = APIRouter(prefix="/campaigns", tags=["Campaign Routes"])


class RouteToggle(BaseModel):
    selected: bool


def _campaign(db: Session, campaign_id: str) -> Campaign:
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id} not found")
    return camp


def _serialize(rows: List[CampaignRoute]) -> dict:
    selected = [r for r in rows if r.selected]
    return {
        "routes": [
            {
                "route_id": r.route_id,
                "zip_code": r.zip_code,
                "crid": r.crid,
                "type": r.route_type,
                "city_state": r.city_state,
                "residential": r.residential,
                "business": r.business,
                "median_income": r.median_income,
                "avg_household_size": r.avg_household_size,
                "score": r.score,
                "facility": r.facility,
                "census_enriched": bool(r.census_enriched),
                "selected": bool(r.selected),
            }
            for r in sorted(rows, key=lambda x: (-x.score, -x.residential))
        ],
        "covered": sum(r.residential for r in selected),
        "selected_routes": len(selected),
        "available": sum(r.residential for r in rows),
        "available_routes": len(rows),
        "census_enriched": any(r.census_enriched for r in rows),
    }


@router.get("/{campaign_id}/routes")
def read_routes(campaign_id: str, db: Session = Depends(get_db)):
    _campaign(db, campaign_id)
    rows = db.query(CampaignRoute).filter(CampaignRoute.campaign_id == campaign_id).all()
    return _serialize(rows)


@router.post("/{campaign_id}/routes/plan")
async def plan_routes(
    campaign_id: str,
    zip_code: str = Query("", alias="zip"),
    target: int = Query(0, ge=0, le=200000),
    db: Session = Depends(get_db),
):
    """
    Score every route in the ZIP and mark the best ones until the target is
    covered. Replaces any previous plan for this campaign: re-planning is how
    the operator changes their mind, and two overlapping plans would be a way to
    mail the same box twice.
    """
    camp = _campaign(db, campaign_id)
    zip_code = zip_code or camp.target_zip
    target = target or camp.target_households or 5000

    try:
        routes = await eddm_service.fetch_routes(zip_code)
    except eddm_service.EddmError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Optional by design: no key, no network or no coverage leaves the routes
    # scored on the USPS variables instead of failing the request.
    try:
        enriched_count = await census_service.enrich_routes(routes)
    except Exception as e:
        print(f"[Routes] census enrichment skipped: {e}")
        enriched_count = 0

    scored = eddm_service.score_routes(routes)
    selection = eddm_service.select_routes(scored, target)
    chosen = {r["route_id"] for r in selection["routes"]}

    db.query(CampaignRoute).filter(CampaignRoute.campaign_id == campaign_id).delete()
    for r in scored:
        db.add(
            CampaignRoute(
                campaign_id=campaign_id,
                route_id=r["route_id"],
                zip_code=r["zip_code"],
                crid=r["crid"],
                route_type=r["type"],
                city_state=r["city_state"],
                residential=r["residential"],
                business=r["business"],
                median_income=r["median_income"],
                avg_household_size=r["avg_household_size"],
                score=r["score"],
                facility=r["facility"],
                census_enriched=r.get("owner_occupied") is not None,
                selected=r["route_id"] in chosen,
            )
        )
    db.commit()

    rows = db.query(CampaignRoute).filter(CampaignRoute.campaign_id == campaign_id).all()
    payload = _serialize(rows)
    payload["target"] = target
    payload["zip_code"] = zip_code
    payload["census_routes"] = enriched_count
    return payload


@router.patch("/{campaign_id}/routes/{route_id}")
def toggle_route(
    campaign_id: str,
    route_id: str,
    req: RouteToggle,
    db: Session = Depends(get_db),
):
    _campaign(db, campaign_id)
    row = (
        db.query(CampaignRoute)
        .filter(CampaignRoute.campaign_id == campaign_id, CampaignRoute.route_id == route_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Route {route_id} is not in this campaign")
    row.selected = req.selected
    db.commit()

    rows = db.query(CampaignRoute).filter(CampaignRoute.campaign_id == campaign_id).all()
    return _serialize(rows)


@router.get("/{campaign_id}/routes/manifest.csv")
def route_manifest(campaign_id: str, db: Session = Depends(get_db)):
    """The order for the lettershop: the selected routes and their counts."""
    camp = _campaign(db, campaign_id)
    rows = (
        db.query(CampaignRoute)
        .filter(CampaignRoute.campaign_id == campaign_id, CampaignRoute.selected == True)  # noqa: E712
        .all()
    )
    if not rows:
        raise HTTPException(
            status_code=409,
            detail="No hay rutas seleccionadas todavía: ejecuta el motor de rutas primero.",
        )

    selection = {
        "routes": [
            {
                "zip_code": r.zip_code,
                "crid": r.crid,
                "type": r.route_type,
                "city_state": r.city_state,
                "residential": r.residential,
                "business": r.business,
                "median_income": r.median_income,
                "avg_household_size": r.avg_household_size,
                "score": r.score,
                "facility": r.facility,
            }
            for r in sorted(rows, key=lambda x: (-x.score, -x.residential))
        ],
        "covered": sum(r.residential for r in rows),
        "route_count": len(rows),
    }
    csv_text = eddm_service.build_route_manifest_csv(selection)
    filename = f"eddm_routes_{camp.code}_{selection['covered']}.csv"
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
