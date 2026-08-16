import os
from collections.abc import Generator
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Database - use SQLite for development; switch to PostgreSQL for production
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'database.db'}",
)

# API
API_V1_STR = "/api/v1"
PROJECT_NAME = "Maison Hygia API"

# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day


def get_db() -> Generator:
    """Dependency that yields a SQLAlchemy session."""
    from .database import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
