"""
Where the system gets its data, and what each source costs.

Two worlds need different answers. Simulation has to behave like the real thing
without spending anything, so it leans on sources that are genuinely free: the
USPS EDDM route picker, the Census Bureau's demographics, OpenStreetMap's
business data. Live needs the one thing none of those provide — a licensed
residential file with names and addresses — and that is paid.

Every entry here says which of the two it is, whether its key is actually
configured, and what it can and cannot deliver. A source that is switched on but
has no credentials is reported as such rather than failing silently at the
moment the operator needs it.
"""

import datetime
import os
from typing import Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DataSourceSetting

router = APIRouter(prefix="/datasources", tags=["Data Sources"])

# The catalogue is code, not data: these are the integrations that exist. What
# the database stores is only whether the operator has each one switched on.
CATALOGUE: List[dict] = [
    {
        "id": "USPS_EDDM",
        "name": "USPS EDDM · Motor de rutas",
        "cost": "FREE",
        "modes": ["DEMO", "LIVE"],
        "env_key": None,
        "url": "https://eddm.usps.com/eddm/select-routes.htm",
        "default_enabled": True,
        "provides": "routes",
        "gives": (
            "Las rutas de cartero del ZIP con su conteo oficial de hogares, y además "
            "ingreso medio, edad mediana y tamaño medio de hogar POR RUTA. Es la base "
            "del motor de propensión: sobre esto se decide qué rutas se saturan."
        ),
        "lacks": "No entrega nombres ni direcciones. El reparto va a 'Postal Customer'.",
        "note": (
            "El endpoint que usa el mapa del USPS no está documentado como API "
            "pública: puede cambiar sin aviso. Si deja de responder, las rutas se "
            "importan a mano desde el sitio de EDDM."
        ),
    },
    {
        "id": "CENSUS_ACS",
        "name": "US Census Bureau · ACS 5-year",
        "cost": "FREE",
        "modes": ["DEMO", "LIVE"],
        "env_key": "CENSUS_API_KEY",
        "url": "https://api.census.gov/data/key_signup.html",
        "default_enabled": True,
        "provides": "demographics",
        "gives": (
            "Lo que el USPS no publica por ruta: tasa de propietarios (B25003), "
            "vivienda unifamiliar (B25024), vehículos por hogar (B25044) y valor "
            "mediano de la vivienda (B25077). Enriquece el score de cada ruta."
        ),
        "lacks": "Estadística agregada: nunca entrega hogares ni nombres.",
        "note": (
            "Clave gratuita, llega por correo en minutos. Sin ella el motor puntúa "
            "solo con las variables del USPS y lo dice."
        ),
    },
    {
        "id": "OSM_OVERPASS",
        "modes": ["DEMO", "LIVE"],
        "name": "OpenStreetMap · Overpass API",
        "cost": "FREE",
        "env_key": None,
        "url": "https://overpass-api.de/",
        "default_enabled": True,
        "provides": "businesses",
        "gives": "Comercios reales por giro y radio, sin cuenta y sin clave.",
        "lacks": "Sin calificaciones y muchas veces sin teléfono. Cobertura irregular.",
        "note": "Entra como respaldo cuando Yelp y Geoapify no responden.",
    },
    {
        "id": "YELP",
        "modes": ["LIVE"],
        "name": "Yelp Fusion",
        "cost": "PAID",
        "env_key": "YELP_API_KEY",
        "url": "https://docs.developer.yelp.com/docs/fusion-intro",
        "default_enabled": True,
        "provides": "businesses",
        "gives": (
            "Los oficios que OpenStreetMap no tiene: plomeros, techadores y demás "
            "contratistas que trabajan desde una camioneta y no tienen local que "
            "mapear. Trae teléfono, calificación y reseñas, filtrado a ≥3.8 "
            "estrellas, ≥3 reseñas, abierto y con número real, ordenado por cercanía."
        ),
        "lacks": "No entrega datos residenciales. Cuota diaria: 300 llamadas en este plan.",
        "note": (
            "Se consulta solo donde las fuentes gratuitas no alcanzan, y cada "
            "respuesta se cachea por microzona y giro para no gastar la cuota."
        ),
    },
    {
        "id": "GEOAPIFY",
        "modes": ["LIVE"],
        "name": "Geoapify Places",
        "cost": "PAID",
        "env_key": "GEOAPIFY_API_KEY",
        "url": "https://myprojects.geoapify.com/",
        "default_enabled": True,
        "provides": "businesses",
        "gives": "Respaldo de prospección por categoría y radio.",
        "lacks": "No entrega datos residenciales.",
        "note": "3.000 créditos al día sin costo.",
    },
    {
        "id": "CENSUS_TIGERWEB",
        "name": "Census TIGERweb · Geometrías",
        "cost": "FREE",
        "modes": ["DEMO", "LIVE"],
        "env_key": None,
        "url": "https://tigerweb.geo.census.gov/",
        "default_enabled": True,
        "provides": "geometry",
        "gives": (
            "Polígonos oficiales de block group y tract, sin cuenta ni clave. Son los "
            "que se cruzan con el trazado de cada ruta para repartirle su demografía."
        ),
        "lacks": "Solo geometría: los valores vienen del ACS.",
        "note": "Sin él, el cruce por longitud de ruta no se puede calcular.",
    },
    {
        "id": "DATA_AXLE",
        "modes": ["LIVE"],
        "name": "Data Axle · Lista residencial licenciada",
        "cost": "PAID",
        "env_key": "DATA_AXLE_API_KEY",
        "url": "https://www.dataaxleusa.com/",
        "default_enabled": False,
        "provides": "households",
        "gives": "Hogares con nombre y apellido, para direccionado nominal.",
        "lacks": "Nada de esto es gratuito y se paga por registro, cada tirada.",
        "note": (
            "OPCIONAL con el stack abierto. Una tirada de saturación ECRWSS se "
            "entrega a 'Postal Customer': no hace falta comprar nombres. Solo la "
            "necesitas si algún día quieres direccionar por nombre."
        ),
    },
]

