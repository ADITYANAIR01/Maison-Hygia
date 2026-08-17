from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL


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
