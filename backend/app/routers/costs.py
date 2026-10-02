import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CostSettings, Slot
from ..schemas import CostSettingsResponse, CostSettingsUpdate

router = APIRouter(prefix="/costs", tags=["Cost Model"])

PER_PIECE_FIELDS = (
    "postage_per_piece",
    "list_per_piece",
    "print_per_piece",
    "variable_data_per_piece",
    "presort_per_piece",
    "finishing_per_piece",
)

# Market rates published in September 2026 (see routers/datasources.py for the
# sources). Simulation starts loaded with them so a practice campaign shows
# figures in the right order of magnitude instead of a card that costs nothing.
# Live starts with postage only: the rest has to be this operator's own quote,
# and a plausible number in a live campaign is worse than an obvious zero.
MARKET_PRESET = {
    "postage_per_piece": 0.247,
    "print_per_piece": 0.21,
    "variable_data_per_piece": 0.03,
    "presort_per_piece": 0.02,
    "finishing_per_piece": 0.025,
    "list_per_piece": 0.11,
    "setup_fee": 250.0,
    "delivery_fee": 175.0,
    "target_margin": 0.58,
    "source_note": (
        "Valores de mercado (sept 2026), no cotizaciones: franqueo EDDM Retail "
        "$0.247; impresión $0.08–$0.25 según volumen; lista de consumidores "
        "segmentada $75–$150 por millar; higiene CASS/NCOA $2–$8 por millar. "
        "Sustitúyelos por tu cotización real en cuanto la tengas."
    ),
}

DEFAULTS = {
    "DEMO": dict(MARKET_PRESET),
    "LIVE": {
        "postage_per_piece": 0.247,
        "source_note": (
            "Solo el franqueo EDDM Retail publicado para 2026 ($0.247 por flat "
            "hasta 3.3 oz). Las demás líneas son tuyas: pídelas al mail house."
        ),
    },
}


def get_or_create(db: Session, mode: str) -> CostSettings:
    mode = mode.upper()
    if mode not in ("DEMO", "LIVE"):
        raise HTTPException(status_code=422, detail="mode must be DEMO or LIVE")
    row = db.query(CostSettings).filter(CostSettings.mode == mode).first()
    if row is None:
        row = CostSettings(mode=mode, **DEFAULTS[mode])
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def unit_cost(row: CostSettings) -> float:
    return round(sum(getattr(row, f) or 0.0 for f in PER_PIECE_FIELDS), 4)


def fixed_cost(row: CostSettings) -> float:
    return round((row.setup_fee or 0.0) + (row.delivery_fee or 0.0), 2)


# Format weights matching MODULAR_PRICES proportions (SMALL 350 : MEDIUM 650 : LARGE 1200)
FORMAT_WEIGHTS: Dict[str, float] = {
    "SMALL": 350.0,
    "MEDIUM": 650.0,
    "LARGE": 1200.0,
    "USPS": 0.0,
}


def suggested_prices(
    row: CostSettings,
    households: int,
    slot_formats: Optional[Dict[int, str]] = None,
) -> Dict[int, float]:
    """
    What each slot has to earn for the drop to hit its target margin.

    Total cost is the per-piece lines times the household count plus the fixed
    fees. Revenue has to cover that and leave the target margin. Slots split it
    in proportion to their format price (SMALL 350 : MEDIUM 650 : LARGE 1200).
    Ghost slots (notes "Covered by") and the USPS technical zone earn nothing.

    slot_formats: optional {slot_number: format} for the active campaign's
    slots (e.g. {"1": "SMALL", "5": "MEDIUM", "7": "LARGE"}). When absent,
    all 31 commercial slots default to SMALL (equal share).
    """
    total_cost = unit_cost(row) * households + fixed_cost(row)
    margin = min(max(row.target_margin or 0.0, 0.0), 0.95)
    required_revenue = total_cost / (1.0 - margin) if margin < 1 else total_cost

    # Build per-slot weight from format, defaulting to SMALL for commercial slots.
    # Ghost slots (weight=0) and slot 32/USPS earn nothing.
    effective: Dict[int, float] = {}
    for num in range(1, 33):
        if num == 32:
            effective[num] = 0.0
        elif slot_formats is not None:
            if num in slot_formats:
                effective[num] = FORMAT_WEIGHTS.get(slot_formats[num], FORMAT_WEIGHTS["SMALL"])
            else:
                effective[num] = 0.0
        else:
            effective[num] = FORMAT_WEIGHTS["SMALL"]

    weight_sum = sum(effective.values())
    if weight_sum == 0:
        return {num: 0 for num in range(1, 33)}

    result: Dict[int, float] = {}
    for num, w in effective.items():
        if w == 0:
            result[num] = 0
        else:
            result[num] = round(required_revenue * w / weight_sum)
    return result