BY_ID = {entry["id"]: entry for entry in CATALOGUE}

# Market rates gathered from public sources in September 2026. They are a
# starting point for the operator's own quotes, never a substitute: every one is
# a range published by a vendor or an industry guide, not a price anybody has
# offered this business.
MARKET_REFERENCE = {
    "updated": "2026-09-13",
    "lines": [
        {
            "id": "postage_per_piece",
            "label": "Franqueo EDDM Retail",
            "low": 0.247,
            "high": 0.247,
            "suggested": 0.247,
            "basis": "Tarifa EDDM Retail publicada para 2026 (flats hasta 3.3 oz).",
            "source": "crst.net · USPS EDDM 2026",
        },
        {
            "id": "postage_bmeu",
            "label": "Franqueo EDDM Online (entrada BMEU)",
            "low": 0.213,
            "high": 0.213,
            "suggested": 0.213,
            "basis": "Alternativa más barata al Retail si entras por BMEU con permiso.",
            "source": "crst.net · USPS EDDM 2026",
        },
        {
            "id": "print_per_piece",
            "label": "Impresión",
            "low": 0.08,
            "high": 0.25,
            "suggested": 0.21,
            "basis": (
                "Rango de mercado para postales EDDM según volumen y papel. El jumbo "
                "12×9 a dos caras está en la parte alta del rango."
            ),
            "source": "crst.net · mpressnow.com",
        },
        {
            "id": "list_per_piece",
            "label": "Lista de consumidores (segmentada)",
            "low": 0.075,
            "high": 0.15,
            "suggested": 0.11,
            "basis": (
                "$75–$150 por millar para listas con filtros de ingreso, edad y valor "
                "de vivienda. Las compiladas sin filtros bajan a $0.02 por registro."
            ),
            "source": "mailpro.org · Mailing List Pricing 2026",
        },
        {
            "id": "hygiene_per_piece",
            "label": "Higiene CASS/NCOA",
            "low": 0.002,
            "high": 0.008,
            "suggested": 0.005,
            "basis": "$2–$8 por millar de registros sobre lista propia.",
            "source": "mailpro.org · Mailing List Pricing 2026",
        },
    ],
    "data_axle_plans": [
        {"plan": "Salesgenie Basic", "monthly": 99, "annual_commitment": 1188},
        {"plan": "Salesgenie Pro", "monthly": 149, "annual_commitment": 1788},
        {"plan": "Salesgenie Team", "monthly": 299, "annual_commitment": 3588},
    ],
    "data_axle_note": (
        "Data Axle vende por suscripción (Salesgenie, término inicial de 12 meses) o "
        "por contrato a medida. No publica una tarifa por registro para listas de "
        "consumidor: ese número sale de tu cotización. El rango de mercado de arriba "
        "sirve para presupuestar mientras tanto."
    ),
}


