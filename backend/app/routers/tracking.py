import re
import uuid
import datetime
import hashlib
from typing import Optional, List
import ipaddress
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Request, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..models import Campaign, Slot, AnalyticsEvent

router = APIRouter(tags=["Tracking"])
short_router = APIRouter(tags=["Tracking"])

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

def is_test_ip(ip: Optional[str]) -> bool:
    """A scan from this PC or the home network is a test, never a reader at home."""
    try:
        addr = ipaddress.ip_address((ip or "").strip())
    except ValueError:
        return True
    return addr.is_private or addr.is_loopback or addr.is_link_local


def locate_scan(event_id: str, ip: str) -> None:
    """
    Fill in where a scan came from (city, region, internet provider) from its IP.
    Runs after the redirect, so the reader never waits on it; a lookup that fails
    leaves the fields empty rather than guessing.
    """
    db = SessionLocal()
    try:
        event = db.query(AnalyticsEvent).filter(AnalyticsEvent.id == event_id).first()
        if not event:
            return
        if is_test_ip(ip):
            event.city = "Red local (prueba)"
        else:
            try:
                data = httpx.get(f"https://ipwho.is/{ip}", timeout=5).json()
            except Exception as e:  # noqa: BLE001
                print(f"[Tracking] geo lookup failed for {event_id}: {e}")
                return
            if data.get("success"):
                event.city = data.get("city")
                event.region = data.get("region")
                event.country = data.get("country_code")
                event.isp = (data.get("connection") or {}).get("isp")
        db.commit()
    finally:
        db.close()


@router.get("/courtesy", response_class=HTMLResponse)
def courtesy_landing(
    campaign_id: Optional[str] = None,
    slot_number: Optional[int] = None,
    business_name: Optional[str] = None,
    phone: Optional[str] = None,
):
    """Courtesy fallback landing page when an advertiser has no live URL configured."""
    from html import escape
    display_name = escape(business_name or "Comercio Local")
    digits = re.sub(r"[^\d+]", "", phone or "")
    call = (
        f'<a class="call" href="tel:{digits}">Llamar a {display_name}<br><span>{escape(phone or "")}</span></a>'
        if digits else ""
    )
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
        .call {{ display: block; background: #16a34a; color: #fff; text-decoration: none; font-weight: 800;
                 padding: 1rem; border-radius: 12px; margin: 0 0 1.5rem 0; font-size: 1.05rem; }}
        .call span {{ font-weight: 500; font-size: 0.9rem; opacity: 0.9; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">Postal Gigante 12x9" • Inland Empire</div>
        <h1>¡Gracias por escanear!</h1>
        <p>Has escaneado la oferta exclusiva de <strong>{display_name}</strong> en la campaña compartida de correo directo.</p>
        {call}
        <div class="footer">Campaña: {campaign_id or 'IE-EAST-92880'} • Slot #{slot_number or 1}</div>
    </div>
</body>
</html>"""

@router.get("/events")
def list_analytics_events(campaign_id: Optional[str] = None, limit: int = 500, db: Session = Depends(get_db)):
    """Recent scans, newest first; one campaign's when `campaign_id` is given."""
    q = db.query(AnalyticsEvent)
    if campaign_id:
        q = q.filter(AnalyticsEvent.campaign_id == campaign_id)
    events = q.order_by(AnalyticsEvent.timestamp.desc()).limit(limit).all()
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
            "client_ip": e.client_ip,
            "region": e.region,
            "country": e.country,
            "isp": e.isp,
            "is_test": is_test_ip(e.client_ip),
        }
        for e in events
    ]

@router.delete("/events")
def delete_all_events(campaign_id: str, db: Session = Depends(get_db)):
    """Wipe a campaign's whole scan log, real scans included, and zero its counters."""
    deleted = db.query(AnalyticsEvent).filter(AnalyticsEvent.campaign_id == campaign_id).delete()
    for slot in db.query(Slot).filter(Slot.campaign_id == campaign_id).all():
        slot.scan_count = 0
    db.commit()
    return {"deleted": deleted}


@router.delete("/events/tests")
def delete_test_events(campaign_id: str, db: Session = Depends(get_db)):
    """
    Remove the scans made from this PC or the home network (flagged PRUEBA), and
    bring each slot's counter back to the scans that remain. Real scans are kept.
    """
    events = db.query(AnalyticsEvent).filter(AnalyticsEvent.campaign_id == campaign_id).all()
    tests = [e for e in events if is_test_ip(e.client_ip)]
    for e in tests:
        db.delete(e)
    remaining: dict = {}
    for e in events:
        if not is_test_ip(e.client_ip):
            remaining[e.slot_number] = remaining.get(e.slot_number, 0) + 1
    for slot in db.query(Slot).filter(Slot.campaign_id == campaign_id).all():
        slot.scan_count = remaining.get(slot.slot_number, 0)
    db.commit()
    return {"deleted": len(tests), "remaining": sum(remaining.values())}


