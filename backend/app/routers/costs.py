import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CostSettings
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

# Slot rates at a 5,000-household drop, used only as relative weights: the hero
# is worth more than a standard box, and that ratio holds whatever we charge.
SLOT_WEIGHTS: Dict[int, float] = {
    1: 850.0,
    **{n: 497.0 for n in range(2, 14)},
    # The back panel is 28% larger than the boxes beside it and is priced above
    # them, not below. It used to carry 450 here, which quietly told the
    # operator to sell the biggest box on the reverse for the least money.
    14: 640.0,
}

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


def suggested_prices(row: CostSettings, households: int) -> Dict[int, float]:
    """
    What each slot has to earn for the drop to hit its target margin.

    Total cost is the per-piece lines times the household count plus the fixed
    fees. Revenue has to cover that and leave the target margin, and the
    fourteen slots split it in proportion to what each position is worth.
    """
    total_cost = unit_cost(row) * households + fixed_cost(row)
    margin = min(max(row.target_margin or 0.0, 0.0), 0.95)
    required_revenue = total_cost / (1.0 - margin) if margin < 1 else total_cost
    weight_sum = sum(SLOT_WEIGHTS.values())
    return {
        num: round(required_revenue * w / weight_sum)
        for num, w in SLOT_WEIGHTS.items()
    }


def to_response(row: CostSettings, households: int) -> dict:
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
        "suggested_prices": suggested_prices(row, households),
    }


@router.get("/{mode}", response_model=CostSettingsResponse)
def read_costs(mode: str, households: int = 5000, db: Session = Depends(get_db)):
    return to_response(get_or_create(db, mode), households)


@router.put("/{mode}", response_model=CostSettingsResponse)
def write_costs(
    mode: str,
    req: CostSettingsUpdate,
    households: int = 5000,
    db: Session = Depends(get_db),
):
    row = get_or_create(db, mode)
    for field, value in req.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(row, field, value)
    row.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(row)
    return to_response(row, households)


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


def prices_for_campaign(db: Session, mode: str, households: int) -> Dict[int, float]:
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
    return suggested_prices(row, max(int(households or 0), 0))