def to_response(row: CostSettings, households: int, slot_formats: Optional[Dict[int, str]] = None) -> dict:
    total = round(unit_cost(row) * households + fixed_cost(row), 2)
    return {
        "mode": row.mode,
        "postage_per_piece": row.postage_per_piece,
        "list_per_piece": row.list_per_piece,
        "print_per_piece": row.print_per_piece,
        "variable_data_per_piece": row.variable_data_per_piece,
        "presort_per_piece": row.presort_per_piece,
        "finishing_per_piece": row.finishing_per_piece,
        "setup_fee": row.setup_fee,
        "delivery_fee": row.delivery_fee,
        "target_margin": row.target_margin,
        "source_note": row.source_note or "",
        "unit_cost": unit_cost(row),
        "fixed_cost": fixed_cost(row),
        "preview_households": households,
        "preview_total_cost": total,
        "suggested_prices": suggested_prices(row, households, slot_formats),
    }


def _load_slot_formats(db: Session, campaign_id: Optional[str]) -> Optional[Dict[int, str]]:
    """Return {slot_number: format} for non-ghost commercial slots in campaign, or None."""
    if not campaign_id:
        return None
    rows = (
        db.query(Slot.slot_number, Slot.format, Slot.slot_type, Slot.notes)
        .filter(Slot.campaign_id == campaign_id)
        .all()
    )
    if not rows:
        return None
    result: Dict[int, str] = {}
    for slot_number, fmt, slot_type, notes in rows:
        if slot_number == 32:
            continue
        if (slot_type or fmt) == "USPS":
            continue
        if notes and "Covered by" in notes:
            continue
        result[slot_number] = fmt or "SMALL"
    return result or None


@router.get("/{mode}", response_model=CostSettingsResponse)
def read_costs(
    mode: str,
    households: int = 5000,
    campaign_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    fmt = _load_slot_formats(db, campaign_id)
    return to_response(get_or_create(db, mode), households, fmt)


@router.put("/{mode}", response_model=CostSettingsResponse)
def write_costs(
    mode: str,
    req: CostSettingsUpdate,
    households: int = 5000,
    campaign_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    row = get_or_create(db, mode)
    for field, value in req.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(row, field, value)
    row.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(row)
    fmt = _load_slot_formats(db, campaign_id)
    return to_response(row, households, fmt)


@router.post("/{mode}/market-preset", response_model=CostSettingsResponse)
def apply_market_preset(mode: str, households: int = 5000, db: Session = Depends(get_db)):
    """
    Load the published market rates over this mode's cost model.

    Useful while the real quotes are still being chased: it puts every line in
    the right order of magnitude so the suggested prices mean something. The
    note on the row says plainly that these are market ranges and not a quote.
    """
    row = get_or_create(db, mode)
    for field, value in MARKET_PRESET.items():
        setattr(row, field, value)
    row.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(row)
    return to_response(row, households)


def prices_for_campaign(db: Session, mode: str, households: int, campaign_id: Optional[str] = None) -> Dict[int, float]:
    """
    What each of the fourteen boxes has to sell for, at this reach.

    This is the one place a slot price comes from. A campaign's cost is its per
    piece rate times the households plus the fixed fees, and the price of a box
    is that cost, grossed up to the target margin, split by what each position
    is worth.

    Deriving it beats scaling a printed rate card, and the reason shows up at
    the extremes. Scaling $497 from a 5,000-household list down to a five
    household test run gives $0.50 a box — fourteen boxes to cover a $428 drop,
    because the setup and delivery fees do not shrink with the reach. The cost
    model knows that; a multiplication does not.
    """
    row = db.query(CostSettings).filter(CostSettings.mode == (mode or "DEMO").upper()).first()
    if row is None:
        return {}
    fmt = _load_slot_formats(db, campaign_id)
    return suggested_prices(row, max(int(households or 0), 0), fmt)