def describe_device(ua: Optional[str], fallback: Optional[str]) -> tuple:
    """("iPhone · iOS 18.1", "Safari") from a user agent; mirrors the panel."""
    ua = ua or ""
    m = re.search(r"iPhone OS (\d+[_\d]*)", ua)
    if m:
        os_name = f"iPhone · iOS {m.group(1).replace('_', '.')}"
    elif "iPad" in ua:
        os_name = "iPad"
    elif re.search(r"Android (\d+(\.\d+)?)", ua):
        os_name = "Android " + re.search(r"Android (\d+(\.\d+)?)", ua).group(1)
        model = re.search(r"; ([^;)]+) Build", ua)
        if model:
            os_name += f" · {model.group(1)}"
    elif "Windows" in ua:
        os_name = "Windows"
    elif "Mac OS X" in ua:
        os_name = "Mac"
    else:
        os_name = fallback or "—"
    for pat, name in (("Instagram", "Instagram"), ("FBAN|FBAV", "Facebook"), ("SamsungBrowser", "Samsung Internet"),
                      ("Edg/", "Edge"), ("CriOS|Chrome/", "Chrome"), ("Firefox|FxiOS", "Firefox"), ("Safari/", "Safari")):
        if re.search(pat, ua):
            return os_name, name
    return os_name, "—"


def mask_ip(ip: Optional[str]) -> str:
    if not ip:
        return "—"
    if "." in ip:
        return ".".join(ip.split(".")[:3]) + ".xxx"
    return ":".join(ip.split(":")[:4]) + ":xxxx"


