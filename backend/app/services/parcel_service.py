"""
What the neighbourhood is actually built of, from the county's own parcel roll.

A saturation drop cannot choose households, so this module never tries to. It
answers a different question, and the only one an advertiser can verify: *what
kind of neighbourhood did my card land in?* Riverside County publishes its
assessor roll as open data, so the answer is a public record rather than a
claim — 1,847 parcels, 78% single family, median value $612,000 — and the
advertiser can look up any parcel in it.

Two things about the source shape the code:

1. **The parcel layer has no year built.** `CLASS_CODE`, `ACREAGE` and the
   assessed value (`LAND` + `STRUCTURES`) live on layer 50; construction year
   lives on table 80 and joins back by `PIN` == `APN`, exactly, with no
   reformatting. A parcel can carry several buildings, so the *earliest* year
   is the one that describes when the neighbourhood went up.

2. **A carrier route is a polyline down the middle of the street, and a
   simplified one.** Parcels sit beside it and never touch it, so the query
   buffers the line. Measured against ZIP 92880, that buffer returns roughly
   half as many parcels as the route has mailboxes at any width worth using —
   the published line does not trace every cul-de-sac it delivers to.

   So this module does **not** count households from parcels. The delivery
   count is what USPS publishes per route, it is what the postage is billed
   on, and it is already known before this module runs. The parcels answer
   *what the housing is like*, as a sample, and the summary reports how big
   that sample was. Widening the buffer until the two numbers matched would
   not have made the count truer, only harder to contradict.

Every failure degrades to "unavailable" rather than to a number. A profile that
quietly invented its median would be worse than no profile at all: it is shown
to a paying advertiser as evidence.
"""

import json
import statistics
from datetime import date
from typing import Dict, List, Optional

import httpx

from .census_service import _thin

_BASE = "https://gis.countyofriverside.us/arcgis_mapping/rest/services/OpenData/Assessor/MapServer"
PARCELS_URL = f"{_BASE}/50/query"
CHARS_URL = f"{_BASE}/80/query"

# Open data, no token. Attribution is the county's asking price.
ATTRIBUTION = "Riverside County Assessor / RCIT"

# Wide enough to sample both sides of the street, tight enough that the parcels
# belong to this route rather than the next one over. It sets the sample size,
# not the household count, so it is not worth tuning further.
BUFFER_FEET = 250

# The service caps a page at 2,000 and a carrier route tops out near 850
# deliveries, so one page covers a route. Batches keep the PIN filter inside
# what the endpoint will parse.
PAGE_LIMIT = 2000
PIN_BATCH = 200

_profile_cache: Dict[str, Optional[dict]] = {}


def _is_single_family(class_code: str) -> bool:
    return "single family" in (class_code or "").lower()


def _assessed_value(parcel: dict) -> Optional[float]:
    """Land plus improvements. A parcel assessed at nothing tells us nothing."""
    total = (parcel.get("LAND") or 0) + (parcel.get("STRUCTURES") or 0)
    return float(total) if total > 0 else None


