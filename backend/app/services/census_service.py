"""
Real demographics for a microzone, free of charge, from the US Census Bureau.

The propensity engine needs to know what a neighbourhood actually looks like:
what it earns, how much of it owns its home, how old the houses are, how many
households have children. The American Community Survey publishes exactly that
per ZIP Code Tabulation Area, and the API is free — it only asks for a key.

This is what makes simulation mode worth something: the households are still
invented, but the distribution they are drawn from is the real one for that ZIP,
so a practice run behaves like the real drop instead of like Eastvale forever.

Without a key the profile is simply absent and the engine keeps its built-in
distributions. Nothing here ever invents a figure and calls it Census data.
"""

import asyncio
import json
import os
from typing import Dict, List, Optional

import httpx

# ACS 5-year estimates. The 5-year release is the one published for every ZCTA,
# including the small ones a microzone is made of.
ACS_YEARS = (2023, 2022)
BASE_URL = "https://api.census.gov/data/{year}/acs/acs5"

VARIABLES = {
    "B19013_001E": "median_household_income",
    "B25003_001E": "occupied_units",
    "B25003_002E": "owner_occupied_units",
    "B25035_001E": "median_year_built",
    "B11005_001E": "households_total",
    "B11005_002E": "households_with_children",
    "B25044_001E": "vehicle_households",
    "B25044_003E": "owner_no_vehicle",
    "B25044_010E": "renter_no_vehicle",
}

# ACS uses large negative sentinels for "no estimate available".
MISSING_THRESHOLD = -999999

_cache: Dict[str, Optional[dict]] = {}


def api_key() -> str:
    return (os.getenv("CENSUS_API_KEY", "") or "").strip().strip('"')


def is_configured() -> bool:
    key = api_key()
    return bool(key) and key not in ("mock_census_key", "")


def _to_float(raw) -> Optional[float]:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return None if value <= MISSING_THRESHOLD else value


def _profile_from_row(header: list, row: list, zip_code: str) -> dict:
    raw = {VARIABLES[h]: _to_float(v) for h, v in zip(header, row) if h in VARIABLES}

    occupied = raw.get("occupied_units") or 0
    owner = raw.get("owner_occupied_units") or 0
    households = raw.get("households_total") or 0
    with_children = raw.get("households_with_children") or 0
    veh_households = raw.get("vehicle_households") or 0
    no_vehicle = (raw.get("owner_no_vehicle") or 0) + (raw.get("renter_no_vehicle") or 0)
    median_year = raw.get("median_year_built")

    return {
        "zip5": zip_code,
        "median_household_income": raw.get("median_household_income"),
        "home_ownership_rate": round(owner / occupied, 4) if occupied else None,
        "children_rate": round(with_children / households, 4) if households else None,
        "median_year_built": int(median_year) if median_year else None,
        "vehicle_rate": (
            round(1 - no_vehicle / veh_households, 4) if veh_households else None
        ),
        "households_total": int(households) if households else None,
        "source": "US Census Bureau, American Community Survey 5-year estimates",
    }


async def zcta_profile(zip_code: str) -> Optional[dict]:
    """
    The ACS profile for one ZIP, or None when it cannot be obtained.

    None is a normal answer: no key configured, no network, or a ZIP the survey
    has no estimate for. Callers fall back to their own distributions.
    """
    if zip_code in _cache:
        return _cache[zip_code]
    if not is_configured():
        _cache[zip_code] = None
        return None

    params_base = {
        "get": ",".join(["NAME", *VARIABLES.keys()]),
        "for": f"zip code tabulation area:{zip_code}",
        "key": api_key(),
    }

    for year in ACS_YEARS:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(BASE_URL.format(year=year), params=params_base)
            if resp.status_code != 200:
                print(f"[Census] ACS {year} HTTP {resp.status_code}")
                continue
            payload = resp.json()
        except Exception as e:  # network, JSON, redirect to the missing-key page
            print(f"[Census] ACS {year} request error: {e}")
            continue

        if not isinstance(payload, list) or len(payload) < 2:
            continue
        profile = _profile_from_row(payload[0], payload[1], zip_code)
        profile["acs_year"] = year
        _cache[zip_code] = profile
        return profile

    _cache[zip_code] = None
    return None


