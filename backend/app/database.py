import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
RAW_DB_URL = os.getenv("DATABASE_URL", "")

if not RAW_DB_URL:
    DATABASE_URL = f"sqlite:///{BACKEND_DIR / 'coop_direct_mail.db'}"
elif RAW_DB_URL.startswith("sqlite:///./"):
    db_filename = RAW_DB_URL.replace("sqlite:///./", "")
    DATABASE_URL = f"sqlite:///{BACKEND_DIR / db_filename}"
else:
    DATABASE_URL = RAW_DB_URL

# SQLite with JSON support or PostgreSQL with PostGIS
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
