import os
from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import (
    campaigns,
    prospecting,
    curation,
    export,
    tracking,
    costs,
    assistant,
    datasources,
    eddm,
    campaign_routes,
    slot_fill,
)

# Create database tables
Base.metadata.create_all(bind=engine)


def _add_missing_columns() -> None:
    """
    create_all never alters an existing table, so a database created before a
    column existed silently keeps the old shape. Add what is missing in place;
    the production database already holds campaigns and 15,000 households.
    """
    from sqlalchemy import inspect, text

    additions = {
        "campaigns": {
            "production_at": "DATETIME",
            "mailed_at": "DATETIME",
            "mode": "VARCHAR(8) DEFAULT 'DEMO'",
            "unit_cost_usd": "FLOAT DEFAULT 0.6",
            "archived_at": "DATETIME",
        },
        "slots": {
            "paid_at": "DATETIME",
            "amount_collected_usd": "FLOAT",
            "business_address": "VARCHAR(255)",
            "notes": "TEXT",
            "format": "VARCHAR(16) DEFAULT 'SMALL'",
            "row_span": "INTEGER DEFAULT 1",
            "col_span": "INTEGER DEFAULT 1",
        },
    }

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in additions.items():
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table)}
            for name, sql_type in columns.items():
                if name not in present:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))


_add_missing_columns()

# The assistant answers from the shipped documentation, so it is indexed at
# startup and re-indexed whenever one of those files changes on disk.
assistant.seed_documents()

app = FastAPI(
    title="Co-Op Direct Mail Platform & Algorithmic Audience Curation Engine",
    description="Backend API for Shared Direct Mail Automation in the Inland Empire, California.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount modular routers under both /api and /api/v1
app.include_router(campaigns.router, prefix="/api")
app.include_router(campaigns.router, prefix="/api/v1")
app.include_router(prospecting.router, prefix="/api")
app.include_router(prospecting.router, prefix="/api/v1")
app.include_router(curation.router, prefix="/api")
app.include_router(curation.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api")
app.include_router(export.router, prefix="/api/v1")
app.include_router(assistant.router, prefix="/api")
app.include_router(datasources.router, prefix="/api")
app.include_router(eddm.router, prefix="/api")
app.include_router(campaign_routes.router, prefix="/api")
app.include_router(slot_fill.router, prefix="/api")
app.include_router(costs.router, prefix="/api")
app.include_router(costs.router, prefix="/api/v1")

# Mount QR tracking and telemetry router under /r
app.include_router(tracking.router, prefix="/r")

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "Co-Op Direct Mail Engine",
        "market": "Inland Empire, CA",
        "target_specs": "12x9 Jumbo Postcard | 14 Exclusive Slots | 5,000 Homes"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
