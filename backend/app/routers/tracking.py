import re
import uuid
import datetime
import hashlib
from typing import Optional, List
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Campaign, Slot, AnalyticsEvent

router = APIRouter(tags=["Tracking"])

def detect_device_type(user_agent: str) -> str:
    """Classifies user agent as 'Mobile' or 'Desktop'."""
    ua = (user_agent or "").lower()
    mobile_keywords = [
        "mobile", "android", "iphone", "ipod", "ipad", "tablet",
        "blackberry", "windows phone", "iemobile", "opera mini", "silk", "playbook"
    ]
    if any(keyword in ua for keyword in mobile_keywords):
        return "Mobile"
    return "Desktop"

@router.get("/courtesy", response_class=HTMLResponse)
def courtesy_landing(
    campaign_id: Optional[str] = None,
    slot_number: Optional[int] = None,
    business_name: Optional[str] = None
):
    """Courtesy fallback landing page when an advertiser has no live URL configured."""
    display_name = business_name or "Comercio Local"
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{display_name} • Co-Op Direct Mail</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #020617;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 1rem;
        }}
        .card {{
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 16px;
            padding: 2.5rem;
            max-width: 480px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
        }}
        .badge {{
            display: inline-block;
            background: #f59e0b;
            color: #020617;
            font-size: 11px;
            font-weight: 800;
            padding: 4px 12px;
            border-radius: 9999px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 1rem;
        }}
        h1 {{ font-size: 1.5rem; margin: 0 0 0.75rem 0; color: #ffffff; }}
        p {{ color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin: 0 0 1.5rem 0; }}
        .footer {{ font-size: 0.75rem; color: #64748b; font-family: monospace; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">Postal Gigante 12x9" • Inland Empire</div>
        <h1>¡Gracias por escanear!</h1>
        <p>Has escaneado la oferta exclusiva de <strong>{display_name}</strong> en la campaña compartida de correo directo.</p>
        <p>El portal web y promociones digitales de este comercio estarán disponibles en línea muy pronto.</p>
        <div class="footer">Campaña: {campaign_id or 'IE-EAST-92880'} • Slot #{slot_number or 1}</div>
    </div>
</body>
</html>"""

@router.get("/events")
def list_analytics_events(limit: int = 20, db: Session = Depends(get_db)):
    """Retrieve recent scan events from the analytics_events table."""
    events = db.query(AnalyticsEvent).order_by(AnalyticsEvent.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "campaign_id": e.campaign_id,
            "slot_number": e.slot_number,
            "business_name": e.business_name,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            "device_type": e.device_type,
            "city": e.city,
            "user_agent": e.user_agent,
            "ip_hash": e.ip_hash,
            "client_ip": e.client_ip
        }
        for e in events
    ]

@router.api_route("/{campaign_id}/{slot_id}", methods=["GET", "HEAD"])
async def track_qr_redirect(
    campaign_id: str,
    slot_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    GET /r/{campaign_id}/{slot_id}
    Extracts telemetry: IP del cliente, User-Agent, fecha y hora UTC, dispositivo (móvil/desktop).
    Inserta un registro en la tabla analytics_events vinculado a la campaña y al slot.
    Responde con una redirección HTTP 307 hacia la URL de destino configurada para ese comercio
    (ej. web o teléfono del anunciante). Si no hay URL configurada, redirige a una landing page
    temporal de cortesía.
    """
    # 1. Extraer IP del cliente
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "127.0.0.1"

    # 2. Extraer User-Agent y clasificar dispositivo (móvil/desktop)
    user_agent = request.headers.get("user-agent", "Unknown")
    device_type = detect_device_type(user_agent)

    # 3. Fecha y hora UTC
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    # 4. Resolver campaña (por ID, código, alias numérico o campaña activa)
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        camp = db.query(Campaign).filter(Campaign.code.ilike(f"%{campaign_id}%")).first()
    if not camp and (campaign_id.isdigit() or campaign_id in ["1", "active"]):
        all_camps = db.query(Campaign).order_by(Campaign.created_at.asc()).all()
        if campaign_id.isdigit():
            idx = int(campaign_id) - 1
            if 0 <= idx < len(all_camps):
                camp = all_camps[idx]
        if not camp and all_camps:
            camp = all_camps[0]
    if not camp:
        camp = db.query(Campaign).order_by(Campaign.created_at.desc()).first()
    if not camp:
        from .campaigns import get_active_campaign
        camp = get_active_campaign(db)

    # 5. Resolver número de slot (ej. "slot-1", "slot_2", "3", "1")
    digit_match = re.search(r"\d+", str(slot_id))
    slot_num = int(digit_match.group(0)) if digit_match else 1
    if slot_num < 1 or slot_num > 32:
        slot_num = 1

    slot = db.query(Slot).filter(Slot.campaign_id == camp.id, Slot.slot_number == slot_num).first()

    # Actualizar conteo de escaneos en el slot
    if slot:
        slot.scan_count = (slot.scan_count or 0) + 1
        business_name = slot.business_name or f"Comercio Slot {slot_num}"
    else:
        business_name = f"Comercio Slot {slot_num}"

    # 6. Insertar registro en la tabla analytics_events
    event_id = f"evt_{uuid.uuid4().hex[:16]}"
    ip_hashed = hashlib.sha256(client_ip.encode()).hexdigest()[:32]

    event = AnalyticsEvent(
        id=event_id,
        campaign_id=camp.id,
        slot_number=slot_num,
        business_name=business_name,
        timestamp=now_utc,
        device_type=device_type,
        city=camp.target_city or "Eastvale",
        user_agent=user_agent[:500] if user_agent else None,
        ip_hash=ip_hashed,
        client_ip=client_ip
    )
    db.add(event)
    db.commit()

    # 7. Determinar URL de destino
    dest_url = None
    if slot:
        if slot.website and slot.website.strip():
            dest_url = slot.website.strip()
            if not dest_url.startswith(("http://", "https://")):
                dest_url = f"https://{dest_url}"
        elif slot.short_url and slot.short_url.strip():
            dest_url = slot.short_url.strip()
            if not dest_url.startswith(("http://", "https://")):
                dest_url = f"https://{dest_url}"
        elif slot.phone and slot.phone.strip():
            phone_clean = re.sub(r"[^\d+]", "", slot.phone.strip())
            dest_url = f"tel:{phone_clean}"

    # Si no hay URL configurada, redirigir a landing page temporal de cortesía
    if not dest_url:
        from urllib.parse import quote
        dest_url = f"/r/courtesy?campaign_id={camp.id}&slot_number={slot_num}&business_name={quote(business_name)}"

    # 8. Responder con redirección HTTP 307
    return RedirectResponse(url=dest_url, status_code=307)
