"""
The route propensity engine: which carrier routes to saturate, and why.

A cooperative jumbo card is delivered by saturation under ECRWSS — every box on
a route, addressed to "Postal Customer". So the question is never *which person*
lives somewhere; it is *which routes are worth the postage*. That reframing is
what makes a licensed consumer file unnecessary for the mailing itself, and it
is the whole point of this module.

Three things the original plan assumed turned out to be different in the data,
and the engine is built on what the data actually is:

1. **EDDM routes are polylines, not polygons.** The plan's areal-weighted
   interpolation — Area(Route ∩ BlockGroup) / Area(BlockGroup) — cannot be
   computed against a line, which has no area. What the enrichment does instead
   is ask TIGERweb which block groups the line crosses and average their values
   weighted by *occupied housing units*. That is a better denominator than area
   anyway: half a square mile of orange grove and half a square mile of
   townhouses do not contribute the same number of mailboxes to a route.

2. **USPS already publishes demographics per route.** The same endpoint that
   draws the map returns MED_INCOME, MED_AGE and AVG_HH_SIZ for every route,
   alongside the official residential delivery count. The heaviest variable in
   the plan's own weighting (income, 0.35) therefore needs no census join at
   all: the spatial interpolation was the most fragile step in the design, and
   for the main signal it is not needed.

3. **Reach snaps to routes.** You cannot saturate 5,000 households; you
   saturate whole routes, and the total is whatever those routes add up to.
   `select_routes` covers the target and reports the real number, which is the
   number the print run and the postage are actually billed on.

The census join is still worth doing for what USPS does not publish — owner
occupancy, single-family share, vehicles, home value — and that path needs the
free Census key. Until it is configured the engine scores on the USPS variables
and says so, rather than quietly scoring on nothing.
"""

import csv
import io
from typing import Dict, List, Optional

import httpx

# The endpoint the public EDDM map calls to draw its routes. It is not a
# documented API and USPS may change it without notice, so every failure is
# reported plainly and the operator can always import the route list by hand
# from the EDDM site instead.
EDDM_URL = "https://gis.usps.com/arcgis/rest/services/EDDM/selectZIP/GPServer/routes/execute"
USER_AGENT = "CoopDirectMail/1.0 (Inland Empire cooperative mailer)"

# ACS tops median household income out at this value; a route reported at the
# cap is at or above it, and normalising against it keeps the scale honest.
INCOME_CAP = 200001.0

# The weights the operator set, carried over unchanged where the variable
# exists. Income dominates because it is both the strongest signal for these
# fourteen niches and the one USPS publishes per route.
WEIGHTS = {
    "income": 0.35,
    "owner_occupied": 0.25,
    "single_family": 0.20,
    "vehicles": 0.10,
    "home_value": 0.10,
}

# Household size stands in for family presence, which is what the plan wanted
# from the age bands: a route averaging four people per home is a route of
# families, and that is what the dentist, the vet and the pizzeria are buying.
HOUSEHOLD_SIZE_FLOOR = 2.0
HOUSEHOLD_SIZE_CEILING = 4.5


class EddmError(RuntimeError):
    """USPS did not answer, or answered with something unusable."""


