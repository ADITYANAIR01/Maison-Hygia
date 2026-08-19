"""Order service: fulfillment, refunds, and revenue aggregation."""

from datetime import datetime, timezone
from decimal import Decimal

import stripe
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models


def create_order_from_cart(
    db: Session, cart: models.Cart, session: dict
) -> models.Order:
    """Create an Order from a paid cart (idempotent on stripe_session_id).

    Copies line items with price snapshots, decrements inventory, and marks the
    cart as paid. Returns the existing Order if the Stripe session was already
    fulfilled.
    """
    stripe_session_id = session.get("id")
    if not stripe_session_id:
        stripe_session_id = (session.get("metadata") or {}).get("session_id")

    existing = db.execute(
        select(models.Order).where(models.Order.stripe_session_id == stripe_session_id)
    ).scalar_one_or_none()
    if existing:
        return existing

    if cart.status == "paid":
        raise HTTPException(status_code=409, detail="Cart already fulfilled")

    customer_details = session.get("customer_details") or {}
    shipping = session.get("shipping_details") or {}
    total = Decimal(str(session.get("amount_total", 0))) / Decimal(100)

    order = models.Order(
        cart_id=cart.id,
        session_id=cart.session_id,
        customer_email=customer_details.get("email"),
        customer_name=customer_details.get("name"),
        shipping_address=shipping.get("address"),
        total=total,
        currency=session.get("currency") or "usd",
        status="paid",
        payment_status="paid",
        stripe_session_id=stripe_session_id,
    )
    db.add(order)
    db.flush()

    for item in cart.items:
        variant = item.variant
        inventory = variant.inventory if variant else None
        if inventory is not None and inventory.quantity < item.quantity:
            raise HTTPException(
                status_code=409,
                detail=f"Insufficient inventory for variant {variant.sku}",
            )

        db.add(
            models.OrderItem(
                order_id=order.id,
                variant_id=item.variant_id,
                sku_snapshot=variant.sku if variant else "",
                name_snapshot=variant.product.name if variant else "Unknown product",
                price_snapshot=item.price_at_addition,
                quantity=item.quantity,
            )
        )
        if inventory is not None:
            inventory.quantity -= item.quantity
            inventory.last_checked = datetime.now(timezone.utc)

    cart.payment_status = "paid"
    cart.status = "paid"
    cart.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return order


def refund_order(db: Session, order: models.Order) -> models.Order:
    """Refund an order via the Stripe Refunds API and update its status."""
    if not order.stripe_session_id:
        raise HTTPException(status_code=400, detail="Order has no Stripe session")

    session = stripe.checkout.Session.retrieve(order.stripe_session_id)
    payment_intent = getattr(session, "payment_intent", None)
    if not payment_intent:
        raise HTTPException(
            status_code=400, detail="Order has no Stripe payment intent to refund"
        )

    stripe.Refund.create(payment_intent=payment_intent)

    order.status = "refunded"
    order.payment_status = "refunded"
    order.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return order


def revenue_between(db: Session, start: datetime, end: datetime) -> list[dict]:
    """Return daily revenue between two timestamps (inclusive) for paid orders."""
    rows = db.execute(
        select(
            func.date(models.Order.created_at).label("date"),
            func.sum(models.Order.total).label("revenue"),
        )
        .where(
            models.Order.created_at >= start,
            models.Order.created_at < end,
            models.Order.payment_status == "paid",
        )
        .group_by(func.date(models.Order.created_at))
        .order_by(func.date(models.Order.created_at))
    ).all()

    return [
        {"date": row.date.isoformat(), "revenue": float(row.revenue or 0)}
        for row in rows
    ]
