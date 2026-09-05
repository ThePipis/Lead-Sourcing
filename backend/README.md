# Co-Op Direct Mail Platform & Algorithmic Audience Curation Engine
### Enterprise Backend Architecture (FastAPI + SQLAlchemy + SpatiaLite / PostGIS + NumPy)

Designed for shared direct mail operations across the Inland Empire, California (Eastvale, Rancho Cucamonga, Corona, Ontario, Chino Hills, Riverside).

---

## 1. Directory Tree

```
backend/
├── app/
│   ├── database.py                 # SQLAlchemy DB engine & session
│   ├── main.py                     # FastAPI application & router orchestration
│   ├── models.py                   # ORM models (Campaign, Slot, Lead, Household, AnalyticsEvent)
│   ├── schemas.py                  # Pydantic v2 validation models
│   ├── routers/
│   │   ├── campaigns.py            # Slot management, operational cash rule enforcement
│   │   ├── prospecting.py          # Lead sourcing (Yelp, Geoapify, local LLM)
│   │   ├── curation.py             # Algorithmic propensity engine execution
│   │   └── export.py               # QR code generation & Action Mail CSV export
│   └── services/
│       ├── lead_sourcing_service.py # Yelp Fusion + Geoapify + Llama.cpp LLM client
│       ├── propensity_engine.py    # Vectorized matrix math (NumPy) & 15k synthetic data pool
│       └── postal_export_service.py# Carrier Route (CRRT) sorting, CASS/NCOA address formatting
└── requirements.txt
```

---

## 2. Business Rules Implemented
- **12" x 9" Jumbo Card:** 14 strict 1-to-1 non-competing local business slots.
  - Front: 1 Hero ($850) + 6 Standard ($497).
  - Back: 6 Standard ($497) + 1 Medium ($450) + USPS technical reserved area.
- **Gross Revenue:** $7,264 USD | Operating Cost: ~$3,000 USD | Net Margin: ~$4,264 USD.
- **Cash Rule:** Minimum 12 paid slots (or all 14) required before unlocking Algorithmic Curation.
- **Propensity Scoring:** $H_i = \sum_{j=1}^{14} \sum_k (W_{j,k} \cdot \text{Household}_{i,k})$, selecting top 5,000 joint-affinity households.
- **USPS Compliance:** Formatted with `OR CURRENT RESIDENT`, 5+4 ZIP, and sorted strictly by Carrier Route (CRRT) and Walk Sequence for maximum postal saturation discount.
