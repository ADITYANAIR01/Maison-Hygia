import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent

# Database - use SQLite for development; switch to PostgreSQL for production
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'database.db'}",
)

# Frontend base URL used for Stripe checkout redirects
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8000")

# CORS
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:8000,http://localhost:8001"
).split(",")


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(
    DATABASE_URL, pool_pre_ping=True, future=True, connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def ensure_schema() -> None:
    """Create tables and apply lightweight dev migrations idempotently."""
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(carts)")}
        for col, ddl in (
            (
                "payment_status",
                "ALTER TABLE carts ADD COLUMN payment_status VARCHAR DEFAULT 'unpaid'",
            ),
            (
                "status",
                "ALTER TABLE carts ADD COLUMN status VARCHAR DEFAULT 'open'",
            ),
        ):
            if col not in cols:
                conn.exec_driver_sql(ddl)
