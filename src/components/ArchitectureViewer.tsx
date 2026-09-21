import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Code2,
  Database,
  FileCode,
  FolderTree,
  Copy,
  Check,
  Terminal,
  Layers,
  Server,
} from 'lucide-react';

const DIRECTORY_TREE_TXT = `
co-op-direct-mail-platform/
├── backend/ # Backend FastAPI (Python 3.11+)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                         # FastAPI App & Router Mounts
│   │   ├── database.py                     # SQLite / PostgreSQL PostGIS engine & sessions
│   │   ├── models.py                       # SQLAlchemy ORM: Campaign, Slot, Lead, Household, AnalyticsEvent
│   │   ├── schemas.py                      # Pydantic v2 Validation Schemas
│   │   ├── routers/
│   │   │   ├── campaigns.py                # Slot management, cash rule gatekeeper
│   │   │   ├── prospecting.py              # Yelp + Geoapify parallel query & local LLM
│   │   │   ├── curation.py                 # Vectorized Propensity Engine endpoints
│   │   │   └── export.py                   # QR redirects (/r/:camp/:slug) & CSV manifest download
│   │   └── services/
│   │       ├── lead_sourcing_service.py    # Yelp Fusion API + Geoapify + Llama.cpp LLM client
│   │       ├── propensity_engine.py        # Vectorized demographic dot product with NumPy & Pandas
│   │       └── postal_export_service.py    # CASS normalization, Carrier Route (CRRT) sorting
│   ├── requirements.txt                    # FastAPI, Uvicorn, Pydantic, SQLAlchemy, NumPy, Pandas, DuckDB
│   └── README.md
├── src/                                    # Frontend React / TypeScript + Tailwind CSS
│   ├── components/
│   │   ├── PostalCanvas.tsx                # Interactive 12"x9" Postcard Layout (Front & Back)
│   │   ├── ProspectingView.tsx             # Hit List / Lightweight CRM with one-shot pitch hooks
│   │   ├── CurationStudio.tsx              # Demographic Weight Matrix & 5,000 Cut Histogram
│   │   ├── PostalExportView.tsx            # Dynamic QR generator & Action Mail manifest export
│   │   ├── FinancialMetrics.tsx            # Campaign budget tracker & cash rule unlock bar
│   │   └── ArchitectureViewer.tsx          # Systems architecture code inspector
│   ├── data/
│   │   └── categories.ts                   # 14 closed niches, dimensions, pricing, and weights
│   ├── services/
│   │   ├── leadSourcingService.ts          # Client/API lead sourcing logic
│   │   ├── propensityEngine.ts             # In-browser & client propensity scoring engine
│   │   └── postalExportService.ts          # QR code rendering & Action Mail CSV builder
│   ├── types.ts                            # TypeScript domain interfaces
│   ├── App.tsx                             # Master Controller
│   └── main.tsx
├── public/
├── package.json
└── vite.config.ts
`;

