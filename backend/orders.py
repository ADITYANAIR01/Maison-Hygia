"""Order service: fulfillment, refunds, and revenue aggregation."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .payments import refund_payment


def create_order_from_cart(
    db: Session,
    cart: models.Cart,
    razorpay_order: dict,
    payment_id: str | None = None,
    customer: dict | None = None,
) -> models.Order:
    """Create an Order from a paid cart (idempotent on razorpay_order_id).

    Copies line items with price snapshots, decrements inventory, and marks the
    cart as paid. Returns the existing Order if the Razorpay order was already
    fulfilled.
    """
    razorpay_order_id = razorpay_order.get("id")
    if not razorpay_order_id:
        raise HTTPException(status_code=400, detail="Missing Razorpay order id")

    existing = db.execute(
        select(models.Order).where(models.Order.razorpay_order_id == razorpay_order_id)
    ).scalar_one_or_none()
    if existing:
        return existing

    if cart.status == "paid":
        raise HTTPException(status_code=409, detail="Cart already fulfilled")

    notes = (
        (razorpay_order.get("notes") or {}) if isinstance(razorpay_order, dict) else {}
    )
    customer = customer or {}
    customer_email = customer.get("email") or notes.get("email")
    customer_name = customer.get("name") or notes.get("name")

    total = Decimal(str(razorpay_order.get("amount", 0))) / Decimal(100)
    currency = (razorpay_order.get("currency") or settings.PAYMENT_CURRENCY).lower()

    order = models.Order(
        cart_id=cart.id,
        session_id=cart.session_id,
        customer_email=customer_email,
        customer_name=customer_name,
        total=total,
        currency=currency,
        status="paid",
        payment_status="paid",
        razorpay_order_id=razorpay_order_id,
        razorpay_payment_id=payment_id,
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
    """Refund an order via the Razorpay Refund API and update its status."""
    if not order.razorpay_payment_id:
        raise HTTPException(
            status_code=400, detail="Order has no Razorpay payment to refund"
        )

    refund_payment(order.razorpay_payment_id)

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