async def fetch_routes(zip_code: str, include_business: bool = False) -> List[dict]:
    """
    Every carrier route delivering to a ZIP, with its official counts.

    `Rte_Box=R` asks for residential routes; the box-only and business variants
    exist but a consumer saturation drop wants homes.
    """
    payload = {
        "f": "json",
        "env:outSR": "102100",
        "ZIP": zip_code,
        "Rte_Box": "B" if include_business else "R",
        "UserName": "EDDM",
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                EDDM_URL,
                data=payload,
                headers={"User-Agent": USER_AGENT},
            )
    except Exception as e:
        raise EddmError(f"No se pudo contactar al mapa EDDM del USPS: {e}") from e

    if resp.status_code != 200:
        raise EddmError(f"El mapa EDDM del USPS respondió HTTP {resp.status_code}")

    try:
        results = resp.json()["results"][0]["value"]["features"]
    except (KeyError, IndexError, ValueError) as e:
        raise EddmError(f"Respuesta inesperada del mapa EDDM: {e}") from e

    routes = []
    for feature in results:
        a = feature.get("attributes", {}) or {}
        if not a.get("ZIP_CRID"):
            continue
        routes.append(
            {
                "route_id": a["ZIP_CRID"],
                "zip_code": a.get("ZIP_CODE", zip_code),
                "crid": a.get("CRID_ID", ""),
                "type": a.get("TYPE", "R"),
                "city_state": a.get("CITY_STATE", ""),
                "residential": int(a.get("RES_CNT") or 0),
                "business": int(a.get("BUS_CNT") or 0),
                "total": int(a.get("TOT_CNT") or 0),
                "median_income": float(a.get("MED_INCOME") or 0.0),
                "median_age": float(a.get("MED_AGE") or 0.0),
                "avg_household_size": float(a.get("AVG_HH_SIZ") or 0.0),
                "facility": a.get("FACILITY_NAME") or a.get("FAC_NAME") or "",
                "dropship_key": a.get("DROPSHIP_KEY") or a.get("DS_KEY") or "",
                # Filled in by the census enrichment when a key is configured.
                "owner_occupied": None,
                "single_family": None,
                "vehicles": None,
                "home_value": None,
                # The route's line, kept only so the census join can ask which
                # block groups it crosses. Stripped before the response.
                "paths": (feature.get("geometry") or {}).get("paths") or [],
            }
        )
    if not routes:
        raise EddmError(f"El USPS no devolvió rutas residenciales para el ZIP {zip_code}")
    return routes


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def score_routes(routes: List[dict]) -> List[dict]:
    """
    Score every route on what is known about it, and say what that was based on.

    Weights are renormalised over the variables actually present, so a route
    scored on income and household size alone is still on a 0–100 scale and is
    comparable with the others. The alternative — treating a missing variable as
    a zero — would quietly punish routes for our lack of data.
    """
    for route in routes:
        parts: Dict[str, float] = {}

        if route["median_income"] > 0:
            parts["income"] = _clamp(route["median_income"] / INCOME_CAP)
        if route["owner_occupied"] is not None:
            parts["owner_occupied"] = _clamp(route["owner_occupied"])
        if route["single_family"] is not None:
            parts["single_family"] = _clamp(route["single_family"])
        if route["vehicles"] is not None:
            parts["vehicles"] = _clamp(route["vehicles"])
        if route["home_value"] is not None:
            parts["home_value"] = _clamp(route["home_value"])

        weight_sum = sum(WEIGHTS[k] for k in parts) or 1.0
        base = sum(WEIGHTS[k] * v for k, v in parts.items()) / weight_sum

        # Family density, from the household size USPS publishes. It nudges
        # rather than decides: ±10% around the base score.
        size = route["avg_household_size"]
        if size:
            spread = HOUSEHOLD_SIZE_CEILING - HOUSEHOLD_SIZE_FLOOR
            family = _clamp((size - HOUSEHOLD_SIZE_FLOOR) / spread)
            base = base * (0.9 + 0.2 * family)

        route["score"] = round(_clamp(base) * 100, 1)
        route["scored_on"] = sorted(parts.keys()) + (["household_size"] if size else [])
    routes.sort(key=lambda r: (-r["score"], -r["residential"]))
    return routes


def select_routes(routes: List[dict], target_households: int) -> dict:
    """
    Take routes from the top until the target is covered.

    A saturation drop buys whole routes, so the covered total overshoots the
    target rather than matching it. Reporting the overshoot is the point: the
    print run and the postage are billed on the real number, not on the round
    one the operator had in mind.
    """
    chosen: List[dict] = []
    covered = 0
    for route in routes:
        if covered >= target_households:
            break
        chosen.append(route)
        covered += route["residential"]

    cutoff = min((r["score"] for r in chosen), default=0.0)
    return {
        "target": target_households,
        "covered": covered,
        "routes": chosen,
        "route_count": len(chosen),
        "cutoff_score": cutoff,
        "available": sum(r["residential"] for r in routes),
        "available_routes": len(routes),
    }