const CODE_SNIPPETS: Record<string, { language: string; filename: string; code: string }> = {
  models: {
    language: 'python',
    filename: 'backend/app/models.py',
    code: `import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from .database import Base

class Campaign(Base):
 __tablename__ = "campaigns"
 id = Column(String(64), primary_key=True, index=True)
 code = Column(String(32), unique=True, index=True)
 name = Column(String(255), nullable=False)
 target_city = Column(String(128), default="Eastvale")
 target_zip = Column(String(10), default="92880")
 radius_miles = Column(Float, default=5.0)
 target_households = Column(Integer, default=5000)
 target_gross_revenue = Column(Float, default=7264.0)
 operating_cost_est = Column(Float, default=3000.0)
 net_margin_est = Column(Float, default=4264.0)
 status = Column(String(32), default="PROSPECTING")
    
 slots = relationship("Slot", back_populates="campaign", cascade="all, delete-orphan")
 leads = relationship("Lead", back_populates="campaign")

class Slot(Base):
    __tablename__ = "slots"
 id = Column(Integer, primary_key=True, autoincrement=True)
 campaign_id = Column(String(64), ForeignKey("campaigns.id"), nullable=False, index=True)
 slot_number = Column(Integer, nullable=False) # 1 to 14
 category_id = Column(Integer, nullable=False)
 category_name = Column(String(128), nullable=False)
 side = Column(String(8), nullable=False) # FRONT, BACK
 slot_type = Column(String(32), nullable=False) # HERO, STANDARD_FRONT, STANDARD_BACK, MEDIUM_BACK
 width_inches = Column(Float, nullable=False)
 height_inches = Column(Float, nullable=False)
 price_usd = Column(Float, nullable=False)
 business_name = Column(String(255), nullable=True)
 status = Column(String(32), default="VACANT") # VACANT, PROSPECTING, RESERVED, PAID
 scan_count = Column(Integer, default=0)

class Household(Base):
    __tablename__ = "households"
 id = Column(String(64), primary_key=True, index=True)
 campaign_id = Column(String(64), ForeignKey("campaigns.id"), nullable=False, index=True)
 resident_name = Column(String(128), nullable=False)
 street_address = Column(String(255), nullable=False)
 city = Column(String(128), nullable=False)
 carrier_route = Column(String(8), nullable=False) # e.g., C001, C012
 walk_sequence = Column(Integer, nullable=False)
 composite_score = Column(Float, default=0.0)
 selected_for_drop = Column(Boolean, default=False)`,
  },
  propensity: {
    language: 'python',
    filename: 'backend/app/services/propensity_engine.py',
    code: `import numpy as np
import pandas as pd
from typing import Tuple, Dict, Any

class PropensityEngine:
 """
 Vectorized Demographic Propensity Engine.
 Executes:
 Match(i, j) = sum(W_{j, k} * Household_{i, k})
 H_i = sum_{j=1}^{14} Match(i, j)
 Cuts the top 5,000 households with maximum collective affinity.
    """
 def __init__(self, weights_matrix: np.ndarray):
 self.W = weights_matrix # shape: (14, 7)

 def run_curation(self, df: pd.DataFrame, target_cutoff: int = 5000) -> Tuple[pd.DataFrame, Dict[str, Any]]:
 feature_cols = [
            "income_score", "home_ownership_score", "home_age_score",
            "children_present_score", "vehicles_score", "pet_owner_score", "home_value_score"
        ]
 X = df[feature_cols].to_numpy() # shape: (N, 7)

        # Dot product across 14 merchants simultaneously
 match_matrix = np.dot(X, self.W.T) * 1.5
 composite_scores = np.sum(match_matrix, axis=1)
 df["composite_score"] = np.round(composite_scores, 2)

        # Sort descending and cut exactly 5,000
 df_sorted = df.sort_values(by="composite_score", ascending=False).reset_index(drop=True)
 top_5k = df_sorted.iloc[:target_cutoff].copy()
 top_5k["selected_for_drop"] = True
 return top_5k, {"total_selected": target_cutoff, "avg_score": float(top_5k["composite_score"].mean())}`,
  },
  lead_service: {
    language: 'python',
    filename: 'backend/app/services/lead_sourcing_service.py',
    code: `import httpx, os, json
from typing import List, Dict, Any

class LeadSourcingService:
 """
 Yelp Fusion + Geoapify Places + Local Llama.cpp LLM Client.
 Strictly forbids Google Places API.
    """
 def __init__(self):
 self.yelp_key = os.getenv("YELP_FUSION_API_KEY", "")
 self.geoapify_key = os.getenv("GEOAPIFY_API_KEY", "")
 self.llama_url = os.getenv("LLAMA_CPP_BASE_URL", "http://localhost:8080/v1")

 async def generate_llm_pitch(self, business_name: str, category_name: str, avg_ticket: float) -> Dict[str, str]:
 system_prompt = (
            "You are a master direct mail copywriter. Generate a high-converting bilingual B2B sales hook "
            "(English and Spanish) for a 12x9 co-op mailer reaching 5,000 homeowners for $497 flat."
        )
 payload = {
            "model": "meta-llama-3-8b-instruct",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Business: {business_name}, Category: {category_name}, Ticket: \${avg_ticket}"}
            ],
            "temperature": 0.3
        }
 async with httpx.AsyncClient(timeout=10.0) as client:
 resp = await client.post(f"{self.llama_url}/chat/completions", json=payload)
 return json.loads(resp.json()["choices"][0]["message"]["content"])`,
  },
  export_service: {
    language: 'python',
    filename: 'backend/app/services/postal_export_service.py',
    code: `import io, csv, qrcode
import pandas as pd

class PostalExportService:
 @staticmethod
 def build_manifest_csv(households_df: pd.DataFrame) -> str:
        # Sort by Carrier Route (CRRT) ASC and Walk Sequence ASC for USPS Saturation
 sorted_df = households_df.sort_values(by=["carrier_route", "walk_sequence"], ascending=[True, True])
        
 output = io.StringIO()
 writer = csv.writer(output, quoting=csv.QUOTE_ALL)
 writer.writerow([
            "RECORD_ID", "ADDRESSEE_LINE", "DELIVERY_ADDRESS", "CITY", "STATE",
            "ZIP5", "ZIP4", "FULL_ZIP", "CARRIER_ROUTE_CRRT", "WALK_SEQUENCE",
            "COMPOSITE_AFFINITY_SCORE", "ENDORSEMENT_LINE", "MAIL_CLASS"
        ])
        
 for _, r in sorted_df.iterrows():
 writer.writerow([
 r["household_id"],
 f"{str(r['resident_name']).upper()} OR CURRENT RESIDENT",
 str(r["street_address"]).upper(),
 str(r["city"]).upper(),
                "CA", str(r["zip5"]), str(r["zip4"]), f"{r['zip5']}-{r['zip4']}",
 r["carrier_route"], r["walk_sequence"], r.get("composite_score", 0.0),
 f"*****ECRWSS**{r['carrier_route']}",
                "USPS MARKETING MAIL - ENHANCED CARRIER ROUTE"
            ])
 return output.getvalue()`,
  },
};