async def parcels_for_paths(paths: list, buffer_feet: int = BUFFER_FEET) -> List[dict]:
    """Every parcel within `buffer_feet` of a route's line."""
    if not paths:
        return []

    geometry = {"paths": _thin(paths), "spatialReference": {"wkid": 102100}}
    data = {
        "geometry": json.dumps(geometry),
        "geometryType": "esriGeometryPolyline",
        "inSR": "102100",
        "spatialRel": "esriSpatialRelIntersects",
        "distance": str(buffer_feet),
        "units": "esriSRUnit_Foot",
        "outFields": "APN,CLASS_CODE,ACREAGE,LAND,STRUCTURES",
        "returnGeometry": "false",
        "resultRecordCount": str(PAGE_LIMIT),
        "f": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(PARCELS_URL, data=data)
        features = (resp.json() or {}).get("features", [])
    except Exception as e:
        print(f"[Parcels] Riverside assessor: {e}")
        return []

    return [f["attributes"] for f in features if f.get("attributes", {}).get("APN")]


async def year_built_for(apns: List[str]) -> Dict[str, int]:
    """
    Earliest construction year per parcel.

    The characteristics table carries one row per building, so a parcel with a
    house and a later addition appears twice. The earliest year is the one that
    says when the tract was built, which is the question being asked.
    """
    if not apns:
        return {}

    years: Dict[str, int] = {}
    for i in range(0, len(apns), PIN_BATCH):
        batch = apns[i : i + PIN_BATCH]
        quoted = ",".join(f"'{a}'" for a in batch if a.isalnum())
        if not quoted:
            continue
        data = {
            "where": f"PIN IN ({quoted})",
            "outFields": "PIN,YEAR_BUILT",
            "returnGeometry": "false",
            "resultRecordCount": str(PAGE_LIMIT),
            "f": "json",
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(CHARS_URL, data=data)
            features = (resp.json() or {}).get("features", [])
        except Exception as e:
            # A missing batch costs coverage, not correctness: the summary
            # reports what share of parcels it could date.
            print(f"[Parcels] Characteristics batch: {e}")
            continue

        for f in features:
            a = f.get("attributes", {}) or {}
            pin, year = a.get("PIN"), a.get("YEAR_BUILT")
            if not pin or not year or year < 1800:
                continue
            years[pin] = min(year, years.get(pin, year))

    return years


def summarize(
    parcels: List[dict],
    years: Dict[str, int],
    routes: int = 0,
    households: int = 0,
) -> dict:
    """
    Aggregate the parcel rows into the figures shown to an advertiser.

    `households` is the USPS delivery count for the same routes and is passed
    through untouched; `parcels_sampled` says how many parcels the ratios below
    were computed from. They are different numbers on purpose and the interface
    prints both.
    """
    values = [v for v in (_assessed_value(p) for p in parcels) if v is not None]
    dated = [years[apn] for p in parcels if (apn := p.get("APN")) in years]

    counts: Dict[str, int] = {}
    for p in parcels:
        code = p.get("CLASS_CODE") or "Unknown"
        counts[code] = counts.get(code, 0) + 1

    single_family = sum(n for code, n in counts.items() if _is_single_family(code))
    median_year = int(statistics.median(dated)) if dated else None

    return {
        "households": households,
        "parcels_sampled": len(parcels),
        "routes": routes,
        "class_breakdown": sorted(
            ({"class_code": c, "count": n} for c, n in counts.items()),
            key=lambda x: -x["count"],
        )[:6],
        "single_family_rate": round(single_family / len(parcels), 4) if parcels else None,
        "median_value": int(statistics.median(values)) if values else None,
        "median_year_built": median_year,
        "median_age_years": date.today().year - median_year if median_year else None,
        "year_built_coverage": round(len(dated) / len(parcels), 4) if parcels else None,
        "source": ATTRIBUTION,
    }


async def route_profile(zip_code: str, route_ids: List[str]) -> Optional[dict]:
    """
    The built profile of the selected routes, or None if the county did not answer.

    None is not "no houses there" — it is "we could not check". The interface
    has to say so rather than print a zero.
    """
    if not route_ids:
        return None

    key = f"{zip_code}|{','.join(sorted(route_ids))}"
    if key in _profile_cache:
        return _profile_cache[key]

    from . import eddm_service

    try:
        routes = await eddm_service.fetch_routes(zip_code)
    except Exception as e:
        print(f"[Parcels] Route geometry unavailable: {e}")
        return None

    wanted = {r for r in route_ids}
    selected = [r for r in routes if r.get("route_id") in wanted]
    if not selected:
        return None

    # One parcel can sit on two adjoining routes; it is still one home.
    by_apn: Dict[str, dict] = {}
    for route in selected:
        for parcel in await parcels_for_paths(route.get("paths") or []):
            by_apn[parcel["APN"]] = parcel

    if not by_apn:
        _profile_cache[key] = None
        return None

    parcels = list(by_apn.values())
    years = await year_built_for([p["APN"] for p in parcels])
    profile = summarize(
        parcels,
        years,
        routes=len(selected),
        households=sum(r.get("residential") or 0 for r in selected),
    )
    _profile_cache[key] = profile
    return profile


def demo() -> None:
    """Summary checks that need no network."""
    parcels = [
        {"APN": "1", "CLASS_CODE": "Single Family Dwelling", "LAND": 200000, "STRUCTURES": 400000},
        {"APN": "2", "CLASS_CODE": "Single Family Dwelling", "LAND": 250000, "STRUCTURES": 350000},
        {"APN": "3", "CLASS_CODE": "Single Family Dwelling", "LAND": 300000, "STRUCTURES": 500000},
        {"APN": "4", "CLASS_CODE": "Condo or PUD", "LAND": 100000, "STRUCTURES": 200000},
        # Assessed at nothing: excluded from the median rather than counted as $0.
        {"APN": "5", "CLASS_CODE": "Vacant Land", "LAND": 0, "STRUCTURES": 0},
    ]
    years = {"1": 1998, "2": 2004, "3": 2010}

    s = summarize(parcels, years, routes=2, households=1200)
    assert s["parcels_sampled"] == 5 and s["routes"] == 2, s
    # The delivery count comes from USPS and is never inferred from the sample.
    assert s["households"] == 1200, s
    assert s["single_family_rate"] == 0.6, s
    # Medians run over the four valued parcels (300k, 600k, 600k, 800k), not all five.
    assert s["median_value"] == 600000, s
    assert s["median_year_built"] == 2004, s
    assert s["median_age_years"] == date.today().year - 2004, s
    assert s["year_built_coverage"] == 0.6, s
    assert s["class_breakdown"][0] == {"class_code": "Single Family Dwelling", "count": 3}, s
    assert s["source"] == ATTRIBUTION

    # A parcel with only land still has a value; only a zero total drops out.
    land_only = summarize([{"APN": "9", "CLASS_CODE": "Vacant Land", "LAND": 90000}], {})
    assert land_only["median_value"] == 90000, land_only
    assert land_only["median_year_built"] is None and land_only["median_age_years"] is None

    # Nothing found must not divide by zero and must not claim a rate.
    empty = summarize([], {})
    assert empty["parcels_sampled"] == 0, empty
    assert empty["single_family_rate"] is None and empty["median_value"] is None, empty

    assert _is_single_family("SINGLE FAMILY DWELLING") and not _is_single_family("Fourplex")
    print("parcel_service: ok")


if __name__ == "__main__":
    demo()
