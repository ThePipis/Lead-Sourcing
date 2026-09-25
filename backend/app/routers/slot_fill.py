"""
Filling the card automatically: fourteen niches, fourteen local businesses.

The operator's scarce resource is the sales call, not the search. Finding a
dentist in Eastvale is something a computer does in a second and a person does
in ten minutes, fourteen times over. So this fills every empty box with a real
candidate — name, phone, address — and leaves the human to do the part only a
human can do.

Two things it is careful about:

**Filled is not sold.** A candidate lands as PROSPECTING, never RESERVED. The
box is a call to make, not a deal that closed, and the card must not read as
though somebody agreed to pay when nobody has been phoned yet.

**A "no" is remembered.** When a business turns the offer down, its lead is
marked REJECTED and it never comes back for that campaign. Handing the partner
the same pizzeria they were turned down by yesterday is how an operator stops
trusting the tool.
"""

import asyncio
import re
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Campaign, Lead, Slot
from ..services.lead_sourcing_service import LeadSourcingService, normalize_category

router = APIRouter(prefix="/campaigns", tags=["Slot Autofill"])

service = LeadSourcingService()


def _campaign(db: Session, campaign_id: str) -> Campaign:
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id} not found")
    return camp


def _rejected_names(db: Session, campaign_id: str) -> set:
    rows = (
        db.query(Lead.business_name)
        .filter(Lead.campaign_id == campaign_id, Lead.status == "REJECTED")
        .all()
    )
    return {(r[0] or "").strip().lower() for r in rows}


def _taken_names(camp: Campaign, except_slot: Optional[int] = None) -> set:
    """Businesses already on the card. The same shop cannot hold two boxes."""
    return {
        (s.business_name or "").strip().lower()
        for s in camp.slots
        if s.business_name and s.slot_number != except_slot
    }


def _apply(slot: Slot, candidate: dict) -> None:
    slot.business_name = candidate.get("business_name") or candidate.get("name") or ""
    slot.phone = candidate.get("phone") or ""
    slot.website = candidate.get("website_url") or ""
    slot.contact_person = candidate.get("decision_maker") or ""
    slot.business_address = _format_address(candidate)
    # The box stays a call to make until somebody answers it.
    slot.status = "PROSPECTING"


def _format_address(candidate: dict) -> str:
    """
    The address as one readable line.

    The city is appended only when the street does not already carry it: Yelp
    falls back to its display address when `address1` is empty, and that line
    often is the city, which produced "Corona, CA 92880, Corona" on the card.
    """
    street = (candidate.get("address") or "").strip().strip(",")
    # OpenStreetMap's addr:street is whatever a volunteer typed; some carry the
    # whole postal address, country included, and one line of a slot card is not
    # the place for it.
    street = re.sub(r",?\s*United States\s*$", "", street, flags=re.I).strip().strip(",")
    street = re.sub(r"\s+", " ", street)
    if len(street) > 60:
        street = street[:57].rstrip(" ,") + "…"
    city = (candidate.get("city") or "").strip()
    if not street:
        return city
    if city and city.lower() not in street.lower():
        return f"{street}, {city}"
    return street


def _record_lead(db: Session, camp: Campaign, slot: Slot, candidate: dict) -> None:
    """Keep the candidate in the CRM so a later 'no' has something to mark."""
    name = (candidate.get("business_name") or candidate.get("name") or "").strip()
    if not name:
        return
    lead_id = f"{camp.id}-{slot.slot_number}-{abs(hash(name.lower())) % 10**8}"
    existing = (
        db.query(Lead)
        .filter(Lead.campaign_id == camp.id, Lead.business_name == name)
        .first()
    )
    if existing:
        existing.category_id = slot.category_id
        existing.status = "NEW" if existing.status == "REJECTED" else existing.status
        return
    db.add(
        Lead(
            id=lead_id,
            campaign_id=camp.id,
            category_id=slot.category_id,
            category_name=slot.category_name or "",
            business_name=name,
            address=candidate.get("address") or "",
            city=candidate.get("city") or camp.target_city,
            zip=candidate.get("zip_code") or candidate.get("zip") or camp.target_zip,
            phone=candidate.get("phone") or "",
            rating=candidate.get("rating") or 0.0,
            review_count=candidate.get("review_count") or 0,
            source=candidate.get("source") or "",
            status="NEW",
        )
    )