# The columns a lettershop needs to book an EDDM drop. There is no household
# list here and there does not need to be one: the carrier delivers to every box
# on the route, so the route and its count are the order.
ROUTE_MANIFEST_COLUMNS = [
    "SEQ",
    "ZIP_CODE",
    "CARRIER_ROUTE",
    "ROUTE_TYPE",
    "CITY_STATE",
    "RESIDENTIAL_COUNT",
    "BUSINESS_COUNT",
    "ENDORSEMENT",
    "MEDIAN_INCOME",
    "AVG_HOUSEHOLD_SIZE",
    "PROPENSITY_SCORE",
    "DROP_FACILITY",
]


def build_route_manifest_csv(selection: dict) -> str:
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(ROUTE_MANIFEST_COLUMNS)
    for i, r in enumerate(selection["routes"], start=1):
        writer.writerow(
            [
                i,
                r["zip_code"],
                r["crid"],
                r["type"],
                r["city_state"],
                r["residential"],
                r["business"],
                "ECRWSS / POSTAL CUSTOMER",
                int(r["median_income"]) if r["median_income"] else "",
                r["avg_household_size"] or "",
                r["score"],
                r["facility"],
            ]
        )
    writer.writerow([])
    writer.writerow(
        [
            "TOTAL",
            "",
            f"{selection['route_count']} rutas",
            "",
            "",
            selection["covered"],
            sum(r["business"] for r in selection["routes"]),
            "",
            "",
            "",
            "",
            "",
        ]
    )
    return output.getvalue()


def demo() -> None:
    """Scoring and selection checks that need no network."""
    routes = [
        {
            "route_id": "92880R001", "zip_code": "92880", "crid": "R001", "type": "R",
            "city_state": "EASTVALE, CA", "residential": 600, "business": 0, "total": 600,
            "median_income": 200001.0, "median_age": 37.0, "avg_household_size": 4.2,
            "facility": "NORCO", "dropship_key": "",
            "owner_occupied": None, "single_family": None, "vehicles": None, "home_value": None,
        },
        {
            "route_id": "92880R002", "zip_code": "92880", "crid": "R002", "type": "R",
            "city_state": "EASTVALE, CA", "residential": 400, "business": 0, "total": 400,
            "median_income": 60000.0, "median_age": 30.0, "avg_household_size": 2.1,
            "facility": "NORCO", "dropship_key": "",
            "owner_occupied": None, "single_family": None, "vehicles": None, "home_value": None,
        },
    ]
    scored = score_routes([dict(r) for r in routes])
    assert scored[0]["route_id"] == "92880R001", scored
    assert scored[0]["score"] > scored[1]["score"]
    assert scored[0]["score"] <= 100.0

    # A target smaller than the first route still buys the whole route.
    sel = select_routes(scored, 100)
    assert sel["route_count"] == 1 and sel["covered"] == 600, sel

    # A target above everything available takes everything and says so.
    sel_all = select_routes(scored, 5000)
    assert sel_all["covered"] == 1000 and sel_all["covered"] < sel_all["target"]

    csv_text = build_route_manifest_csv(sel_all)
    assert "ECRWSS / POSTAL CUSTOMER" in csv_text
    assert csv_text.splitlines()[0].startswith("SEQ,ZIP_CODE,CARRIER_ROUTE")

    # A route with no income at all must not crash and must not win.
    blind = dict(routes[1], median_income=0.0, avg_household_size=0.0)
    assert score_routes([blind])[0]["score"] == 0.0
    print("eddm_service: ok")


if __name__ == "__main__":
    demo()
