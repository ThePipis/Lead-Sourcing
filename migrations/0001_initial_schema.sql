-- Schema inicial para Cloudflare D1 (Lead-Sourcing Database)

-- 1. Campañas
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    target_city TEXT NOT NULL DEFAULT 'Eastvale',
    target_zip TEXT NOT NULL DEFAULT '92880',
    radius_miles REAL DEFAULT 5.0,
    target_households INTEGER DEFAULT 5000,
    unit_cost_usd REAL DEFAULT 0.60,
    target_gross_revenue REAL DEFAULT 7264.0,
    operating_cost_est REAL DEFAULT 3000.0,
    net_margin_est REAL DEFAULT 4264.0,
    status TEXT DEFAULT 'PROSPECTING', -- PROSPECTING, LOCKED_READY, CURATED, IN_PRODUCTION, MAILED
    mode TEXT DEFAULT 'DEMO',          -- DEMO, LIVE
    production_at TEXT,
    mailed_at TEXT,
    archived_at TEXT,
    model_ack TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_mode ON campaigns(mode);
CREATE INDEX IF NOT EXISTS idx_campaigns_code ON campaigns(code);

-- 2. Espacios publicitarios (Slots)
CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    slot_number INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    category_name TEXT NOT NULL,
    side TEXT NOT NULL,                -- FRONT, BACK
    slot_type TEXT NOT NULL,           -- HERO, STANDARD_FRONT, STANDARD_BACK, MEDIUM_BACK
    width_inches REAL NOT NULL,
    height_inches REAL NOT NULL,
    price_usd REAL NOT NULL,
    avg_ticket_usd REAL,
    business_name TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    business_address TEXT,
    status TEXT DEFAULT 'VACANT',      -- VACANT, PROSPECTING, RESERVED, PAID
    logo_url TEXT,
    offer_headline TEXT,
    qr_code_url TEXT,
    short_url TEXT,
    payment_ref TEXT,
    paid_at TEXT,
    reserved_at TEXT,
    reservation_expires_at TEXT,
    amount_collected_usd REAL,
    scan_count INTEGER DEFAULT 0,
    qr_token TEXT,
    notes TEXT,
    format TEXT DEFAULT 'SMALL',
    row_span INTEGER DEFAULT 1,
    col_span INTEGER DEFAULT 1,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_slots_campaign ON slots(campaign_id);
CREATE INDEX IF NOT EXISTS idx_slots_qr_token ON slots(qr_token);

-- 3. Prospectos de negocios (Leads)
CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    category_name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    zip TEXT,
    phone TEXT,
    email TEXT,
    website_url TEXT,
    rating REAL DEFAULT 4.5,
    review_count INTEGER DEFAULT 25,
    source TEXT DEFAULT 'Yelp Fusion',
    decision_maker TEXT,
    decision_maker_title TEXT,
    avg_ticket_estimated REAL DEFAULT 500.0,
    distance_miles REAL,
    status TEXT DEFAULT 'NEW',         -- NEW, CONTACTED, REJECTED, WON
    website_ok INTEGER DEFAULT 1,
    website_source TEXT,
    has_street_address INTEGER DEFAULT 1,
    latitude REAL,
    longitude REAL,
    geo_tier INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);

-- 4. Eventos de analítica y telemetría de códigos QR
CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    slot_number INTEGER NOT NULL,
    business_name TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')),
    device_type TEXT DEFAULT 'Mobile',
    city TEXT DEFAULT 'Eastvale',
    user_agent TEXT,
    ip_hash TEXT,
    client_ip TEXT,
    region TEXT,
    country TEXT,
    isp TEXT,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analytics_campaign ON analytics_events(campaign_id);

-- 5. Configuración de costos y márgenes por modo
CREATE TABLE IF NOT EXISTS cost_settings (
    mode TEXT PRIMARY KEY,             -- DEMO, LIVE
    postage_per_piece REAL DEFAULT 0.260,
    list_per_piece REAL DEFAULT 0.0,
    print_per_piece REAL DEFAULT 0.0,
    variable_data_per_piece REAL DEFAULT 0.0,
    presort_per_piece REAL DEFAULT 0.0,
    finishing_per_piece REAL DEFAULT 0.0,
    setup_fee REAL DEFAULT 0.0,
    delivery_fee REAL DEFAULT 0.0,
    target_margin REAL DEFAULT 0.58,
    source_note TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 6. Historial de desestimaciones y enfriamiento de comercios
CREATE TABLE IF NOT EXISTS lead_regenerations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT,
    business_key TEXT NOT NULL,
    business_name TEXT NOT NULL,
    category_id INTEGER,
    slot_number INTEGER,
    business_address TEXT,
    reason_code TEXT NOT NULL DEFAULT 'OTRO',
    reason_note TEXT,
    cooldown_until TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_regen_key ON lead_regenerations(business_key);
CREATE INDEX IF NOT EXISTS idx_lead_regen_cooldown ON lead_regenerations(cooldown_until);

-- 7. Historial de llamadas y recordatorios (CRM)
CREATE TABLE IF NOT EXISTS lead_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT,
    business_key TEXT NOT NULL,
    business_name TEXT NOT NULL,
    category_id INTEGER,
    slot_number INTEGER,
    outcome_code TEXT NOT NULL DEFAULT 'OTRO',
    note TEXT,
    follow_up_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_key ON lead_contacts(business_key);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_follow ON lead_contacts(follow_up_at);

-- 8. Interruptores de fuentes de datos por modo
CREATE TABLE IF NOT EXISTS data_sources (
    mode TEXT NOT NULL,                -- DEMO, LIVE
    source_id TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (mode, source_id)
);

-- 9. Rutas postales asignadas por campaña
CREATE TABLE IF NOT EXISTS campaign_routes (
    campaign_id TEXT NOT NULL,
    route_id TEXT NOT NULL,            -- e.g. 92880R052
    zip_code TEXT NOT NULL,
    crid TEXT NOT NULL,
    route_type TEXT DEFAULT 'R',
    city_state TEXT DEFAULT '',
    residential INTEGER DEFAULT 0,
    business INTEGER DEFAULT 0,
    median_income REAL DEFAULT 0.0,
    avg_household_size REAL DEFAULT 0.0,
    score REAL DEFAULT 0.0,
    facility TEXT DEFAULT '',
    census_enriched INTEGER DEFAULT 0,
    scored_on TEXT DEFAULT '',
    income_source TEXT DEFAULT '',
    size_source TEXT DEFAULT '',
    selected INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (campaign_id, route_id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
