import os
from pathlib import Path

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
