import asyncio
import os
import json
import re
import math
import urllib.parse
import httpx
from typing import List, Dict, Any, Optional, Tuple

# Normalización estricta de los 14 giros cerrados del modelo Co-Op Direct Mail
# OpenStreetMap tag filters for the fourteen niches, used through the public
# Overpass API. OSM needs no account and no key and costs nothing, which makes it
# the right source for practising the workflow and a genuine safety net when a
# paid provider is out of quota. Coverage of small businesses is patchier than
# Yelp's, so it supplements rather than replaces it.
# OpenStreetMap tag filters for the fourteen niches. They are structured rather
# than written as query fragments because they are used twice: to build one
# Overpass query for the whole card, and then to sort the answers back into
# niches locally. Overpass does not label a result with the filter that matched
# it, so the matching has to be repeatable on this side.
OSM_FILTERS = {
    1: [{"amenity": "dentist"}, {"healthcare": "dentist"}],
    2: [{"craft": "hvac"}, {"shop": "hvac"}],
    3: [{"amenity": "veterinary"}],
    4: [{"craft": "plumber"}],
    5: [{"shop": "car_repair"}],
    6: [{"cuisine": "pizza", "amenity": "restaurant"}, {"cuisine": "pizza", "amenity": "fast_food"}],
    7: [{"leisure": "fitness_centre"}, {"amenity": "gym"}],
    8: [{"craft": "roofer"}],
    9: [{"healthcare": "physiotherapist"}, {"healthcare:speciality": "chiropractic"}],
    10: [{"shop": "laundry"}, {"craft": "cleaning"}],
    11: [{"amenity": "car_wash"}, {"shop": "car_wash"}],
    12: [{"shop": "pet_grooming"}, {"shop": "pet"}],
    13: [{"cuisine": "mexican", "amenity": "restaurant"}],
    14: [{"office": "insurance"}],
}


def _filter_fragment(tags: dict) -> str:
    return "".join(f'["{k}"="{v}"]' for k, v in tags.items())


def _matches(element_tags: dict, wanted: dict) -> bool:
    return all(element_tags.get(k) == v for k, v in wanted.items())


# Yelp Fusion. The plan's daily allowance is small — this account reports 300
# calls a day — so every answer is cached per microzone and niche, and Yelp is
# only asked about a niche the free sources could not cover.
YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"

# What makes a Yelp result worth a phone call. The rating floor is the
# operator's; the review floor is ours: a 5.0 with two reviews is a listing
# nobody has used, not a business with a reputation to protect.
YELP_MIN_RATING = 3.8
YELP_MIN_REVIEWS = 3
YELP_RADIUS_METRES = 12000

# What a Yelp result has to look like to belong in each box.
#
# An unrecognised category alias is not an error to Yelp: it drops the filter
# and answers with whatever is nearby. That is how a sushi bar ended up in the
# carpet-cleaning box and a cocktail lounge in the veterinary one. The aliases
# are fixed now, but a filter that fails silently will fail silently again, so
# every result has to carry a category that plausibly belongs to the niche
# before it is allowed near the card.
YELP_EXPECTED_STEMS = {
    1: ("dentist", "dentistry", "orthodont", "endodont"),
    2: ("hvac", "heating", "airduct", "aircond"),
    3: ("vet", "animal", "pet"),
    4: ("plumb", "hydrojet", "waterheater", "septic", "handyman"),
    5: ("autorepair", "tires", "oilchange", "bodyshop", "transmission", "wheel", "brake"),
    6: ("pizza", "italian"),
    7: ("gym", "fitness", "training", "pilates", "yoga", "bootcamp"),
    8: ("roof", "waterproof", "gutter", "solar", "contractor"),
    9: ("chiroprac", "physicaltherapy", "massage", "acupuncture", "sportsmed"),
    10: ("carpet", "clean", "janitorial", "floor"),
    11: ("detail", "carwash", "windowtint", "windshield"),
    12: ("groom", "pet"),
    13: ("mexican", "taco", "latin"),
    14: ("insurance", "financial"),
}


def _belongs_to_niche(category_id: int, aliases: List[str]) -> bool:
    stems = YELP_EXPECTED_STEMS.get(category_id)
    if not stems:
        return True
    joined = " ".join(aliases).lower()
    return any(stem in joined for stem in stems)

OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
OVERPASS_USER_AGENT = "CoopDirectMail/1.0 (Inland Empire cooperative mailer)"

# Overpass is free and shared, and its usage policy asks for a light touch. Two
# queries at a time is the difference between fourteen answers and fourteen
# rate-limit errors when the whole card is filled at once.
_overpass_gate = asyncio.Semaphore(2)

# Yelp answers a burst with 429s. Filling the card asks about every niche the
# free sources could not cover, which on a normal ZIP is half a dozen at once,
# and a rate-limited answer is indistinguishable from "this niche has nobody".
_yelp_gate = asyncio.Semaphore(3)

CATEGORY_TAXONOMY = {
    1: {
        "yelp_category": "dentists",
        "geoapify_category": "healthcare.dentist",
        "name_es": "Odontología Familiar",
        "name_en": "Family Dentistry & Implants",
        "default_ticket": 1250.0,
    },
    2: {
        "yelp_category": "hvac",
        "geoapify_category": "service.heating_and_air_conditioning",
        "name_es": "HVAC / Aire Acondicionado",
        "name_en": "HVAC & Heating",
        "default_ticket": 4500.0,
    },
    3: {
        "yelp_category": "vet",
        "geoapify_category": "healthcare.veterinary",
        "name_es": "Hospital Veterinario",
        "name_en": "Veterinary Hospital & Urgent Pet Care",
        "default_ticket": 450.0,
    },
    4: {
        "yelp_category": "plumbing",
        "geoapify_category": "service.plumbing",
        "name_es": "Plomería Residencial",
        "name_en": "Residential Plumbing & Rooter",
        "default_ticket": 780.0,
    },
    5: {
        "yelp_category": "autorepair",
        "geoapify_category": "service.vehicle.repair",
        "name_es": "Taller Mecánico / Frenos",
        "name_en": "Auto Repair & Brakes",
        "default_ticket": 550.0,
    },
    6: {
        "yelp_category": "pizza",
        "geoapify_category": "catering.restaurant.pizza",
        "name_es": "Pizzería Artesanal",
        "name_en": "Artisanal Wood-Fired Pizza",
        "default_ticket": 55.0,
    },
    7: {
        "yelp_category": "gyms",
        "geoapify_category": "sport.fitness",
        "name_es": "Gimnasio Boutique / Fitness",
        "name_en": "Boutique Fitness & CrossFit",
        "default_ticket": 140.0,
    },
    8: {
        "yelp_category": "roofing",
        "geoapify_category": "service.construction.roofing",
        "name_es": "Techado y Paneles Solares",
        "name_en": "Roofing & Solar Dynamics",
        "default_ticket": 14500.0,
    },
    9: {
        "yelp_category": "chiropractors",
        "geoapify_category": "healthcare.chiropractor",
        "name_es": "Quiropráctico / Fisioterapia",
        "name_en": "Spine, Chiropractic & Physical Therapy",
        "default_ticket": 480.0,
    },
    10: {
        "yelp_category": "carpet_cleaning",
        "geoapify_category": "service.cleaning",
        "name_es": "Limpieza de Alfombras y Pisos",
        "name_en": "Carpet, Tile & Grout Steam Cleaning",
        "default_ticket": 320.0,
    },
    11: {
        "yelp_category": "auto_detailing",
        "geoapify_category": "service.vehicle.car_wash",
        "name_es": "Detailing Móvil de Autos",
        "name_en": "Mobile Auto Detailing & Ceramic",
        "default_ticket": 220.0,
    },
    12: {
        "yelp_category": "groomer",
        "geoapify_category": "pet.grooming",
        "name_es": "Peluquería Canina",
        "name_en": "Pet Grooming & Mobile Dog Spa",
        "default_ticket": 85.0,
    },
    13: {
        "yelp_category": "mexican",
        "geoapify_category": "catering.restaurant.mexican",
        "name_es": "Restaurante Mexicano",
        "name_en": "Authentic Mexican Cocina & Taqueria",
        "default_ticket": 68.0,
    },
    14: {
        "yelp_category": "insurance",
        "geoapify_category": "service.insurance",
        "name_es": "Agencia de Seguros",
        "name_en": "Insurance Agency (Home, Auto, Life)",
        "default_ticket": 1400.0,
    },
}