@router.get("/events/export")
def export_events(campaign_id: str, slot_number: Optional[int] = None, db: Session = Depends(get_db)):
    """
    The advertiser's proof of response as an Excel file: real scans only (tests
    are left out), one row each, with when, what phone, which network and where
    the server saw it come from. `slot_number` narrows it to one business.
    """
    from io import BytesIO
    from zoneinfo import ZoneInfo
    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    q = db.query(AnalyticsEvent).filter(AnalyticsEvent.campaign_id == campaign_id)
    if slot_number is not None:
        q = q.filter(AnalyticsEvent.slot_number == slot_number)
    events = [e for e in q.order_by(AnalyticsEvent.timestamp.asc()).all() if not is_test_ip(e.client_ip)]

    slot_names = {s.slot_number: s.business_name for s in camp.slots if s.business_name}
    business = slot_names.get(slot_number) if slot_number is not None else None
    pacific = ZoneInfo("America/Los_Angeles")

    def local(ts):
        if ts is None:
            return None
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=datetime.timezone.utc)
        return ts.astimezone(pacific)

    seen, rows = set(), []
    for e in events:
        key = (e.slot_number, e.ip_hash, e.user_agent)
        repeat = key in seen
        seen.add(key)
        os_name, browser = describe_device(e.user_agent, e.device_type)
        rows.append((e, local(e.timestamp), os_name, browser, repeat))
    unique = sum(1 for r in rows if not r[4])

    # ---- palette (the app's paper and forest green)
    GREEN, INK, PAPER, ZEBRA, RULE, MUTED = "1F4D3A", "1C1917", "F5EFE3", "FBF8F2", "D6CDBB", "6B6358"
    thin = Side(style="thin", color=RULE)
    box = Border(left=thin, right=thin, top=thin, bottom=thin)

    wb = Workbook()
    ws = wb.active
    ws.title = "Escaneos"
    ws.sheet_view.showGridLines = False
    headers = ["#", "Fecha", "Hora (PT)", "Comercio", "Dispositivo", "Navegador", "IP (parcial)",
               "Ciudad", "Estado / Región", "País", "Proveedor de internet", "Visita"]
    widths = [5, 13, 11, 30, 30, 16, 17, 18, 18, 7, 30, 11]
    last_col = get_column_letter(len(headers))

    ws.merge_cells(f"A1:{last_col}1")
    ws["A1"] = f"Reporte de escaneos QR · {business or 'Todos los comercios'}"
    ws["A1"].font = Font(name="Calibri", size=18, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor=GREEN)
    ws["A1"].alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[1].height = 36

    ws.merge_cells(f"A2:{last_col}2")
    generated = datetime.datetime.now(pacific).strftime("%d/%m/%Y %H:%M")
    ws["A2"] = (f"Campaña {camp.code} · {camp.target_city} · ZIP {camp.target_zip} · "
                f"Postal Co-Op Direct Mail · Generado {generated} (hora del Pacífico)")
    ws["A2"].font = Font(size=10, italic=True, color=MUTED)
    ws["A2"].fill = PatternFill("solid", fgColor=PAPER)
    ws["A2"].alignment = Alignment(indent=1)

    # KPI cards: label row + value row.
    first = rows[0][1] if rows else None
    last = rows[-1][1] if rows else None
    kpis = [
        ("Escaneos reales", len(rows)),
        ("Visitantes únicos", unique),
        ("Primer escaneo", first.strftime("%d/%m/%Y %H:%M") if first else "—"),
        ("Último escaneo", last.strftime("%d/%m/%Y %H:%M") if last else "—"),
    ]
    spans = [("A", "C"), ("D", "D"), ("E", "G"), ("H", "K")]
    for (label, value), (c1, c2) in zip(kpis, spans):
        ws.merge_cells(f"{c1}4:{c2}4")
        ws.merge_cells(f"{c1}5:{c2}5")
        ws[f"{c1}4"] = label.upper()
        ws[f"{c1}4"].font = Font(size=9, bold=True, color=MUTED)
        ws[f"{c1}5"] = value
        ws[f"{c1}5"].font = Font(size=20, bold=True, color=GREEN)
        for r in (4, 5):
            ws[f"{c1}{r}"].alignment = Alignment(horizontal="left", indent=1)
            for col in range(ws[f"{c1}4"].column, ws[f"{c2}4"].column + 1):
                cell = ws.cell(row=r, column=col)
                cell.fill = PatternFill("solid", fgColor=PAPER)
                cell.border = Border(top=thin if r == 4 else None, bottom=thin if r == 5 else None,
                                     left=thin if col == ws[f"{c1}4"].column else None,
                                     right=thin if col == ws[f"{c2}4"].column else None)
    ws.row_dimensions[5].height = 30

    head_row = 7
    for i, (h, w) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(row=head_row, column=i, value=h)
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = PatternFill("solid", fgColor=INK)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = box
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[head_row].height = 26

    for n, (e, ts, os_name, browser, repeat) in enumerate(rows, start=1):
        r = head_row + n
        values = [n, ts.strftime("%d/%m/%Y") if ts else "", ts.strftime("%H:%M:%S") if ts else "",
                  e.business_name, os_name, browser, mask_ip(e.client_ip), e.city or "—", e.region or "—",
                  e.country or "—", e.isp or "—", "Repetida" if repeat else "Nueva"]
        for i, v in enumerate(values, start=1):
            cell = ws.cell(row=r, column=i, value=v)
            cell.border = box
            cell.font = Font(size=10, color=MUTED if repeat else INK)
            cell.alignment = Alignment(horizontal="center" if i in (1, 2, 3, 10, 12) else "left", vertical="center")
            if n % 2 == 0:
                cell.fill = PatternFill("solid", fgColor=ZEBRA)
        ws.cell(row=r, column=12).font = Font(size=10, bold=True, color=MUTED if repeat else GREEN)
    if not rows:
        ws.merge_cells(start_row=head_row + 1, start_column=1, end_row=head_row + 1, end_column=len(headers))
        ws.cell(row=head_row + 1, column=1, value="Aún no hay escaneos de lectores para este periodo.").font = Font(italic=True, color=MUTED)

    note_row = head_row + max(len(rows), 1) + 2
    ws.merge_cells(start_row=note_row, start_column=1, end_row=note_row, end_column=len(headers))
    ws.cell(row=note_row, column=1, value=(
        "Cada fila la registra el servidor automáticamente en el momento en que un lector abre el QR impreso: "
        "la hora, el teléfono y la red los aporta el propio dispositivo, y la ubicación y el proveedor salen de su IP. "
        "Las IPs se muestran parciales por privacidad. Los escaneos de prueba de la agencia están excluidos."
    ))
    ws.cell(row=note_row, column=1).font = Font(size=9, italic=True, color=MUTED)
    ws.cell(row=note_row, column=1).alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[note_row].height = 42

    ws.freeze_panes = ws.cell(row=head_row + 1, column=1)
    if rows:
        ws.auto_filter.ref = f"A{head_row}:{last_col}{head_row + len(rows)}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    # Per-business summary for the agency's all-businesses report.
    if slot_number is None:
        ss = wb.create_sheet("Por comercio")
        ss.sheet_view.showGridLines = False
        ss.merge_cells("A1:D1")
        ss["A1"] = f"Escaneos por comercio · {camp.code}"
        ss["A1"].font = Font(size=16, bold=True, color="FFFFFF")
        ss["A1"].fill = PatternFill("solid", fgColor=GREEN)
        ss["A1"].alignment = Alignment(vertical="center", indent=1)
        ss.row_dimensions[1].height = 32
        for i, (h, w) in enumerate(zip(["Comercio", "Escaneos reales", "Visitantes únicos", "Último escaneo"], [36, 17, 18, 20]), start=1):
            c = ss.cell(row=3, column=i, value=h)
            c.font = Font(bold=True, color="FFFFFF", size=10)
            c.fill = PatternFill("solid", fgColor=INK)
            c.alignment = Alignment(horizontal="center")
            c.border = box
            ss.column_dimensions[get_column_letter(i)].width = w
        per: dict = {}
        for e, ts, _o, _b, repeat in rows:
            d = per.setdefault(e.slot_number, {"name": e.business_name, "n": 0, "u": 0, "last": None})
            d["n"] += 1
            d["u"] += 0 if repeat else 1
            d["last"] = ts
        names = sorted(set(slot_names) | set(per), key=lambda k: -(per.get(k, {}).get("n", 0)))
        for j, k in enumerate(names, start=4):
            d = per.get(k, {"name": slot_names.get(k), "n": 0, "u": 0, "last": None})
            vals = [d["name"] or slot_names.get(k) or f"Slot {k}", d["n"], d["u"],
                    d["last"].strftime("%d/%m/%Y %H:%M") if d["last"] else "—"]
            for i, v in enumerate(vals, start=1):
                c = ss.cell(row=j, column=i, value=v)
                c.border = box
                c.font = Font(size=10, bold=(i == 2), color=GREEN if i == 2 else INK)
                c.alignment = Alignment(horizontal="left" if i == 1 else "center")
                if j % 2 == 1:
                    c.fill = PatternFill("solid", fgColor=ZEBRA)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    slug = re.sub(r"[^A-Za-z0-9]+", "_", business or "todos").strip("_")
    filename = f"Escaneos_QR_{camp.code}_{slug}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.api_route("/{campaign_id}/{slot_id}", methods=["GET", "HEAD"])
