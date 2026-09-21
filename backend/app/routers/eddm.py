"""
Route selection: the open stack's answer to a bought consumer list.

For a saturation drop the deliverable the mail house needs is not a list of
people, it is a list of carrier routes with their official counts. This router
produces exactly that, scored and ranked, from data that costs nothing.
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ..services import census_service, eddm_service

router = APIRouter(prefix="/eddm", tags=["EDDM Route Engine"])


@router.get("/{zip_code}/routes")
async def scored_routes(
    zip_code: str,
    target: int = Query(5000, ge=100, le=200000),
    include_business: bool = False,
):
    """Every route in the ZIP, scored, with the top ones marked as selected."""
    if not zip_code.isdigit() or len(zip_code) != 5:
        raise HTTPException(status_code=422, detail="El ZIP debe tener 5 dígitos")
    try:
        routes = await eddm_service.fetch_routes(zip_code, include_business)
    except eddm_service.EddmError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # The census pass is optional by design: it needs a key, a network and a
    # survey that covers the ZIP. Any of those missing leaves the routes scored
    # on what USPS publishes, which the response reports rather than hiding.
    try:
        enriched = await census_service.enrich_routes(routes)
    except Exception as e:  # never let the enrichment take the engine down
        print(f"[EDDM] census enrichment skipped: {e}")
        enriched = 0

    scored = eddm_service.score_routes(routes)
    selection = eddm_service.select_routes(scored, target)
    chosen = {r["route_id"] for r in selection["routes"]}

    return {
        "zip_code": zip_code,
        "target": target,
        "covered": selection["covered"],
        "route_count": selection["route_count"],
        "cutoff_score": selection["cutoff_score"],
        "available": selection["available"],
        "available_routes": selection["available_routes"],
        # Whether the census enrichment ran. False means the score rests on the
        # variables USPS publishes, which is stated rather than implied.
        "census_enriched": enriched > 0,
        "census_routes": enriched,
        "routes": [
            {k: v for k, v in dict(r, selected=r["route_id"] in chosen).items() if k != "paths"}
            for r in scored
        ],
    }


@router.get("/{zip_code}/manifest.csv")
async def route_manifest(
    zip_code: str,
    target: int = Query(5000, ge=100, le=200000),
):
    """The order for the lettershop: routes, counts and the endorsement."""
    try:
        routes = await eddm_service.fetch_routes(zip_code)
    except eddm_service.EddmError as e:
        raise HTTPException(status_code=502, detail=str(e))

    selection = eddm_service.select_routes(eddm_service.score_routes(routes), target)
    csv_text = eddm_service.build_route_manifest_csv(selection)
    filename = f"eddm_route_manifest_{zip_code}_{selection['covered']}.csv"
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{zip_code}/floor")
async def reach_floor(zip_code: str):
    """
    The smallest drop this ZIP can physically take.

    A carrier does not deliver to part of a route. The smallest saturation drop
    in a ZIP is therefore its smallest route, and a target below that number is
    a target the postal service cannot honour: ask for five households and the
    carrier still walks all 729 boxes of the route that covers them.

    The interface uses this as the floor of the reach field, so the number the
    operator types is a number the drop can actually be.
    """
    if not zip_code.isdigit() or len(zip_code) != 5:
        raise HTTPException(status_code=422, detail="El ZIP debe tener 5 dígitos")
    try:
        routes = await eddm_service.fetch_routes(zip_code)
    except eddm_service.EddmError as e:
        raise HTTPException(status_code=502, detail=str(e))

    counts = sorted(r["residential"] for r in routes if r["residential"] > 0)
    if not counts:
        raise HTTPException(status_code=404, detail=f"El USPS no reporta rutas para {zip_code}")

    return {
        "zip_code": zip_code,
        "smallest_route": counts[0],
        "largest_route": counts[-1],
        "median_route": counts[len(counts) // 2],
        "routes": len(counts),
        "total_households": sum(counts),
    }
