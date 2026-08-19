from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

DATABASE_URL = settings.DATABASE_URL
FRONTEND_URL = settings.FRONTEND_URL
ALLOWED_ORIGINS = settings.ALLOWED_ORIGINS


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