async def track_qr_redirect(
    campaign_id: str,
    slot_id: str,
    request: Request,
    background: BackgroundTasks,
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
    # Behind Cloudflare the reader's address is in CF-Connecting-IP; behind any
    # other proxy, the first X-Forwarded-For hop.
    forwarded_for = request.headers.get("x-forwarded-for")
    if request.headers.get("x-coop-client-ip"):
        # Set by our Cloudflare Worker, which sees the reader directly.
        client_ip = request.headers["x-coop-client-ip"].strip()
    elif request.headers.get("cf-connecting-ip"):
        client_ip = request.headers["cf-connecting-ip"].strip()
    elif forwarded_for:
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
        city=None,  # filled in from the IP by locate_scan, never assumed
        user_agent=user_agent[:500] if user_agent else None,
        ip_hash=ip_hashed,
        client_ip=client_ip
    )
    db.add(event)
    db.commit()
    background.add_task(locate_scan, event_id, client_ip)

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
    # Sin web: una página con el nombre y un botón para llamar. Un redirect a
    # tel: deja el navegador del celular en blanco tras "Abrir enlace".
    if not dest_url:
        from urllib.parse import urlencode
        dest_url = "/r/courtesy?" + urlencode({
            "campaign_id": camp.id,
            "slot_number": slot_num,
            "business_name": business_name,
            "phone": (slot.phone or "") if slot else "",
        })

    # 8. Responder con redirección HTTP 307
    return RedirectResponse(url=dest_url, status_code=307)


@short_router.api_route("/q/{token}", methods=["GET", "HEAD"])
async def short_qr_redirect(token: str, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    """The link the card prints: resolve the code to its slot and track as usual."""
    slot = db.query(Slot).filter(Slot.qr_token == token).first()
    if not slot:
        return HTMLResponse("<h1>Enlace no válido</h1>", status_code=404)
    return await track_qr_redirect(slot.campaign_id, f"slot-{slot.slot_number}", request, background, db)