def demo() -> None:
    """Parsing check that needs no key and no network."""
    header = ["NAME", *VARIABLES.keys(), "zip code tabulation area"]
    row = [
        "ZCTA5 92880",
        "142500",  # median income
        "14000",  # occupied units
        "11480",  # owner occupied
        "2004",  # median year built
        "13800",  # households
        "7314",  # with children
        "14000",  # vehicle households
        "140",  # owner, no vehicle
        "70",  # renter, no vehicle
        "92880",
    ]
    p = _profile_from_row(header, row, "92880")
    assert p["home_ownership_rate"] == 0.82, p
    assert p["children_rate"] == 0.53, p
    assert p["median_year_built"] == 2004
    assert p["vehicle_rate"] == 0.985, p
    assert p["median_household_income"] == 142500

    # A suppressed estimate must come back as None, never as -666666666.
    suppressed = _profile_from_row(
        ["B19013_001E", "B25003_001E"], ["-666666666", "0"], "99999"
    )
    assert suppressed["median_household_income"] is None
    assert suppressed["home_ownership_rate"] is None
    print("census_service: ok")


if __name__ == "__main__":
    demo()


# --- Block-group enrichment for the route engine -----------------------------
#
# What USPS does not publish per route, the ACS does publish per block group.
# The join is: ask TIGERweb which block groups a route's line crosses, then
# average their values weighted by occupied housing units.
#
# Weighting by households rather than by area is deliberate. The original design
# called for areal weighting, but an EDDM route is a polyline with no area, and
# even where area exists it is the wrong denominator: half a square mile of
# orange grove and half a square mile of townhouses do not contribute equally to
# a mail route. Occupied units are what the carrier actually delivers to.

TIGERWEB_BG_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
    "Tracts_Blocks/MapServer/1/query"
)

BG_VARIABLES = [
    "B25003_001E",  # occupied units
    "B25003_002E",  # owner occupied
    "B25024_001E",  # units in structure, total
    "B25024_002E",  # 1-unit detached
    "B25044_001E",  # vehicles available, total households
    "B25044_005E", "B25044_006E", "B25044_007E", "B25044_008E",  # owner, 2+
    "B25044_012E", "B25044_013E", "B25044_014E", "B25044_015E",  # renter, 2+
    "B25077_001E",  # median home value
]

# Home value is normalised against a ceiling rather than against the sample, so
# the score of a route does not move when a different ZIP is queried.
HOME_VALUE_CAP = 1_000_000.0

_bg_cache: Dict[str, Dict[str, dict]] = {}
# Which block groups a route crosses, keyed by route id. Carrier routes and
# census geography both change about once a decade, so this is worth keeping for
# the life of the process: it turns every repeat query into no network at all.
_route_bg_cache: Dict[str, List[str]] = {}

# A carrier route arrives with several hundred vertices. The block groups a line
# crosses are the same whether the line is drawn with 600 points or 120, and the
# shorter geometry is what makes the round trip fast enough to sit behind a
# button.
MAX_GEOMETRY_VERTICES = 120


async def block_groups_for_county(state: str, county: str) -> Dict[str, dict]:
    """Every block group in a county, keyed by GEOID. One call, then cached."""
    key = f"{state}{county}"
    if key in _bg_cache:
        return _bg_cache[key]
    if not is_configured():
        return {}

    params = {
        "get": ",".join(BG_VARIABLES),
        "for": "block group:*",
        "in": f"state:{state} county:{county} tract:*",
        "key": api_key(),
    }
    for year in ACS_YEARS:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.get(BASE_URL.format(year=year), params=params)
            if resp.status_code != 200:
                continue
            payload = resp.json()
        except Exception as e:
            print(f"[Census] block groups {key} ACS {year}: {e}")
            continue

        header = payload[0]
        idx = {name: i for i, name in enumerate(header)}
        out: Dict[str, dict] = {}
        for row in payload[1:]:
            geoid = (
                row[idx["state"]] + row[idx["county"]] + row[idx["tract"]] + row[idx["block group"]]
            )
            get = lambda name: _to_float(row[idx[name]]) or 0.0  # noqa: E731
            occupied = get("B25003_001E")
            structures = get("B25024_001E")
            vehicle_hh = get("B25044_001E")
            two_plus = sum(
                get(v)
                for v in (
                    "B25044_005E", "B25044_006E", "B25044_007E", "B25044_008E",
                    "B25044_012E", "B25044_013E", "B25044_014E", "B25044_015E",
                )
            )
            out[geoid] = {
                "households": occupied,
                "owner_occupied": (get("B25003_002E") / occupied) if occupied else None,
                "single_family": (get("B25024_002E") / structures) if structures else None,
                "vehicles": (two_plus / vehicle_hh) if vehicle_hh else None,
                "home_value": _to_float(row[idx["B25077_001E"]]),
            }
        _bg_cache[key] = out
        return out

    _bg_cache[key] = {}
    return {}


