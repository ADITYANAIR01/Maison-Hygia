import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# DATABASE_URL is required — no fallback to SQLite.
# Set it to a PostgreSQL connection string, e.g.:
#   postgresql://postgres:password@localhost:5432/maison_hygia
#   postgresql://postgres:pw@db.supabase.co:5432/postgres (Supabase)
#   postgresql://user:pw@aws-rds-endpoint:5432/maison_hygia (AWS RDS)
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError(
        "DATABASE_URL environment variable is required. "
        "Set it to a PostgreSQL connection string, e.g. "
        "postgresql://postgres:password@localhost:5432/maison_hygia"
    )

BASE_DIR = Path(__file__).resolve().parent

# Frontend base URL used for Stripe checkout redirects
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8000")

# CORS
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:8000,http://localhost:8001"
).split(",")


class Base(DeclarativeBase):
    pass


connect_args = {}  # No SQLite-specific args; PostgreSQL handles connections natively
engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def ensure_schema() -> None:
    """Create all tables defined in models (idempotent).

    For production, use Alembic migrations. This function is kept for dev convenience.
    """
    Base.metadata.create_all(bind=engine)