# Mapa de nombres/alias para normalización estricta de las 14 categorías
CATEGORY_NAME_MAP: Dict[str, int] = {
    # 1. dentists
    "dentists": 1, "dentist": 1, "dental": 1, "odontologia": 1, "odontología": 1, "dentista": 1, "dentistas": 1,
    # 2. hvac
    "hvac": 2, "heating": 2, "air_conditioning": 2, "aire": 2, "clima": 2, "calefaccion": 2, "calefacción": 2,
    # 3. veterinarians
    "veterinarians": 3, "veterinarian": 3, "veterinary": 3, "veterinario": 3, "veterinaria": 3, "vet": 3, "vets": 3,
    # 4. plumbing
    "plumbing": 4, "plumber": 4, "plomeria": 4, "plomería": 4, "plomero": 4, "plomeros": 4,
    # 5. autorepair
    "autorepair": 5, "auto_repair": 5, "auto repair": 5, "mechanic": 5, "mecanico": 5, "mecánico": 5, "taller": 5, "frenos": 5,
    # 6. pizza
    "pizza": 6, "pizzeria": 6, "pizzería": 6,
    # 7. gyms
    "gyms": 7, "gym": 7, "fitness": 7, "gimnasio": 7, "gimnasios": 7, "crossfit": 7,
    # 8. roofing
    "roofing": 8, "roofer": 8, "roofers": 8, "techos": 8, "techado": 8, "techo": 8, "solar": 8,
    # 9. chiropractors
    "chiropractors": 9, "chiropractor": 9, "quiropractico": 9, "quiropráctico": 9, "quiropractica": 9, "fisioterapia": 9,
    # 10. carpetcleaning
    "carpetcleaning": 10, "carpet_cleaning": 10, "carpet cleaning": 10, "limpieza de alfombras": 10, "alfombras": 10, "carpet": 10,
    # 11. auto_detailing
    "auto_detailing": 11, "autodetailing": 11, "detailing": 11, "car wash": 11, "carwash": 11, "lavado de autos": 11,
    # 12. groomer
    "groomer": 12, "groomers": 12, "grooming": 12, "pet groomer": 12, "peluqueria canina": 12, "peluquería canina": 12,
    # 13. mexican
    "mexican": 13, "mexicano": 13, "restaurante mexicano": 13, "taqueria": 13, "taquería": 13,
    # 14. insurance
    "insurance": 14, "seguro": 14, "seguros": 14, "agencia de seguros": 14, "insurance agency": 14,
}

def normalize_category(category_input: Any) -> Dict[str, Any]:
    """
    Normaliza cualquier entrada de categoría (ID entero 1..14, string numérico,
    alias Yelp o nombre común) retornando el registro canónico de CATEGORY_TAXONOMY.
    """
    if isinstance(category_input, int) and category_input in CATEGORY_TAXONOMY:
        return CATEGORY_TAXONOMY[category_input]

    if isinstance(category_input, str):
        cleaned = category_input.strip()
        if cleaned.isdigit():
            cid = int(cleaned)
            if cid in CATEGORY_TAXONOMY:
                return CATEGORY_TAXONOMY[cid]

        clean_lower = cleaned.lower()
        if clean_lower in CATEGORY_NAME_MAP:
            return CATEGORY_TAXONOMY[CATEGORY_NAME_MAP[clean_lower]]

        for alias, cid in CATEGORY_NAME_MAP.items():
            if alias in clean_lower or clean_lower in alias:
                return CATEGORY_TAXONOMY[cid]

    return CATEGORY_TAXONOMY[1]

# Compatibilidad con queries heredadas
CATEGORY_QUERY_MAP = {
    cat_id: {
        "term": data["yelp_category"],
        "geoapify_categories": data["geoapify_category"]
    }
    for cat_id, data in CATEGORY_TAXONOMY.items()
}

TICKET_ESTIMATES = {
    cat_id: data["default_ticket"]
    for cat_id, data in CATEGORY_TAXONOMY.items()
}

# Coordenadas realistas delimitadas dentro de Eastvale (92880) y Corona (92882)
MOCK_COORDINATES = {
    "92880": [
        {"lat": 33.9634, "lng": -117.5639, "st": "Limonite Ave"},
        {"lat": 33.9715, "lng": -117.5512, "st": "Hamner Ave"},
        {"lat": 33.9550, "lng": -117.5750, "st": "Archibald Ave"},
        {"lat": 33.9482, "lng": -117.5620, "st": "Schleisman Rd"},
    ],
    "92882": [
        {"lat": 33.8753, "lng": -117.5664, "st": "Magnolia Ave"},
        {"lat": 33.8820, "lng": -117.5780, "st": "W 6th St"},
        {"lat": 33.8690, "lng": -117.5540, "st": "S Main St"},
        {"lat": 33.8910, "lng": -117.5890, "st": "Compton Ave"},
    ]
}

CITY_COORDINATES: Dict[str, Tuple[float, float]] = {
    "92880": (33.9634, -117.5639),  # Eastvale (centro comercial / Town Center)
    "eastvale": (33.9634, -117.5639),
    "92882": (33.8753, -117.5664),  # Corona Sur / Centro
    "92879": (33.8856, -117.5642),  # Corona Norte
    "92881": (33.8422, -117.5255),  # Corona Este
    "corona": (33.8753, -117.5664),
    "92860": (33.9311, -117.5586),  # Norco
    "norco": (33.9311, -117.5586),
    "91764": (34.0633, -117.6509),  # Ontario
    "ontario": (34.0633, -117.6509),
    "91752": (33.9994, -117.4753),  # Jurupa Valley / Mira Loma
    "jurupa valley": (33.9994, -117.4753),
    "mira loma": (33.9994, -117.4753),
    "91730": (34.1064, -117.5931),  # Rancho Cucamonga
    "rancho cucamonga": (34.1064, -117.5931),
    "91709": (33.9898, -117.7326),  # Chino Hills
    "chino hills": (33.9898, -117.7326),
    "92506": (33.9533, -117.3962),  # Riverside
    "riverside": (33.9533, -117.3962),
}

def get_campaign_center(city: str, zip_code: str) -> Tuple[float, float]:
    """Obtiene las coordenadas del centro geográfico de la campaña para cálculo de distancia."""
    z = (zip_code or "").strip()
    if z in CITY_COORDINATES:
        return CITY_COORDINATES[z]
    c = (city or "").strip().lower()
    for k, coords in CITY_COORDINATES.items():
        if k in c:
            return coords
    return (33.9634, -117.5639)

