-- 0003_prospect_cache.sql
-- Cache persistente en D1 para prospección de negocios locales (Yelp Fusion / Geoapify)
-- Evita llamadas repetidas a APIs externas (cuota 300/día) y acelera la carga a <10ms.

CREATE TABLE IF NOT EXISTS prospect_cache (
    id TEXT PRIMARY KEY,
    category_id INTEGER NOT NULL,
    category_name TEXT NOT NULL,
    city TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    business_name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    website_url TEXT,
    rating REAL DEFAULT 4.8,
    review_count INTEGER DEFAULT 25,
    source TEXT DEFAULT 'Yelp Fusion',
    decision_maker TEXT DEFAULT 'Owner / Decision Maker',
    decision_maker_title TEXT DEFAULT 'Owner / Decision Maker',
    avg_ticket_estimated REAL DEFAULT 500.0,
    distance_miles REAL,
    geo_tier INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospect_cache_cat_zip ON prospect_cache(category_id, zip_code);
CREATE INDEX IF NOT EXISTS idx_prospect_cache_created ON prospect_cache(created_at);
