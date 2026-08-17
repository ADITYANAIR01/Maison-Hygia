from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import Product
from seed_products import seed


def _factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'seed_test.db'}")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine), engine


def test_seed_on_fresh_db_then_reconcile(tmp_path):
    factory, engine = _factory(tmp_path)

    # First run against a fresh DB: creates tables and inserts all products
    db = factory()
    seed(db=db)
    db.close()

    db = factory()
    rows = db.execute(select(Product)).scalars().all()
    assert len(rows) == 16
    slugs = [p.slug for p in rows]
    assert len(slugs) == len(set(slugs))
    db.close()

    db = factory()
    face = db.execute(
        select(Product).where(Product.slug == "MH_Face_Serum")
    ).scalar_one()
    assert str(face.variants[0].price) == "62.00"
    assert str(face.variants[0].inventory.quantity) == "30"
    db.close()

    # Simulate a stale row (old price) that a re-seed must reconcile
    db = factory()
    face = db.execute(
        select(Product).where(Product.slug == "MH_Face_Serum")
    ).scalar_one()
    face.variants[0].price = "52.00"
    db.commit()
    db.close()

    # Re-run: upserts instead of skipping, and no duplicates
    db = factory()
    seed(db=db)
    db.close()

    db = factory()
    face = db.execute(
        select(Product).where(Product.slug == "MH_Face_Serum")
    ).scalar_one()
    assert str(face.variants[0].price) == "62.00"
    rows = db.execute(select(Product)).scalars().all()
    assert len(rows) == 16
    db.close()

    engine.dispose()