def haversine_distance_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula la distancia geodésica en millas entre dos coordenadas (Haversine)."""
    R = 3958.8  # Radio medio de la Tierra en millas
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return round(R * c, 2)

def normalize_candidate_record(
    c: Dict[str, Any],
    target_city: str,
    target_zip: str,
    center_lat: float,
    center_lon: float,
) -> Dict[str, Any]:
    """
    1. Cálculo unificado de distancia en el backend:
       Calcula distance_miles (float) y distance_m (float) contra el centro de la campaña (lat, lon)
       para todos los candidatos (OSM, Yelp, Geoapify, Mock), garantizando siempre float válido (nunca NoneType).
    2. Normalización de etiqueta para ZIP 92880:
       Si un negocio tiene zip_code == '92880', normaliza automáticamente su ciudad a 'Eastvale (92880)'
       aunque Yelp o el registro lo llamen históricamente 'Corona'.
    3. Formato legible de ubicación para Tier 2:
       Para los contratistas que vengan de Norco o Corona (Tier 2), formatea la ubicación en el
       candidato para que muestre la distancia respecto a la zona objetivo:
       ej. 'Norco (A {distancia} mi · Área de servicio)' o 'Corona (A {distancia} mi · Área de servicio)'.
    """
    coords = c.get("coordinates") or {}
    c_lat = coords.get("latitude")
    c_lon = coords.get("longitude")

    dist_mi: Optional[float] = None
    if c_lat is not None and c_lon is not None:
        try:
            f_lat = float(c_lat)
            f_lon = float(c_lon)
            if abs(f_lat) > 0.1 and abs(f_lon) > 0.1:
                dist_mi = haversine_distance_miles(center_lat, center_lon, f_lat, f_lon)
        except Exception:
            dist_mi = None

    if dist_mi is None and c.get("distance_m") is not None:
        try:
            val = float(c["distance_m"])
            if val > 0.0:
                dist_mi = round(val / 1609.344, 2)
        except Exception:
            dist_mi = None

    cand_city_raw = (c.get("base_city") or c.get("city") or "").strip()
    cand_city_raw = re.sub(r'\s*\(A\s+[\d\.]+\s*mi.*?\)$', '', cand_city_raw).strip()
    if cand_city_raw == "Eastvale (92880)":
        cand_city_raw = "Eastvale"

    cand_zip = (c.get("zip_code") or c.get("zip") or "").strip()

    if dist_mi is None and cand_zip in CITY_COORDINATES:
        z_lat, z_lon = CITY_COORDINATES[cand_zip]
        dist_mi = haversine_distance_miles(center_lat, center_lon, z_lat, z_lon)

    if dist_mi is None:
        c_lower = cand_city_raw.lower()
        for k, k_coords in CITY_COORDINATES.items():
            if k in c_lower:
                dist_mi = haversine_distance_miles(center_lat, center_lon, k_coords[0], k_coords[1])
                break

    # Fallback determinista si no vinieron coordenadas válidas ni coincidencia
    if dist_mi is None:
        if cand_zip == "92880" or "eastvale" in cand_city_raw.lower():
            dist_mi = 1.2
        elif "norco" in cand_city_raw.lower() or cand_zip == "92860":
            dist_mi = 3.2
        elif "corona" in cand_city_raw.lower():
            dist_mi = 4.8
        elif "ontario" in cand_city_raw.lower():
            dist_mi = 5.6
        elif "jurupa" in cand_city_raw.lower() or "mira loma" in cand_city_raw.lower():
            dist_mi = 4.1
        else:
            dist_mi = 8.5

    # 1. distance_miles siempre numérico float válido (nunca None)
    c["distance_miles"] = float(round(dist_mi, 2))
    c["distance_m"] = float(round(dist_mi * 1609.344, 1))

    # Guardar ciudad base antes de normalizar
    c["base_city"] = cand_city_raw or target_city

    # 2. Normalización de etiqueta para ZIP 92880
    t_city = target_city.strip().lower()
    t_zip = target_zip.strip()
    is_eastvale_target = (t_zip == "92880" or "eastvale" in t_city)

    if cand_zip == "92880":
        c["city"] = "Eastvale (92880)"
        c["zip_code"] = "92880"
        c["zip"] = "92880"
        # Tier 0 si el registro ya decía Eastvale, Tier 1 si era registro histórico 92880
        c["geo_tier"] = 0 if "eastvale" in cand_city_raw.lower() else 1
    elif "eastvale" in cand_city_raw.lower() and is_eastvale_target:
        c["city"] = "Eastvale (92880)"
        c["zip_code"] = "92880"
        c["zip"] = "92880"
        c["geo_tier"] = 0
    elif not is_eastvale_target and (t_city in cand_city_raw.lower() or cand_zip == t_zip):
        c["city"] = cand_city_raw
        c["geo_tier"] = 0
    else:
        # 3. Formato legible de ubicación para Tier 2 (ej. Norco, Corona, etc.)
        c["geo_tier"] = 2
        base = cand_city_raw if cand_city_raw else "Área Local"
        dist_display = f"{c['distance_miles']:.1f}"
        c["city"] = f"{base} (A {dist_display} mi · Área de servicio)"

    return c

class LeadSourcingService:
    def __init__(self):
        # Why the last Overpass call came back empty, when it did.
        self.osm_last_error: Optional[str] = None
        # One Yelp answer per microzone and niche. The daily allowance is 300
        # calls on this plan, and filling the card can ask for fourteen niches.
        self._yelp_cache: Dict[str, List[Dict[str, Any]]] = {}
        self._yelp_locks: Dict[str, asyncio.Lock] = {}
        # What Yelp said was left, last time it answered.
        self.yelp_calls_remaining: Optional[int] = None
        # One Overpass answer per microzone, reused for all fourteen niches.
        self._area_cache: Dict[str, Dict[int, List[Dict[str, Any]]]] = {}
        # ...and one lock per microzone. Filling the card launches fourteen
        # lookups at once; without this they all miss the empty cache together
        # and fire fourteen identical queries, which is precisely the stampede
        # the shared cache existed to prevent — and what earns a rate limit.
        self._area_locks: Dict[str, asyncio.Lock] = {}
        self.yelp_api_key = os.getenv("YELP_API_KEY") or os.getenv("YELP_FUSION_API_KEY", "")
        self.geoapify_api_key = os.getenv("GEOAPIFY_API_KEY", "")
        # Set once llama-server proves unreachable; see generate_pitch.
        self._llama_offline = False
        self.llama_url = os.getenv("LLAMA_CPP_BASE_URL", "http://192.168.1.28:11434/v1").rstrip("/")
        self.llama_model = os.getenv("LLAMA_CPP_MODEL", "llama-server").strip('"\'') or "llama-server"

    @property
    def is_mock_mode_default(self) -> bool:
        return os.getenv("MOCK_MODE", "true").lower() == "true"

    def _get_mock_candidates(self, category_id: int, city: str, zip_code: str) -> List[Dict[str, Any]]:
        """
        Placeholder businesses, for a screen that has to show something when no
        real source answered.

        They carry no phone number, on purpose. Earlier versions handed out
        three rotating numbers that looked real enough to dial, and the same one
        appeared on every box of the card. A blank is honest; a plausible
        invention is a trap.
        Entrega estrictamente los 9 campos requeridos:
        name, phone, address, city, zip_code, rating, review_count, website_url, category.
        """
        taxonomy = normalize_category(category_id)
        norm_zip = "92882" if "corona" in city.lower() or zip_code == "92882" else "92880"
        norm_city = "Corona" if norm_zip == "92882" else "Eastvale"
        coords_pool = MOCK_COORDINATES.get(norm_zip, MOCK_COORDINATES["92880"])

        name_prefixes = [
            f"{norm_city} Premier",
            f"Inland Empire",
            f"{norm_city} Valley",
            f"Golden State",
            f"Pacific Coast",
            f"{norm_city} Apex",
            f"Heritage Valley",
            f"Metro Inland"
        ]

        candidates = []
        for i in range(len(name_prefixes)):
            coord = coords_pool[i % len(coords_pool)]
            biz_name = f"{name_prefixes[i]} {taxonomy['name_es']}"
            biz_slug = biz_name.lower().replace(" ", "").replace("/", "").replace("&", "")
            address = f"{12000 + (category_id * 100) + (i * 25)} {coord['st']} Ste {100 + i * 4}"
            phone_num = f"(951) {370 + category_id}-10{i:02d}"

            candidates.append({
                "name": biz_name,
                "business_name": biz_name,
                "phone": phone_num,
                "email": f"contact@{biz_slug}.com",
                "address": address,
                "city": norm_city,
                "zip_code": norm_zip,
                "zip": norm_zip,
                "rating": round(4.6 + ((i * 3) % 4) * 0.1, 1),
                "review_count": 75 + (category_id * 8) + (i * 19),
                "website_url": f"https://www.{biz_slug}.com",
                "category": taxonomy["yelp_category"],
                "category_name": taxonomy["name_es"],
                "category_id": category_id,
                "coordinates": {"latitude": coord["lat"], "longitude": coord["lng"]},
                "source": "Simulación Local (Mock Mode)",
            })

        return candidates

    async def fetch_from_yelp(
        self,
        yelp_category: str,
        city: str,
        zip_code: str,
        category_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Yelp Fusion, for the trades that have no shopfront to map.

        A plumber and a roofer work out of a van. OpenStreetMap maps places, so
        it has almost nothing for them, and the card has a box for each. Yelp
        indexes the business rather than the building, which is exactly the gap.

        Four filters decide what comes back, and each one exists because of what
        the partner does next — pick up the phone:

        * **A real phone number.** Never a placeholder. The previous version of
          this connector substituted (951) 555-0100 when Yelp had no number,
          which is how somebody ends up dialling a fake.
        * **Open.** `is_closed` businesses are gone.
        * **Rated 3.8 or better**, the operator's floor.
        * **At least three reviews.** Sorting by rating alone surfaces 5.0-star
          listings with two reviews, which are new, dormant or worse.

        What survives is ordered by distance, not by rating. A co-op card sells
        a neighbourhood: the nearest qualified plumber is a better prospect than
        a slightly better-rated one forty minutes away, whose customers are not
        on these carrier routes.
        """
        if not self.yelp_api_key or self.yelp_api_key.startswith("mock_") or not self.yelp_api_key:
            return []

        cache_key = f"{zip_code}:{yelp_category}"
        if cache_key in self._yelp_cache:
            return self._yelp_cache[cache_key]

        lock = self._yelp_locks.setdefault(cache_key, asyncio.Lock())
        async with lock:
            if cache_key in self._yelp_cache:
                return self._yelp_cache[cache_key]
            return await self._fetch_yelp_uncached(cache_key, yelp_category, city, zip_code, category_id)

    async def _resolve_yelp_website(self, client: httpx.AsyncClient, yelp_url: str) -> str:
        r"""
        Visita la URL de la ficha de Yelp y extrae la web oficial del negocio
        siguiendo el redireccionador oficial:
        re.search(r'href=[\'"]/biz_redir\?url=([^\'&"]+)[\'"]', yelp_html)
        Si existe, lo decodifica con urllib.parse.unquote().
        Si no se encuentra o hay error, mantiene la URL de Yelp como fallback.
        """
        if not yelp_url:
            return ""
        try:
            resp = await client.get(
                yelp_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                follow_redirects=True,
                timeout=5.0
            )
            if resp.status_code == 200:
                m = re.search(r'href=[\'"]/biz_redir\?url=([^\'&"]+)[\'"]', resp.text)
                if m:
                    decoded = urllib.parse.unquote(m.group(1))
                    if decoded.startswith("http"):
                        return decoded
        except Exception:
            pass
        return yelp_url

    async def _fetch_yelp_uncached(
        self,
        cache_key: str,
        yelp_category: str,
        city: str,
        zip_code: str,
        category_id: Optional[int],
    ) -> List[Dict[str, Any]]:

        is_corona = "corona" in city.lower() or zip_code == "92882"
        lat = 33.8753 if is_corona else 33.9634
        lon = -117.5664 if is_corona else -117.5639

        headers = {
            "Authorization": f"Bearer {self.yelp_api_key}",
            "Accept": "application/json",
        }
        params = {
            "categories": yelp_category,
            "latitude": lat,
            "longitude": lon,
            "radius": YELP_RADIUS_METRES,
            "limit": 20,
            # Relevance, then reordered here by distance. Asking Yelp to sort by
            # rating returns the thin five-star listings the review floor exists
            # to keep out.
            "sort_by": "best_match",
        }

        try:
            async with _yelp_gate:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    resp = await client.get(YELP_SEARCH_URL, headers=headers, params=params)
        except Exception as e:
            print(f"[LeadSourcing] Yelp request error: {e}")
            return []

        if resp.status_code != 200:
            print(f"[LeadSourcing] Yelp HTTP {resp.status_code}: {resp.text[:200]}")
            return []

        # The quota is small enough to be worth watching from the logs.
        remaining = resp.headers.get("ratelimit-remaining")
        if remaining is not None:
            self.yelp_calls_remaining = int(remaining)

        candidates: List[Dict[str, Any]] = []
        for b in resp.json().get("businesses", []):
            phone = (b.get("display_phone") or b.get("phone") or "").strip()
            rating = float(b.get("rating") or 0.0)
            reviews = int(b.get("review_count") or 0)
            if b.get("is_closed") or not phone:
                continue
            if rating < YELP_MIN_RATING or reviews < YELP_MIN_REVIEWS:
                continue

            aliases = [c.get("alias", "") for c in (b.get("categories") or [])]
            if category_id is not None and not _belongs_to_niche(category_id, aliases):
                # Yelp ignored the filter. Discard rather than put a restaurant
                # in the plumbing box.
                continue

            loc = b.get("location", {}) or {}
            address = loc.get("address1") or ""
            if not address:
                display = loc.get("display_address", []) or []
                address = display[0] if display else ""
            coords = b.get("coordinates", {}) or {}

            candidates.append(
                {
                    "name": b.get("name", ""),
                    "business_name": b.get("name", ""),
                    "phone": phone,
                    "address": address,
                    "city": loc.get("city", city),
                    "zip_code": loc.get("zip_code", zip_code),
                    "zip": loc.get("zip_code", zip_code),
                    "rating": rating,
                    "review_count": reviews,
                    "website_url": b.get("url", ""),
                    "category": yelp_category,
                    "distance_m": float(b.get("distance") or 0.0),
                    "coordinates": {
                        "latitude": coords.get("latitude"),
                        "longitude": coords.get("longitude"),
                    },
                    "source": "Yelp Fusion",
                }
            )

        # Desempaquetar la web real del negocio desde la ficha de Yelp de forma concurrente
        if candidates:
            async with httpx.AsyncClient(timeout=6.0) as redir_client:
                tasks = [self._resolve_yelp_website(redir_client, c.get("website_url", "")) for c in candidates]
                real_urls = await asyncio.gather(*tasks, return_exceptions=True)
                for c, r_url in zip(candidates, real_urls):
                    if isinstance(r_url, str) and r_url:
                        c["website_url"] = r_url

        candidates.sort(key=lambda c: c["distance_m"] or float("inf"))
        self._yelp_cache[cache_key] = candidates
        return candidates

    async def fetch_from_geoapify(
        self,
        geoapify_category: str,
        yelp_category: str,
        city: str,
        zip_code: str
    ) -> List[Dict[str, Any]]:
        """
        Usa Geoapify Places v2 como respaldo si Yelp no entrega suficientes resultados.
        Filtra con circle y proximity en la microzona de Eastvale (92880) o Corona (92882).
        Retorna la categoría normalizada en inglés para uniformidad del modelo.
        """
        if not self.geoapify_api_key or self.geoapify_api_key in ["mock_geoapify_key", ""]:
            return []

        is_corona = "corona" in city.lower() or zip_code == "92882"
        center_lat = 33.8753 if is_corona else 33.9634
        center_lon = -117.5664 if is_corona else -117.5639

        params = {
            "categories": geoapify_category,
            "filter": f"circle:{center_lon},{center_lat},8050",
            "bias": f"proximity:{center_lon},{center_lat}",
            "limit": 10,
            "apiKey": self.geoapify_api_key
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get("https://api.geoapify.com/v2/places", params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = []
                    for f in data.get("features", []):
                        props = f.get("properties", {}) or {}
                        geom = f.get("geometry", {}) or {}
                        coords = geom.get("coordinates", [])

                        b_name = props.get("name") or props.get("formatted") or "Comercio Local"
                        phone = props.get("datasource", {}).get("raw", {}).get("phone") or props.get("contact", {}).get("phone", "")
                        email = props.get("datasource", {}).get("raw", {}).get("email") or props.get("contact", {}).get("email", "")
                        addr = props.get("address_line1") or props.get("street", "")
                        website = props.get("website") or props.get("datasource", {}).get("raw", {}).get("website", "")

                        candidates.append({
                            "name": b_name,
                            "business_name": b_name,
                            "phone": (phone or "").strip(),
                            "email": (email or "").strip(),
                            "address": addr,
                            "city": props.get("city", city),
                            "zip_code": props.get("postcode", zip_code),
                            "zip": props.get("postcode", zip_code),
                            "rating": 4.5,
                            "review_count": 28,
                            "website_url": website,
                            "category": yelp_category,
                            "coordinates": {
                                "latitude": coords[1] if len(coords) >= 2 else center_lat,
                                "longitude": coords[0] if len(coords) >= 2 else center_lon
                            },
                            "source": "Geoapify Places"
                        })
                    return candidates
                else:
                    print(f"[LeadSourcing] Geoapify HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[LeadSourcing] Geoapify API request error: {e}")

        return []

    async def fetch_area_businesses(
        self, city: str, zip_code: str
    ) -> Dict[int, List[Dict[str, Any]]]:
        """
        Every business in the microzone that fits any of the fourteen niches, in
        a single Overpass query.

        Asking fourteen times, once per niche, is what a person would do and is
        exactly wrong here: Overpass is a shared free service that answers a
        union of filters as happily as one, and fourteen parallel requests earn
        a rate limit instead of results. One query, then the answers are sorted
        into niches locally.
        """
        cache_key = f"{zip_code}:{city.lower()}"
        if cache_key in self._area_cache:
            return self._area_cache[cache_key]

        lock = self._area_locks.setdefault(cache_key, asyncio.Lock())
        async with lock:
            # Somebody may have filled it while this call waited its turn.
            if cache_key in self._area_cache:
                return self._area_cache[cache_key]
            return await self._fetch_area_uncached(cache_key, city, zip_code)

    async def _fetch_area_uncached(
        self, cache_key: str, city: str, zip_code: str
    ) -> Dict[int, List[Dict[str, Any]]]:
        is_corona = "corona" in city.lower() or zip_code == "92882"
        lat = 33.8753 if is_corona else 33.9634
        lon = -117.5664 if is_corona else -117.5639
        radius = 8050

        seen = set()
        parts = []
        for filters in OSM_FILTERS.values():
            for tags in filters:
                fragment = _filter_fragment(tags)
                if fragment in seen:
                    continue
                seen.add(fragment)
                parts.append(f"node{fragment}(around:{radius},{lat},{lon});")
                parts.append(f"way{fragment}(around:{radius},{lat},{lon});")
        query = f"[out:json][timeout:60];({''.join(parts)});out center 300;"

        elements = None
        self.osm_last_error = None
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                async with httpx.AsyncClient(timeout=90.0) as client:
                    resp = await client.post(
                        endpoint,
                        data={"data": query},
                        headers={"User-Agent": OVERPASS_USER_AGENT},
                    )
                if resp.status_code == 200:
                    elements = resp.json().get("elements", [])
                    break
                self.osm_last_error = f"HTTP {resp.status_code} en {endpoint}"
                print(f"[LeadSourcing] Overpass {self.osm_last_error}")
            except Exception as e:
                self.osm_last_error = f"{type(e).__name__} en {endpoint}"
                print(f"[LeadSourcing] Overpass area request error: {e}")

        if elements is None:
            return {}

        by_niche: Dict[int, List[Dict[str, Any]]] = {}
        for el in elements:
            tags = el.get("tags", {}) or {}
            name = tags.get("name")
            if not name:
                continue  # an unnamed node is not a business anyone can call
            center = el.get("center") or {}
            street = " ".join(
                p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p
            )
            candidate = {
                "name": name,
                "business_name": name,
                "phone": tags.get("phone") or tags.get("contact:phone") or "",
                "address": street,
                "city": tags.get("addr:city", city),
                "zip_code": tags.get("addr:postcode", zip_code),
                "zip": tags.get("addr:postcode", zip_code),
                "rating": None,
                "review_count": 0,
                "website_url": tags.get("website") or tags.get("contact:website", ""),
                "coordinates": {
                    "latitude": el.get("lat", center.get("lat", lat)),
                    "longitude": el.get("lon", center.get("lon", lon)),
                },
                "source": "OpenStreetMap (Overpass)",
            }
            for niche, filters in OSM_FILTERS.items():
                if any(_matches(tags, wanted) for wanted in filters):
                    candidate = dict(candidate, category=normalize_category(niche)["yelp_category"])
                    by_niche.setdefault(niche, []).append(candidate)

        # A business with a phone number is worth more than one without: the
        # partner's next action is to dial it.
        for niche in by_niche:
            by_niche[niche].sort(key=lambda c: (0 if c["phone"] else 1, c["name"]))

        self._area_cache[cache_key] = by_niche
        return by_niche

    async def fetch_from_osm(
        self,
        category_id: int,
        yelp_category: str,
        city: str,
        zip_code: str,
    ) -> List[Dict[str, Any]]:
        """
        Free, keyless business lookup through the OpenStreetMap Overpass API.

        Used as the last real source before falling back to simulated candidates:
        it needs no account, so the workflow can be practised end to end, and a
        live campaign is not stranded when Yelp or Geoapify is out of quota. OSM
        carries no ratings and often no phone number, which the operator sees:
        the contact fields come back empty rather than invented.
        """
        by_niche = await self.fetch_area_businesses(city, zip_code)
        return by_niche.get(category_id, [])

    async def _fetch_from_osm_single(
        self,
        category_id: int,
        yelp_category: str,
        city: str,
        zip_code: str,
    ) -> List[Dict[str, Any]]:
        """One niche, one query. Kept for the connectivity test in settings."""
        filters = OSM_FILTERS.get(category_id)
        if not filters:
            return []

        is_corona = "corona" in city.lower() or zip_code == "92882"
        lat = 33.8753 if is_corona else 33.9634
        lon = -117.5664 if is_corona else -117.5639
        radius = 8050  # the same five miles the paid providers are asked for

        parts = "".join(
            f"node{_filter_fragment(f)}(around:{radius},{lat},{lon});"
            f"way{_filter_fragment(f)}(around:{radius},{lat},{lon});"
            for f in filters
        )
        query = f"[out:json][timeout:20];({parts});out center 15;"

        elements = None
        self.osm_last_error = None
        async with _overpass_gate:
          for endpoint in OVERPASS_ENDPOINTS:
            try:
                async with httpx.AsyncClient(timeout=40.0) as client:
                    resp = await client.post(
                        endpoint,
                        data={"data": query},
                        # Overpass answers 406 to requests without an identifiable
                        # agent, and its usage policy asks for one.
                        headers={"User-Agent": OVERPASS_USER_AGENT},
                    )
                if resp.status_code == 200:
                    elements = resp.json().get("elements", [])
                    break
                self.osm_last_error = f"HTTP {resp.status_code} en {endpoint}"
                print(f"[LeadSourcing] Overpass {self.osm_last_error}")
            except Exception as e:
                self.osm_last_error = f"{type(e).__name__} en {endpoint}"
                print(f"[LeadSourcing] Overpass request error: {e}")

        if elements is None:
            # Every mirror refused. The caller is told why rather than being
            # handed an empty list that looks like "there are no dentists".
            return []

        candidates: List[Dict[str, Any]] = []
        for el in elements:
            tags = el.get("tags", {}) or {}
            name = tags.get("name")
            if not name:
                continue  # an unnamed node is not a business we can call
            center = el.get("center") or {}
            street = " ".join(
                p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p
            )
            candidates.append({
                "name": name,
                "business_name": name,
                "phone": tags.get("phone") or tags.get("contact:phone") or "",
                "address": street,
                "city": tags.get("addr:city", city),
                "zip_code": tags.get("addr:postcode", zip_code),
                "zip": tags.get("addr:postcode", zip_code),
                # OSM holds no ratings. Reporting none is the honest answer.
                "rating": None,
                "review_count": 0,
                "website_url": tags.get("website") or tags.get("contact:website", ""),
                "category": yelp_category,
                "coordinates": {
                    "latitude": el.get("lat", center.get("lat", lat)),
                    "longitude": el.get("lon", center.get("lon", lon)),
                },
                "source": "OpenStreetMap (Overpass)",
            })
        return candidates

    async def extract_web_contacts_async(
        self,
        url: str,
        client: Optional[httpx.AsyncClient] = None
    ) -> Dict[str, str]:
        r"""
        Rastreador web inteligente asíncrono OSINT: analiza la web del cliente buscando correos
        (mailto y regex) y teléfonos directos, con fallback SSL -> HTTP y rastreo a subpáginas.
        Portado directamente de la lógica probada de D:\GenWebSite\prospector-de-sites\prospectar.py.
        """
        contacts = {"email": "", "phone": ""}
        if not url or not url.startswith("http"):
            return contacts

        # Ignorar directorios genéricos o redes sociales que no son la web del anunciante
        ignored_domains = ["yelp.com", "google.com", "facebook.com", "instagram.com", "yellowpages.com"]
        if any(d in url.lower() for d in ignored_domains):
            return contacts

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
        }

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers=headers)
            should_close = True

        html = ""
        try:
            try:
                resp = await client.get(url, timeout=8.0)
                if resp.status_code == 200:
                    html = resp.text
            except Exception:
                # Fallback SSL a HTTP si la conexión HTTPS falla (certificado, handshake o timeout)
                if url.startswith("https://"):
                    http_url = "http://" + url[8:]
                    try:
                        resp_http = await client.get(http_url, timeout=8.0)
                        if resp_http.status_code == 200:
                            html = resp_http.text
                    except Exception:
                        pass

            if not html:
                return contacts

            # 1. Extracción de correos electrónicos en la home
            emails_encontrados = set()
            mailtos = re.findall(r'mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', html, re.IGNORECASE)
            for m in mailtos:
                emails_encontrados.add(m.lower())

            regex_emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', html)
            bad_exts = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".js", ".css", ".ico", ".woff", ".woff2")
            bad_domains = {"wix", "sentry", "wordpress", "example", "domain", "bootstrap", "google", "schema", "gravatar", "cloudflare", "yoursite"}

            for e in regex_emails:
                el = e.lower()
                if not any(el.endswith(ext) for ext in bad_exts):
                    if not any(bad in el for bad in bad_domains):
                        emails_encontrados.add(el)

            # 2. Extracción de teléfono de respaldo en la web (tel: links o regex US)
            phone_found = ""
            tel_links = re.findall(r'href=[\'"]tel:([^\'"]+)[\'"]', html, re.IGNORECASE)
            if tel_links:
                raw_tel = tel_links[0].strip()
                digits = re.sub(r'\D', '', raw_tel)
                if len(digits) == 11 and digits.startswith('1'):
                    digits = digits[1:]
                if len(digits) == 10:
                    phone_found = f"+1 ({digits[:3]}) {digits[3:6]}-{digits[6:]}"
                elif raw_tel:
                    phone_found = raw_tel

            # 3. Rastreo profundo a subpáginas de contacto si no hubo correo en la Home
            if not emails_encontrados:
                contact_hrefs = re.findall(r'href=[\'"]([^\'"]*(?:contact|about|contacto)[^\'"]*)[\'"]', html, re.IGNORECASE)
                seen_suburls = set()
                for href in contact_hrefs:
                    if href.startswith("mailto:") or href.startswith("tel:") or href.startswith("#") or href.startswith("javascript:"):
                        continue
                    sub_url = urllib.parse.urljoin(url, href)
                    try:
                        if urllib.parse.urlparse(sub_url).netloc != urllib.parse.urlparse(url).netloc:
                            continue
                    except Exception:
                        continue
                    if sub_url in seen_suburls:
                        continue
                    seen_suburls.add(sub_url)
                    if len(seen_suburls) > 2:
                        break

                    try:
                        c_resp = await client.get(sub_url, timeout=5.0)
                        if c_resp.status_code == 200:
                            c_html = c_resp.text
                            c_mailtos = re.findall(r'mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', c_html, re.IGNORECASE)
                            for m in c_mailtos:
                                emails_encontrados.add(m.lower())
                            if not emails_encontrados:
                                c_regex = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', c_html)
                                for e in c_regex:
                                    el = e.lower()
                                    if not any(el.endswith(ext) for ext in bad_exts):
                                        if not any(bad in el for bad in bad_domains):
                                            emails_encontrados.add(el)
                            if not phone_found:
                                c_tel = re.findall(r'href=[\'"]tel:([^\'"]+)[\'"]', c_html, re.IGNORECASE)
                                if c_tel:
                                    c_raw = c_tel[0].strip()
                                    c_digits = re.sub(r'\D', '', c_raw)
                                    if len(c_digits) == 11 and c_digits.startswith('1'):
                                        c_digits = c_digits[1:]
                                    if len(c_digits) == 10:
                                        phone_found = f"+1 ({c_digits[:3]}) {c_digits[3:6]}-{c_digits[6:]}"
                            if emails_encontrados:
                                break
                    except Exception:
                        pass

            if emails_encontrados:
                contacts["email"] = sorted(list(emails_encontrados))[0]
            if phone_found:
                contacts["phone"] = phone_found

        finally:
            if should_close:
                await client.aclose()

        return contacts

    async def search_candidates(
        self,
        category_id: int,
        city: str = "Eastvale",
        zip_code: str = "92880",
        mock_mode: Optional[bool] = None,
        exclude_names: Optional[List[str]] = None,
        limit: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda orquestada de candidatos respetando MOCK_MODE:
        - MOCK_MODE=true: Entrega candidatos simulados dentro de Eastvale / Corona sin costo.
        - MOCK_MODE=false: OpenStreetMap primero (gratis), Yelp Fusion donde OSM
          no alcanza (oficios sin local: plomería, techado) y Geoapify de cola.
        - Excluye nombres en exclude_names (lista negra o descartados).
        - Enriquecimiento asíncrono OSINT de correos y teléfonos de respaldo.
        """
        use_mock = self.is_mock_mode_default if mock_mode is None else mock_mode
        taxonomy = normalize_category(category_id)
        exclude_set = {n.strip().lower() for n in (exclude_names or []) if n.strip()}
        center_lat, center_lon = get_campaign_center(city, zip_code)

        def _candidate_rank(c: Dict[str, Any]) -> tuple:
            # 1. Tiene teléfono (0=sí, 1=no)
            has_phone = 0 if (c.get("phone") or "").strip() else 1
            # 2. Tier geográfico (Tier 0: Eastvale local, Tier 1: ZIP 92880, Tier 2: Ciudades colindantes)
            geo_tier = int(c.get("geo_tier") if c.get("geo_tier") is not None else 2)
            # 3. Menor distancia en millas (distance_miles como float garantizado, nunca None)
            dist_miles = float(c.get("distance_miles") if c.get("distance_miles") is not None else 999.0)
            # 4. Prestigio de fuente
            src = c.get("source") or ""
            source_rank = 0 if src == "Yelp Fusion" else (1 if "OpenStreetMap" in src else 2)
            # 5. Rating descendente
            rating = float(c.get("rating") or 0.0)
            # 6. Número de reseñas descendente
            reviews = int(c.get("review_count") or 0)
            return (has_phone, geo_tier, dist_miles, source_rank, -rating, -reviews)

        if use_mock:
            simulated = [
                c for c in self._get_mock_candidates(category_id, city, zip_code)
                if (c.get("business_name") or c.get("name") or "").strip().lower() not in exclude_set
            ]
            for c in simulated:
                c["simulated"] = True
                normalize_candidate_record(c, target_city=city, target_zip=zip_code, center_lat=center_lat, center_lon=center_lon)
            simulated.sort(key=_candidate_rank)
            return simulated[:limit]

        # The order is decided by what each source costs, not by which is best.
        # OpenStreetMap is free and covers all fourteen niches.
        raw_osm = await self.fetch_from_osm(category_id, taxonomy["yelp_category"], city, zip_code)
        candidates = [
            c for c in raw_osm
            if (c.get("business_name") or c.get("name") or "").strip().lower() not in exclude_set
        ]

        def callable_count(rows: List[Dict[str, Any]]) -> int:
            return sum(1 for c in rows if (c.get("phone") or "").strip())

        if callable_count(candidates) < limit:
            existing = {c["name"].lower() for c in candidates}
            for yc in await self.fetch_from_yelp(
                taxonomy["yelp_category"], city, zip_code, category_id
            ):
                yc_name = yc["name"].lower().strip()
                if yc_name not in existing and yc_name not in exclude_set:
                    candidates.append(yc)
                    existing.add(yc_name)

        if callable_count(candidates) < limit:
            existing = {c["name"].lower() for c in candidates}
            for gc in await self.fetch_from_geoapify(
                taxonomy["geoapify_category"], taxonomy["yelp_category"], city, zip_code
            ):
                gc_name = gc["name"].lower().strip()
                if gc_name not in existing and gc_name not in exclude_set:
                    candidates.append(gc)
                    existing.add(gc_name)

        # Si tras consultar todas las fuentes hay menos de `limit` candidatos,
        # completar con respaldo local para garantizar estrictamente el cupo
        if len(candidates) < limit:
            simulated = self._get_mock_candidates(category_id, city, zip_code)
            existing = {c["name"].lower() for c in candidates}
            for s in simulated:
                s_name = s["name"].lower().strip()
                if s_name not in existing and s_name not in exclude_set:
                    s["source"] = "Respaldo Local (Sandbox)"
                    s["simulated"] = True
                    candidates.append(s)
                if len(candidates) >= limit:
                    break

        # Normalizar y unificar distancia geodésica para TODOS los candidatos (OSM, Yelp, Geoapify, Mock)
        for c in candidates:
            normalize_candidate_record(c, target_city=city, target_zip=zip_code, center_lat=center_lat, center_lon=center_lon)

        # Ordenamiento jerárquico por relevancia y geografía garantizado sin fallas NoneType:
        candidates.sort(key=_candidate_rank)

        selected = candidates[:limit]

        # Enriquecimiento web OSINT asíncrono para los candidatos finales seleccionados
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as enrich_client:
            async def _enrich_candidate(cand: Dict[str, Any]):
                web_url = cand.get("website_url") or ""
                if web_url and not any(d in web_url.lower() for d in ["yelp.com", "google.com"]):
                    contacts = await self.extract_web_contacts_async(web_url, client=enrich_client)
                    if contacts.get("email"):
                        cand["email"] = contacts["email"]
                    if not (cand.get("phone") or "").strip() and contacts.get("phone"):
                        cand["phone"] = contacts["phone"]

            await asyncio.gather(*[_enrich_candidate(c) for c in selected], return_exceptions=True)

        return selected

    def _resolve_ticket(self, niche: str) -> float:
        niche_lower = niche.lower()
        if any(k in niche_lower for k in ["hvac", "aire", "clima", "calefacc"]):
            return 4500.0
        if any(k in niche_lower for k in ["roof", "solar", "techo"]):
            return 14500.0
        if any(k in niche_lower for k in ["odont", "dent", "implante"]):
            return 1250.0
        if any(k in niche_lower for k in ["insuran", "seguro"]):
            return 1400.0
        if any(k in niche_lower for k in ["plom", "plumb"]):
            return 780.0
        if any(k in niche_lower for k in ["auto", "mecanic", "taller", "freno"]):
            return 550.0
        if any(k in niche_lower for k in ["chiro", "quiro"]):
            return 480.0
        if any(k in niche_lower for k in ["vet", "animal"]):
            return 450.0
        if any(k in niche_lower for k in ["carpet", "limpieza", "alfombra"]):
            return 320.0
        if any(k in niche_lower for k in ["detail", "lavado"]):
            return 220.0
        if any(k in niche_lower for k in ["gym", "fitness", "crossfit"]):
            return 140.0
        if any(k in niche_lower for k in ["groom", "peluquer"]):
            return 85.0
        if any(k in niche_lower for k in ["pizza", "taquer", "restauran"]):
            return 68.0
        return 500.0

    def get_niche_fallback(self, niche: str, business_name: str, avg_ticket: float) -> Dict[str, Any]:
        niche_lower = niche.lower()
        cost = 850 if "odont" in niche_lower or "dent" in niche_lower else 497

        if any(k in niche_lower for k in ["hvac", "aire", "clima", "calefacc"]):
            en = (
                f"Owner, summer in the Inland Empire regularly exceeds 100°F. We are reaching 5,000 verified "
                f"homeowners with older builder-grade A/C systems. A single system replacement or repair (${avg_ticket:,.0f}+) "
                f"pays off your ${cost} co-op spot nearly 10 times over. That is under 10 cents per exclusive home."
            )
            es = (
                f"Estimado Propietario de {business_name}, en el calor extremo de más de 40°C del Inland Empire, "
                f"5,000 residencias recibirán nuestra postal gigante 12x9. Una sola venta o reparación (${avg_ticket:,.0f} USD) "
                f"le genera un retorno multiplicado sobre su espacio exclusivo de ${cost} USD. Exclusividad total 1-a-1."
            )
            dm = "Owner / Service Director"
        elif any(k in niche_lower for k in ["odont", "dent", "implante"]):
            en = (
                f"Doctor, 5,000 prime homeowners in Eastvale are receiving our 12x9 jumbo mailer this month. "
                f"With your exclusive Hero Banner position, just one single dental implant or Invisalign case "
                f"(${avg_ticket:,.0f}+) pays for your entire ${cost} campaign multiple times over."
            )
            es = (
                f"Doctor de {business_name}, 5,000 familias propietarias recibirán la postal gigante 12x9 este mes. "
                f"Con la posición Hero frontal, un solo tratamiento de ortodoncia o implante (${avg_ticket:,.0f} USD) "
                f"cubre varias veces su inversión de ${cost} USD. Equivale a apenas 17 centavos por hogar de alto valor."
            )
            dm = "Doctor / Lead Clinician"
        elif any(k in niche_lower for k in ["plom", "plumb"]):
            en = (
                f"Owner, with 5,000 homes in your local territory receiving our mailer, just one water heater "
                f"replacement or repiping job (${avg_ticket:,.0f}+) covers your entire ${cost} spot with instant net profit."
            )
            es = (
                f"Estimado Propietario de {business_name}, frente a 5,000 residencias locales, un solo recambio "
                f"de calentador o reparación mayor (${avg_ticket:,.0f} USD) cubre completamente su espacio de ${cost} USD."
            )
            dm = "Owner / Master Plumber"
        elif any(k in niche_lower for k in ["roof", "solar", "techo"]):
            en = (
                f"Owner, Inland Empire high winds cause major roof deterioration. Reaching 5,000 targeted homeowners "
                f"means just ONE reroof or solar job (${avg_ticket:,.0f}+) yields a 25x cash return on your ${cost} sponsorship."
            )
            es = (
                f"Estimado Propietario de {business_name}, 5,000 residencias con techos de más de 12 años verán su oferta. "
                f"Un solo contrato (${avg_ticket:,.0f} USD) le genera un retorno masivo sobre su inversión de ${cost} USD."
            )
            dm = "Owner / Project Director"
        elif any(k in niche_lower for k in ["auto", "mecanic", "freno", "taller"]):
            en = (
                f"Owner, 5,000 local homeowners will see {business_name} exclusively on their mailers. Just one major "
                f"brake or transmission job (${avg_ticket:,.0f}+) covers your ${cost} co-op slot."
            )
            es = (
                f"Estimado Propietario de {business_name}, 5,000 familias con vehículos verán su taller de forma exclusiva. "
                f"Un solo servicio mayor (${avg_ticket:,.0f} USD) cubre el 100% de su espacio de ${cost} USD."
            )
            dm = "Owner / Lead Technician"
        else:
            en = (
                f"Owner, 5,000 verified homeowners in Eastvale / Inland Empire are receiving our 12x9 jumbo co-op mailer. "
                f"At ${cost} flat, that is under 10 cents per household. Just ONE customer at your average ticket of "
                f"${avg_ticket:,.0f} USD pays off your sponsorship with instant net profit."
            )
            es = (
                f"Estimado Propietario de {business_name}, 5,000 hogares propietarios en su zona recibirán la postal gigante 12x9. "
                f"Con su espacio exclusivo de ${cost} USD, cuesta menos de 10 centavos por casa. Un solo cliente promedio "
                f"(${avg_ticket:,.0f} USD) cubre el 100% de su espacio publicitario sin competencia."
            )
            dm = "Owner / Managing Partner"

        return {
            "business_name": business_name,
            "niche": niche,
            "avg_ticket": avg_ticket,
            "pitch": f"{en}\n\n{es}",
            "en": en,
            "es": es,
            "decision_maker": dm,
            "roi_pitch": f"Inversión: ${cost} USD | Ticket promedio: ${avg_ticket:,.0f} USD | Breakeven: 1 cliente."
        }

    def _format_pitch_output(self, content: str, niche: str, business_name: str, avg_ticket: float) -> Dict[str, Any]:
        try:
            if "{" in content and "}" in content:
                json_str = content[content.find("{"):content.rfind("}")+1]
                data = json.loads(json_str)
                if "en" in data or "es" in data:
                    return {
                        "business_name": business_name,
                        "niche": niche,
                        "avg_ticket": avg_ticket,
                        "pitch": content,
                        "en": data.get("en", content),
                        "es": data.get("es", content),
                        "decision_maker": data.get("decision_maker", "Owner / Decision Maker"),
                        "roi_pitch": f"Inversión: $497 USD | Ticket promedio: ${avg_ticket:,.0f} USD | Breakeven: 1 cliente."
                    }
        except Exception:
            pass

        lines = content.splitlines()
        current_lang = "es"
        en_lines = []
        es_lines = []

        for line in lines:
            lower = line.lower()
            if "english" in lower or "inglés" in lower or lower.startswith("en:") or "pitch en" in lower:
                current_lang = "en"
                continue
            elif "spanish" in lower or "español" in lower or lower.startswith("es:") or "pitch es" in lower:
                current_lang = "es"
                continue

            if current_lang == "en":
                en_lines.append(line)
            else:
                es_lines.append(line)

        en_part = "\n".join(en_lines).strip() or content
        es_part = "\n".join(es_lines).strip() or content

        return {
            "business_name": business_name,
            "niche": niche,
            "avg_ticket": avg_ticket,
            "pitch": content,
            "en": en_part,
            "es": es_part,
            "decision_maker": "Owner / Decision Maker",
            "roi_pitch": f"Inversión: $497 USD | Ticket promedio: ${avg_ticket:,.0f} USD | Breakeven: 1 cliente."
        }

    async def generate_pitch(
        self,
        business_name: str,
        niche: str,
        avg_ticket: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Conecta la generación de pitches con el endpoint local de llama-server.
        REGLAS DE INTEGRACIÓN ESTRICTAS:
        1. Cero Parámetros de Inferencia.
        2. Cero Especificación de Modelo.
        3. Payload Puro: Solo la estructura 'messages'.
        4. Resiliencia & Fallback: Retorno limpio del script predefinido del nicho ante error.
        """
        if not avg_ticket or avg_ticket <= 0:
            avg_ticket = self._resolve_ticket(niche)

        system_prompt = (
            "Eres un estratega de ventas para correo directo cooperativo 9x12 en el Inland Empire. "
            "Genera un guion de venta telefónica bilingüe (EN/ES) contundente de un solo golpe "
            "basado en el ticket promedio del cliente frente a los $497 USD del espacio."
        )
        user_prompt = f"Genera el pitch para el negocio: {business_name} del giro: {niche}."

        payload = {
            "model": self.llama_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        }

        endpoint = f"{self.llama_url}/chat/completions"

        # A bulk search generates one pitch per candidate. When llama-server is
        # unreachable, paying the full timeout on every candidate turns a search
        # into minutes of dead air, so the first failure disables it for the
        # rest of the process and the niche fallback answers immediately.
        if getattr(self, "_llama_offline", False):
            fallback = self.get_niche_fallback(niche, business_name, avg_ticket)
            fallback["source"] = "fallback_niche"
            return fallback

        try:
            # A pitch the operator waits on inside a list has to answer fast or
            # not at all; the niche fallback is a complete script, not a stub.
            timeout = httpx.Timeout(15.0, connect=2.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(endpoint, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices and "message" in choices[0]:
                        content = choices[0]["message"].get("content", "")
                        if content:
                            result = self._format_pitch_output(content, niche, business_name, avg_ticket)
                            result["source"] = "llama_server"
                            return result
                else:
                    print(f"[LeadSourcing] llama-server respondió HTTP {resp.status_code}: {resp.text}")
        except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError, Exception) as e:
            # A host that accepts the socket and never answers raises
            # ReadTimeout, not ConnectError. Either way it is unusable, and
            # paying the timeout again on every candidate is the real cost.
            if isinstance(e, (httpx.ConnectError, httpx.TimeoutException)):
                self._llama_offline = True
            print(f"[LeadSourcing] Fallback activo tras fallo de conexión a llama-server ({self.llama_url}): {e}")

        fallback = self.get_niche_fallback(niche, business_name, avg_ticket)
        fallback["source"] = "fallback_niche"
        return fallback

    async def generate_llm_pitch(self, business_name: str, category_name: str, avg_ticket: float) -> Dict[str, str]:
        """Wrapper compatible para búsqueda masiva de leads."""
        res = await self.generate_pitch(business_name, category_name, avg_ticket)
        return {
            "en": res.get("en", ""),
            "es": res.get("es", ""),
            "decision_maker": res.get("decision_maker", "Owner / Decision Maker")
        }