async def _candidates_for(slot: Slot, camp: Campaign, mock_mode: bool) -> List[dict]:
    try:
        return await service.search_candidates(
            category_id=slot.category_id,
            city=camp.target_city,
            zip_code=camp.target_zip,
            mock_mode=mock_mode,
        )
    except Exception as e:
        print(f"[Autofill] slot {slot.slot_number}: {e}")
        return []


@router.post("/{campaign_id}/slots/autofill")
async def autofill_slots(
    campaign_id: str,
    mock_mode: bool = Query(True),
    db: Session = Depends(get_db),
):
    """
    Put a real business in every empty box, in one pass.

    Only VACANT boxes are touched: a box with a business in it is somebody's
    negotiation, and overwriting it would erase work the partner has already
    done on the phone.
    """
    camp = _campaign(db, campaign_id)
    empty = [s for s in camp.slots if s.status == "VACANT" and not s.business_name]
    if not empty:
        return {
            "filled": [],
            "skipped": [],
            "message": "No hay espacios vacíos: la tarjeta ya está completa.",
        }

    # Fourteen searches at once. Sequentially this is fourteen round trips to
    # Yelp or Overpass, which is a minute the operator spends watching a spinner.
    results = await asyncio.gather(
        *(_candidates_for(s, camp, mock_mode) for s in empty),
        return_exceptions=True,
    )

    rejected = _rejected_names(db, campaign_id)
    taken = _taken_names(camp)
    filled: List[dict] = []
    skipped: List[dict] = []

    for slot, candidates in zip(empty, results):
        if isinstance(candidates, BaseException) or not candidates:
            skipped.append({"slot": slot.slot_number, "reason": "sin_candidatos"})
            continue

        pick = None
        for candidate in candidates:
            name = (candidate.get("business_name") or candidate.get("name") or "").strip()
            key = name.lower()
            if not name or key in rejected or key in taken:
                continue
            # An invented business with an invented phone number is worse than an
            # empty box: somebody would dial it. When the operator asked for real
            # data, the fallback is refused and the box says so.
            if candidate.get("simulated") and not mock_mode:
                continue
            pick = candidate
            break

        if pick is None:
            simulated_only = any(c.get("simulated") for c in candidates) and not mock_mode
            skipped.append(
                {
                    "slot": slot.slot_number,
                    "reason": "solo_simulados" if simulated_only else "todos_descartados",
                }
            )
            continue

        _apply(slot, pick)
        _record_lead(db, camp, slot, pick)
        taken.add((slot.business_name or "").lower())
        filled.append(
            {
                "slot": slot.slot_number,
                "business": slot.business_name,
                "phone": slot.phone,
                "address": slot.business_address,
                "source": pick.get("source") or "",
                "alternatives": max(0, len(candidates) - 1),
            }
        )

    db.commit()
    return {"filled": filled, "skipped": skipped}


