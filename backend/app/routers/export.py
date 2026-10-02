from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Slot, AnalyticsEvent

router = APIRouter(tags=["QR Tracking"])


@router.get("/tracking/lan-ip")
def lan_ip():
    """
    This PC's address on the local network. A QR that encodes "localhost" can
    only be opened on this PC; a phone on the same Wi-Fi reaches it by this IP.
    The UDP connect sends nothing, it only asks the OS which interface routes out.
    """
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return {"ip": s.getsockname()[0]}
    except OSError:
        return {"ip": None}
    finally:
        s.close()


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
        user_agent=request.headers.get("user-agent", ""),
    )
    db.add(event)
    if slot:
        slot.scan_count += 1
    db.commit()

    destination = slot.website if (slot and slot.website) else "https://coop-mail.inlandempire.direct/offer"
    return RedirectResponse(url=destination, status_code=302)
