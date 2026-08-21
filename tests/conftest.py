"""Shared fixtures for the Maison Hygia test suite.

Environment is configured *before* any backend import so that
``backend.database`` binds to a throwaway SQLite file, never the dev DB.
Set ``TEST_DATABASE_URL`` to run the suite against another database
(e.g. a real PostgreSQL instance).
"""

import os
import sys
import tempfile
from pathlib import Path

_TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if _TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = _TEST_DATABASE_URL
else:
    _TMP_DIR = Path(tempfile.mkdtemp(prefix="mh_tests_"))
    os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DIR / 'test.db'}"
os.environ["RAZORPAY_API_KEY"] = "rzp_test_test"
os.environ["RAZORPAY_API_SECRET"] = "razorpay_secret_test"
os.environ["FRONTEND_URL"] = "http://localhost:8000"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:8000,http://localhost:8001"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session", autouse=True)
def seeded_db(client):
    from cli import seed

    seed()


@pytest.fixture(scope="session")
def variant_ids(seeded_db):
    from sqlalchemy import select

    from backend.models import Variant

    db = SessionLocal()
    try:
        return list(
            db.execute(select(Variant.id).order_by(Variant.id).limit(3)).scalars()
        )
    finally:
        db.close()