export const ArchitectureViewer: React.FC = () => {
  const { t } = useTranslation(['common']);
  const [selectedSnippetKey, setSelectedSnippetKey] = useState<string>('models');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activeSnippet = CODE_SNIPPETS[selectedSnippetKey];

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Architecture Overview Card */}
      <div className="flex flex-col gap-4 border border-border bg-card p-5 text-card-foreground transition-colors md:flex-row md:items-center">
        <div className="flex-1">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {t('common:architecture.title')}
          </h2>
          <p className="mt-1.5 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
            {t('common:architecture.description')}
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono bg-secondary px-3 py-2 border border-border text-secondary-foreground ">
          <Server className="w-4 h-4 text-clear" />
          <span>{t('common:architecture.stackBadge')}</span>
        </div>
      </div>

      {/* Directory Tree Card */}
      <div className="bg-card border border-border p-5 space-y-3 text-card-foreground  transition-colors">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-foreground uppercase tracking-wider">
            <FolderTree className="w-4 h-4 text-primary" />
            <span>{t('common:architecture.treeTitle')}</span>
          </div>
          <button
            onClick={() => handleCopy('tree', DIRECTORY_TREE_TXT)}
            className="flex items-center space-x-1 text-xs text-secondary-foreground hover:bg-accent bg-secondary px-2.5 py-1 border border-border cursor-pointer transition-colors "
          >
            {copiedKey === 'tree' ? (
              <Check className="w-3 h-3 text-clear" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{t('common:architecture.copyTree')}</span>
          </button>
        </div>
        <pre className="bg-secondary/40 p-4 border border-border font-mono text-xs text-foreground overflow-x-auto leading-relaxed">
          {DIRECTORY_TREE_TXT.trim()}
        </pre>
      </div>

      {/* Code Snippets Viewer */}
      <div className="bg-card border border-border overflow-hidden  text-card-foreground transition-colors">
        <div className="flex flex-wrap items-center justify-between bg-secondary border-b border-border p-3 gap-2">
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
              {t('common:architecture.codeTitle')}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedSnippetKey('models')}
              className={`px-3 py-1 text-xs font-semibold font-mono cursor-pointer transition-colors ${
                selectedSnippetKey === 'models'
                  ? 'bg-primary text-primary-foreground '
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              models.py
            </button>
            <button
              onClick={() => setSelectedSnippetKey('propensity')}
              className={`px-3 py-1 text-xs font-semibold font-mono cursor-pointer transition-colors ${
                selectedSnippetKey === 'propensity'
                  ? 'bg-primary text-primary-foreground '
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              propensity_engine.py
            </button>
            <button
              onClick={() => setSelectedSnippetKey('lead_service')}
              className={`px-3 py-1 text-xs font-semibold font-mono cursor-pointer transition-colors ${
                selectedSnippetKey === 'lead_service'
                  ? 'bg-primary text-primary-foreground '
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              lead_sourcing_service.py
            </button>
            <button
              onClick={() => setSelectedSnippetKey('export_service')}
              className={`px-3 py-1 text-xs font-semibold font-mono cursor-pointer transition-colors ${
                selectedSnippetKey === 'export_service'
                  ? 'bg-primary text-primary-foreground '
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              postal_export_service.py
            </button>
          </div>
        </div>

        {/* Code body */}
        <div className="p-4 bg-secondary/20">
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pb-2 border-b border-border mb-3">
            <span className="text-primary font-bold">{activeSnippet.filename}</span>
            <button
              onClick={() => handleCopy(selectedSnippetKey, activeSnippet.code)}
              className="flex items-center space-x-1 bg-secondary hover:bg-accent text-secondary-foreground px-2.5 py-1 border border-border text-[0.69rem] cursor-pointer  transition-colors"
            >
              {copiedKey === selectedSnippetKey ? (
                <>
                  <Check className="w-3 h-3 text-clear" />
                  <span className="text-clear font-medium">{t('common:architecture.copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>{t('common:architecture.copyCode')}</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-2 font-mono text-xs text-foreground overflow-x-auto leading-relaxed max-h-[500px]">
            {activeSnippet.code}
          </pre>
        </div>
      </div>
    </div>
  );
};
