"""Seed the Maison Hygia product catalog into the backend database."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import Base, SessionLocal, engine
from backend.models import Product, Variant, Inventory


PRODUCTS = [
    {
        "sku": "MH-002",
        "name": "Ayurvedic Bath Salt",
        "slug": "MH_Bath_Salt",
        "description": "Himalayan mineral bath salts infused with warming spices and essential oils to soften water and calm the senses.",
        "price": "24.00",
        "inventory": 40,
    },
    {
        "sku": "MH-003",
        "name": "Ayurvedic Body Lotion",
        "slug": "MH_Body_Lotion",
        "description": "Rich, fast-absorbing daily lotion with shea butter and cold-pressed almond oil to deeply nourish and restore the skin barrier.",
        "price": "36.00",
        "inventory": 35,
    },
    {
        "sku": "MH-004",
        "name": "Ayurvedic Body Oil",
        "slug": "MH_Body_Oil",
        "description": "Slow-pressed botanical body oil with sesame and coconut to seal in moisture and leave a radiant, satin finish.",
        "price": "38.00",
        "inventory": 30,
    },
    {
        "sku": "MH-005",
        "name": "Ayurvedic Body Scrub",
        "slug": "MH_Body_Scrub",
        "description": "Gentle exfoliating scrub with sugar and turmeric to buff away dullness and reveal smooth, glowing skin.",
        "price": "28.00",
        "inventory": 45,
    },
    {
        "sku": "MH-006",
        "name": "Ayurvedic Body Wash",
        "slug": "MH_Body_Wash",
        "description": "Creamy cleansing wash with aloe vera and neem that purifies without stripping the skin's natural oils.",
        "price": "32.00",
        "inventory": 50,
    },
    {
        "sku": "MH-007",
        "name": "Ayurvedic Face Mask",
        "slug": "MH_Face_Mask",
        "description": "Clarifying clay mask with rose and sandalwood that draws out impurities while soothing stressed skin.",
        "price": "30.00",
        "inventory": 40,
    },
    {
        "sku": "MH-008",
        "name": "Ayurvedic Face Moisturizer",
        "slug": "MH_Face_Moisturizer",
        "description": "Feather-light daily moisturizer with botanical ceramides for balanced, dewy skin.",
        "price": "34.00",
        "inventory": 40,
    },
    {
        "sku": "MH-009",
        "name": "Ayurvedic Face Scrub",
        "slug": "MH_Face_Scrub",
        "description": "Finely milled walnut and honey scrub that gently polishes and renews the complexion.",
        "price": "26.00",
        "inventory": 40,
    },
    {
        "sku": "MH-010",
        "name": "Ayurvedic Face Serum",
        "slug": "MH_Face_Serum",
        "description": "Concentrated botanical serum with vitamin C and niacinamide to brighten and firm the skin.",
        "price": "62.00",
        "inventory": 30,
    },
    {
        "sku": "MH-011",
        "name": "Ayurvedic Face Toner",
        "slug": "MH_Face_Toner",
        "description": "Alcohol-free rose water toner that rebalances, tones, and prepares skin for the next steps.",
        "price": "24.00",
        "inventory": 45,
    },
    {
        "sku": "MH-012",
        "name": "Ayurvedic Face Wash",
        "slug": "MH_Face_Wash",
        "description": "Foaming gel cleanser with neem and tulsi to refresh skin and keep breakouts at bay.",
        "price": "20.00",
        "inventory": 50,
    },
    {
        "sku": "MH-013",
        "name": "Ayurvedic Hair Conditioner",
        "slug": "MH_Hair_Conditioner",
        "description": "Silky conditioner with amla and bhringraj to detangle, soften, and restore hair's natural shine.",
        "price": "30.00",
        "inventory": 40,
    },
    {
        "sku": "MH-014",
        "name": "Ayurvedic Hand Lotion",
        "slug": "MH_Hand_Lotion",
        "description": "Non-greasy hand lotion with kokum butter and calming lavender for soft, protected hands.",
        "price": "18.00",
        "inventory": 50,
    },
    {
        "sku": "MH-015",
        "name": "Ayurvedic Night Cream",
        "slug": "MH_Night_Cream",
        "description": "Overnight repair cream with bakuchiol and ceramides for visibly renewed skin by morning.",
        "price": "44.00",
        "inventory": 30,
    },
    {
        "sku": "MH-016",
        "name": "Ayurvedic Shampoo",
        "slug": "MH_Shampoo",
        "description": "Sulfate-free botanical shampoo with amla and shikakai to cleanse gently while strengthening hair.",
        "price": "28.00",
        "inventory": 45,
    },
    {
        "sku": "MH-017",
        "name": "Ayurvedic Sheet Mask",
        "slug": "MH_Sheet_Mask",
        "description": "Sculpting bio-cellulose sheet mask soaked in a calming botanical essence for an instant glow ritual.",
        "price": "12.00",
        "inventory": 60,
    },
]


def seed(db: Session | None = None):
    Base.metadata.create_all(bind=engine)
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        for p in PRODUCTS:
            existing = db.execute(
                select(Product).where(Product.slug == p["slug"])
            ).scalar_one_or_none()
            if existing:
                existing.sku = p["sku"]
                existing.name = p["name"]
                existing.description = p["description"]
                variant = existing.variants[0] if existing.variants else None
                if variant:
                    variant.price = p["price"]
                if variant and variant.inventory:
                    variant.inventory.quantity = p["inventory"]
                print(f"updated {p['slug']}")
                continue

            product = Product(
                sku=p["sku"],
                name=p["name"],
                slug=p["slug"],
                description=p["description"],
                is_active=True,
                product_metadata={"category": p["slug"].split("_")[1].lower()},
            )
            variant = Variant(
                sku=f'{p["sku"]}-S',
                name="Standard",
                price=p["price"],
                is_active=True,
            )
            product.variants.append(variant)
            variant.inventory = Inventory(quantity=p["inventory"])
            db.add(product)
            print(f"added {p['slug']}")

        db.commit()
        print("done")
    finally:
        if own_session:
            db.close()


if __name__ == "__main__":
    seed()