def _thin(paths: list) -> list:
    """Drop intermediate vertices, keeping the first and last of every path."""
    total = sum(len(p) for p in paths)
    if total <= MAX_GEOMETRY_VERTICES:
        return paths
    step = max(2, total // MAX_GEOMETRY_VERTICES)
    thinned = []
    for path in paths:
        if len(path) <= 2:
            thinned.append(path)
            continue
        kept = path[::step]
        if kept[-1] != path[-1]:
            kept = kept + [path[-1]]
        thinned.append(kept)
    return thinned


async def block_groups_touching(paths: list, route_id: str = "") -> List[str]:
    """The GEOIDs of the block groups a route's line passes through."""
    if not paths:
        return []
    if route_id and route_id in _route_bg_cache:
        return _route_bg_cache[route_id]

    geometry = {"paths": _thin(paths), "spatialReference": {"wkid": 102100}}
    data = {
        "geometry": json.dumps(geometry),
        "geometryType": "esriGeometryPolyline",
        "inSR": "102100",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "GEOID",
        "returnGeometry": "false",
        "f": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(TIGERWEB_BG_URL, data=data)
        features = (resp.json() or {}).get("features", [])
    except Exception as e:
        print(f"[Census] TIGERweb: {e}")
        return []

    geoids = [f["attributes"]["GEOID"] for f in features if f.get("attributes", {}).get("GEOID")]
    if route_id and geoids:
        _route_bg_cache[route_id] = geoids
    return geoids


async def enrich_routes(routes: List[dict]) -> int:
    """
    Fill each route's w2–w5 from the block groups it crosses.

    Returns how many routes were enriched. Zero is a normal outcome — no key, no
    network, a ZIP the survey has nothing for — and the caller keeps scoring on
    the USPS variables rather than failing.
    """
    if not is_configured():
        return 0

    # One TIGERweb round trip per route, all in flight at once. Sequentially
    # this took half a minute for a ZIP of twenty-four routes, which is long
    # enough that the operator would assume the screen had hung.
    geoid_lists = await asyncio.gather(
        *(block_groups_touching(r.get("paths") or [], r.get("route_id", "")) for r in routes),
        return_exceptions=True,
    )

    enriched = 0
    counties: Dict[str, Dict[str, dict]] = {}
    for route, geoids in zip(routes, geoid_lists):
        if isinstance(geoids, BaseException) or not geoids:
            continue

        rows = []
        for geoid in geoids:
            state, county = geoid[:2], geoid[2:5]
            key = state + county
            if key not in counties:
                counties[key] = await block_groups_for_county(state, county)
            row = counties[key].get(geoid)
            if row and row["households"]:
                rows.append(row)
        if not rows:
            continue

        total = sum(r["households"] for r in rows) or 1.0

        def weighted(field: str) -> Optional[float]:
            present = [r for r in rows if r[field] is not None]
            if not present:
                return None
            weight = sum(r["households"] for r in present) or 1.0
            return sum(r[field] * r["households"] for r in present) / weight

        route["owner_occupied"] = weighted("owner_occupied")
        route["single_family"] = weighted("single_family")
        route["vehicles"] = weighted("vehicles")
        value = weighted("home_value")
        route["home_value"] = min(value / HOME_VALUE_CAP, 1.0) if value else None
        route["block_groups"] = len(rows)
        route["bg_households"] = int(total)
        enriched += 1

    return enriched