class SourceOut(BaseModel):
    id: str
    name: str
    cost: str
    url: Optional[str] = None
    provides: str
    gives: str
    lacks: str
    note: str
    enabled: bool
    env_key: Optional[str] = None
    # True when the key exists in the environment and is not a placeholder.
    configured: bool
    updated_at: Optional[datetime.datetime] = None


class SourceUpdate(BaseModel):
    enabled: bool


def key_configured(env_key: Optional[str]) -> bool:
    if not env_key:
        return True  # nothing to configure: the source needs no credentials
    value = (os.getenv(env_key, "") or "").strip().strip('"')
    return bool(value) and not value.startswith("mock_")


def rows_for(db: Session, mode: str) -> Dict[str, DataSourceSetting]:
    mode = mode.upper()
    if mode not in ("DEMO", "LIVE"):
        raise HTTPException(status_code=422, detail="mode must be DEMO or LIVE")
    rows = {
        r.source_id: r
        for r in db.query(DataSourceSetting).filter(DataSourceSetting.mode == mode).all()
    }
    created = False
    for entry in CATALOGUE:
        if entry["id"] not in rows:
            row = DataSourceSetting(
                mode=mode,
                source_id=entry["id"],
                enabled=bool(entry["default_enabled"]),
            )
            db.add(row)
            rows[entry["id"]] = row
            created = True
    if created:
        db.commit()
    return rows


@router.get("/{mode}", response_model=List[SourceOut])
def list_sources(mode: str, db: Session = Depends(get_db)):
    rows = rows_for(db, mode)
    # Each world lists only the tools it actually uses: the free stack drives
    # simulation, the paid providers only appear where they can be billed.
    visible = [e for e in CATALOGUE if mode.upper() in e["modes"]]
    return [
        SourceOut(
            **{k: entry[k] for k in ("id", "name", "cost", "url", "provides", "gives", "lacks", "note")},
            enabled=bool(rows[entry["id"]].enabled),
            env_key=entry["env_key"],
            configured=key_configured(entry["env_key"]),
            updated_at=rows[entry["id"]].updated_at,
        )
        for entry in visible
    ]