@router.post("/{campaign_id}/slots/{slot_number}/next-candidate")
async def next_candidate(
    campaign_id: str,
    slot_number: int,
    mock_mode: bool = Query(True),
    rejected: bool = Query(True),
    db: Session = Depends(get_db),
):
    """
    Swap the business in a box for the next candidate.

    `rejected=true` is the normal case — they said no — and marks the current
    business so it never comes back for this campaign. `rejected=false` just
    shuffles without holding it against anybody.
    """
    camp = _campaign(db, campaign_id)
    slot = next((s for s in camp.slots if s.slot_number == slot_number), None)
    if not slot:
        raise HTTPException(status_code=404, detail=f"Slot {slot_number} not found")
    if slot.status == "PAID":
        raise HTTPException(
            status_code=409,
            detail="Ese espacio ya está cobrado: cambiar el comercio borraría una venta.",
        )

    current = (slot.business_name or "").strip()
    if current and rejected:
        lead = (
            db.query(Lead)
            .filter(Lead.campaign_id == camp.id, Lead.business_name == current)
            .first()
        )
        if lead:
            lead.status = "REJECTED"
        else:
            db.add(
                Lead(
                    id=f"{camp.id}-{slot_number}-{abs(hash(current.lower())) % 10**8}",
                    campaign_id=camp.id,
                    category_id=slot.category_id,
                    category_name=slot.category_name or "",
                    business_name=current,
                    phone=slot.phone or "",
                    city=camp.target_city,
                    zip=camp.target_zip,
                    status="REJECTED",
                )
            )
        db.commit()

    candidates = await _candidates_for(slot, camp, mock_mode)
    rejected_names = _rejected_names(db, campaign_id)
    taken = _taken_names(camp, except_slot=slot_number)

    pick = None
    for candidate in candidates:
        name = (candidate.get("business_name") or candidate.get("name") or "").strip()
        key = name.lower()
        if not name or key == current.lower() or key in rejected_names or key in taken:
            continue
        if candidate.get("simulated") and not mock_mode:
            continue
        pick = candidate
        break

    if pick is None:
        # Nothing left is an honest answer, and it is actionable: the operator
        # goes to section 2 and searches by hand, or widens the niche.
        slot.business_name = ""
        slot.phone = ""
        slot.website = ""
        slot.contact_person = ""
        slot.business_address = ""
        slot.status = "VACANT"
        db.commit()
        return {
            "slot": slot_number,
            "exhausted": True,
            "business": None,
            "detail": (
                "No quedan candidatos sin descartar para este giro en la microzona. "
                "Busca a mano en la sección 2 o amplía el radio."
            ),
        }

    _apply(slot, pick)
    _record_lead(db, camp, slot, pick)
    db.commit()
    return {
        "slot": slot_number,
        "exhausted": False,
        "business": slot.business_name,
        "phone": slot.phone,
        "address": slot.business_address,
        "source": pick.get("source") or "",
    }


@router.post("/{campaign_id}/slots/mark-all-paid")
def mark_all_paid(campaign_id: str, db: Session = Depends(get_db)):
    """
    Stamp every unpaid box as collected. Practice file only.

    Getting to section 3 means clearing the operating floor, which means
    recording twelve payments by hand every time a test campaign is built. That
    is a chore in a rehearsal and a forgery in a real one, so this refuses to
    run outside the practice world — a payment in the live file has to match
    money that actually arrived.
    """
    camp = _campaign(db, campaign_id)
    if (camp.mode or "DEMO").upper() != "DEMO":
        raise HTTPException(
            status_code=409,
            detail=(
                "Solo en modo simulación. Un cobro en el archivo real tiene que "
                "corresponder a dinero que entró de verdad."
            ),
        )

    from .campaigns import ensure_campaign_slots
    ensure_campaign_slots(camp, db)

    import datetime

    stamped = []
    for slot in camp.slots:
        if slot.slot_number == 32 or slot.slot_type == "USPS":
            slot.status = "PAID"
            slot.price_usd = 0.0
            continue
        if slot.status == "PAID":
            continue
        slot.status = "PAID"
        slot.paid_at = datetime.datetime.utcnow()
        slot.amount_collected_usd = slot.price_usd or 350.0
        slot.payment_ref = "SIMULACIÓN"
        stamped.append(slot.slot_number)

    camp.status = "LOCKED_READY"
    camp.paid_count = len([s for s in camp.slots if s.status == "PAID" and s.slot_number != 32])
    camp.total_collected_usd = sum(s.amount_collected_usd or s.price_usd or 0 for s in camp.slots if s.status == "PAID")

    db.commit()
    db.refresh(camp)
    return {
        "stamped": stamped,
        "collected": camp.total_collected_usd,
    }
