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
from ..services import census_service, eddm_service, parcel_service
from .datasources import is_source_enabled

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
                "scored_on": [v for v in (r.scored_on or "").split(",") if v],
                "income_source": r.income_source or "",
                "size_source": r.size_source or "",
                "selected": bool(r.selected),
            }
            for r in sorted(rows, key=lambda x: (-x.score, -x.residential))
        ],
        "covered": sum(r.residential for r in selected),
        "selected_routes": len(selected),
        "available": sum(r.residential for r in rows),
        "available_routes": len(rows),
        "census_enriched": any(r.census_enriched for r in rows),
        "weights": eddm_service.WEIGHTS,
        "household_size_nudge": 0.10,
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
    allow_degraded: bool = Query(
        False,
        description="Plan even if the census did not answer, scoring on fewer variables",
    ),
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

    # The census is not optional any more.
    #
    # USPS publishes no income and no household size in any of the operator's
    # microzones, so four of the six variables — and the heaviest of them — come
    # from the census alone. Scoring without it does not produce a slightly
    # worse plan, it produces a different product sold under the same name. So
    # a census that cannot answer stops the plan here, before anything is
    # written, and says which of the three things went wrong. `allow_degraded`
    # is the deliberate way past, for an outage with a drop already sold.
    census_on = is_source_enabled(db, "CENSUS_ACS", camp.mode)
    enriched_count = 0
    if census_on:
        try:
            enriched_count = await census_service.enrich_routes(routes)
        except Exception as e:
            print(f"[Routes] census enrichment failed: {e}")

    if enriched_count == 0 and not allow_degraded:
        problem = (
            await census_service.diagnose()
            if census_on
            else {"status": "DISABLED", "detail": "El Census (ACS) está desactivado en Configuración → Fuentes de datos."}
        )
        raise HTTPException(
            status_code=424,
            detail={
                "reason": problem["status"],
                "message": problem["detail"],
                "zip": zip_code,
                "routes_found": len(routes),
            },
        )

    scored = eddm_service.score_routes(routes)
    selection = eddm_service.select_routes(scored, target)
    chosen = {r["route_id"] for r in selection["routes"]}

    db.query(CampaignRoute).filter(CampaignRoute.campaign_id == campaign_id).delete()
    # A new plan supersedes the old acknowledgement. Leaving it would leave a
    # campaign flagged as planned-on-an-incomplete-model after the very re-run
    # that fixed it, which teaches the operator to ignore the flag.
    camp.model_ack = None
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
                scored_on=",".join(r.get("scored_on") or []),
                income_source=r.get("income_source") or ("USPS" if r["median_income"] else ""),
                size_source=r.get("size_source") or ("USPS" if r["avg_household_size"] else ""),
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
                "income_source": r.income_source or "",
                "avg_household_size": r.avg_household_size,
                "size_source": r.size_source or "",
                "score": r.score,
                "scored_on": [v for v in (r.scored_on or "").split(",") if v],
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


@router.get("/{campaign_id}/routes/profile")
async def route_profile(campaign_id: str, db: Session = Depends(get_db)):
    """
    What the selected routes are built of, from the county parcel roll.

    This is evidence for the advertiser, never a mailing list: the drop is a
    saturation drop and reaches every box on the route regardless. `profile`
    comes back null when the county did not answer, so the interface can say
    "unavailable" instead of printing a figure nobody checked.
    """
    _campaign(db, campaign_id)
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

    profile = await parcel_service.route_profile(
        rows[0].zip_code, [r.route_id for r in rows]
    )
    return {"profile": profile, "available": profile is not None}