@router.put("/{mode}/{source_id}", response_model=SourceOut)
def update_source(mode: str, source_id: str, req: SourceUpdate, db: Session = Depends(get_db)):
    entry = BY_ID.get(source_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Unknown source {source_id}")
    rows = rows_for(db, mode)
    row = rows[source_id]
    row.enabled = req.enabled
    row.updated_at = datetime.datetime.utcnow()
    db.commit()
    return SourceOut(
        **{k: entry[k] for k in ("id", "name", "cost", "url", "provides", "gives", "lacks", "note")},
        enabled=bool(row.enabled),
        env_key=entry["env_key"],
        configured=key_configured(entry["env_key"]),
        updated_at=row.updated_at,
    )


@router.get("/reference/market")
def market_reference():
    """Published rates, with what each one is and where it came from."""
    return MARKET_REFERENCE


@router.post("/test/{source_id}")
async def test_source(source_id: str, limit: int = 5):
    """
    Prove a source answers, with the smallest request that can prove it.

    Five records, not five thousand: the point is to know the pipeline works
    before anybody pays for volume.
    """
    entry = BY_ID.get(source_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Unknown source {source_id}")

    if not key_configured(entry["env_key"]):
        return {
            "source": source_id,
            "ok": False,
            "configured": False,
            "detail": (
                f"Falta {entry['env_key']} en backend/.env. Crea la cuenta en "
                f"{entry['url']} y pega la clave ahí."
            ),
            "sample": [],
        }

    if source_id == "CENSUS_ACS":
        from ..services import census_service

        profile = await census_service.zcta_profile("92880")
        return {
            "source": source_id,
            "ok": profile is not None,
            "configured": True,
            "detail": (
                "El Census respondió con la demografía real del 92880."
                if profile
                else "La clave está puesta pero el Census no devolvió datos."
            ),
            "sample": [profile] if profile else [],
        }

    if source_id == "USPS_EDDM":
        from ..services import eddm_service

        try:
            routes = eddm_service.score_routes(await eddm_service.fetch_routes("92880"))
        except eddm_service.EddmError as e:
            return {
                "source": source_id,
                "ok": False,
                "configured": True,
                "detail": str(e),
                "sample": [],
            }
        total = sum(r["residential"] for r in routes)
        return {
            "source": source_id,
            "ok": True,
            "configured": True,
            "detail": (
                f"El USPS devolvió {len(routes)} rutas del 92880 con {total:,} hogares "
                "y su demografía por ruta."
            ),
            "sample": [
                {
                    "ruta": r["route_id"],
                    "hogares": r["residential"],
                    "ingreso_medio": int(r["median_income"]),
                    "tam_hogar": r["avg_household_size"],
                    "score": r["score"],
                }
                for r in routes[:limit]
            ],
        }

    if source_id == "CENSUS_TIGERWEB":
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                r = await client.get(
                    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
                    "Tracts_Blocks/MapServer/1/query",
                    params={
                        "where": "STATE='06' AND COUNTY='065'",
                        "outFields": "GEOID",
                        "returnGeometry": "false",
                        "resultRecordCount": limit,
                        "f": "json",
                    },
                )
            features = (r.json() or {}).get("features", [])
        except Exception as e:
            return {
                "source": source_id,
                "ok": False,
                "configured": True,
                "detail": f"TIGERweb no respondió: {e}",
                "sample": [],
            }
        return {
            "source": source_id,
            "ok": bool(features),
            "configured": True,
            "detail": f"TIGERweb devolvió {len(features)} geometrías del condado de Riverside.",
            "sample": [f.get("attributes", {}) for f in features[:limit]],
        }

    if source_id == "DATA_AXLE":
        return await _test_data_axle(limit)

    if source_id == "OSM_OVERPASS":
        from ..services.lead_sourcing_service import LeadSourcingService

        service = LeadSourcingService()
        found = await service.fetch_from_osm(1, "dentists", "Eastvale", "92880")
        if not found and service.osm_last_error:
            return {
                "source": source_id,
                "ok": False,
                "configured": True,
                "detail": (
                    f"Overpass no respondió ({service.osm_last_error}). Es un servidor "
                    "público y gratuito: se satura a ratos. Vuelve a probar en un minuto."
                ),
                "sample": [],
            }
        return {
            "source": source_id,
            "ok": bool(found),
            "configured": True,
            "detail": f"OpenStreetMap devolvió {len(found)} comercios reales.",
            "sample": found[:limit],
        }

    return {
        "source": source_id,
        "ok": True,
        "configured": True,
        "detail": "Esta fuente no tiene prueba automática; se usa desde su propia sección.",
        "sample": [],
    }


# Data Axle's consumer API. The path is what their developer hub documents; if
# the contract differs for this account the error comes back verbatim so the
# operator can see exactly what their vendor answered.
DATA_AXLE_URL = "https://api.data-axle.com/v1/people/search"


async def _test_data_axle(limit: int) -> dict:
    key = (os.getenv("DATA_AXLE_API_KEY", "") or "").strip().strip('"')
    payload = {
        "filter": {
            "relation": "and",
            "conditions": [{"attribute": "postal_code", "operator": "equals", "value": "92880"}],
        },
        "limit": max(1, min(limit, 25)),
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                DATA_AXLE_URL,
                json=payload,
                headers={"X-AUTH-TOKEN": key, "Content-Type": "application/json"},
            )
    except Exception as e:
        return {
            "source": "DATA_AXLE",
            "ok": False,
            "configured": True,
            "detail": f"No se pudo contactar a Data Axle: {e}",
            "sample": [],
        }

    if resp.status_code != 200:
        return {
            "source": "DATA_AXLE",
            "ok": False,
            "configured": True,
            "detail": f"Data Axle respondió HTTP {resp.status_code}: {resp.text[:300]}",
            "sample": [],
        }

    body = resp.json()
    documents = body.get("documents") or body.get("results") or []
    return {
        "source": "DATA_AXLE",
        "ok": bool(documents),
        "configured": True,
        "detail": f"Data Axle devolvió {len(documents)} registros de prueba del 92880.",
        "sample": documents[:limit],
    }
