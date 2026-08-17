import os
from datetime import datetime, timedelta, timezone

import stripe
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .database import FRONTEND_URL, SessionLocal

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Products router ---
router = APIRouter(prefix="/api/v1/products", tags=["products"])


@router.get("/", summary="List products")
def list_products(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    """List products with pagination and search."""
    query = select(models.Product).where(models.Product.is_active)

    if search:
        query = query.where(
            models.Product.name.ilike(f"%{search}%")
            | models.Product.description.ilike(f"%{search}%")
        )

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()

    products = db.execute(query.offset(skip).limit(limit)).scalars().unique().all()

    result = []
    for p in products:
        variant = p.variants[0] if p.variants else None
        inv = variant.inventory if variant and variant.inventory else None
        result.append(
            {
                "id": p.id,
                "sku": p.sku,
                "name": p.name,
                "slug": p.slug,
                "description": p.description,
                "price": str(variant.price) if variant else None,
                "inventory_quantity": inv.quantity if inv else 0,
                "is_active": p.is_active,
            }
        )

    return {"total": total, "items": result, "skip": skip, "limit": limit}


@router.get("/{product_id}", summary="Retrieve a product")
def retrieve_product(product_id: int, db: Session = Depends(get_db)):
    """Retrieve a product by ID."""
    product = db.get(models.Product, product_id)
    if not product or not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found")

    variants_out = []
    for v in product.variants:
        inv = v.inventory if v.inventory else None
        variants_out.append(
            {
                "id": v.id,
                "sku": v.sku,
                "name": v.name,
                "price": str(v.price),
                "compare_at_price": (
                    str(v.compare_at_price) if v.compare_at_price else None
                ),
                "inventory_quantity": inv.quantity if inv else 0,
                "is_active": v.is_active,
            }
        )

    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "variants": variants_out,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


# --- Cart router ---
cart_router = APIRouter(prefix="/cart", tags=["cart"])


class CreateCheckoutSessionBody(BaseModel):
    session_id: str


@cart_router.get("/", summary="View cart")
def view_cart(session_id: str | None = None, db: Session = Depends(get_db)):
    """View cart items for a session."""
    if not session_id:
        return {"items": [], "total": 0, "total_quantity": 0}

    cart = db.execute(
        select(models.Cart).where(models.Cart.session_id == session_id)
    ).scalar_one_or_none()

    if not cart:
        return {"items": [], "total": 0, "total_quantity": 0}

    result = []
    total = 0
    total_quantity = 0
    for item in cart.items:
        result.append(
            {
                "id": item.id,
                "variant_id": item.variant_id,
                "quantity": item.quantity,
                "price": str(item.variant.price),
                "product_name": item.variant.product.name,
            }
        )
        total += float(item.price_at_addition) * item.quantity
        total_quantity += item.quantity

    return {"items": result, "total": total, "total_quantity": total_quantity}


@cart_router.post("/add", summary="Add item to cart")
def add_to_cart(
    variant_id: int = Body(...),
    quantity: int = Body(default=1),
    session_id: str = Body(...),
    db: Session = Depends(get_db),
):
    """Add a product variant to the cart."""
    # Get or create cart, reusing the client-supplied session id for new carts
    if session_id:
        cart = db.execute(
            select(models.Cart).where(models.Cart.session_id == session_id)
        ).scalar_one_or_none()
    else:
        cart = None

    if not cart:
        if not session_id:
            import uuid

            session_id = str(uuid.uuid4())
        cart = models.Cart(
            session_id=session_id,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        db.add(cart)
        db.commit()
        db.refresh(cart)

    # Check variant exists and is active
    variant = db.get(models.Variant, variant_id)
    if not variant or not variant.is_active:
        raise HTTPException(status_code=404, detail="Variant not found or inactive")

    # Check inventory
    if variant.inventory and variant.inventory.quantity < quantity:
        raise HTTPException(
            status_code=400,
            detail="Insufficient inventory",
        )

    # Check if item already in cart
    existing_item = db.execute(
        select(models.CartItem).where(
            models.CartItem.cart_id == cart.id,
            models.CartItem.variant_id == variant_id,
        )
    ).scalar_one_or_none()

    if existing_item:
        existing_item.quantity += quantity
    else:
        item = models.CartItem(
            cart_id=cart.id,
            variant_id=variant_id,
            quantity=quantity,
            price_at_addition=variant.price,
        )
        db.add(item)

    cart.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "message": "Item added to cart",
        "cart_id": cart.id,
        "session_id": session_id,
    }


@cart_router.post("/remove", summary="Remove item from cart")
def remove_from_cart(
    variant_id: int = Body(...),
    session_id: str = Body(...),
    db: Session = Depends(get_db),
):
    """Remove a product variant from the cart."""
    cart = db.execute(
        select(models.Cart).where(models.Cart.session_id == session_id)
    ).scalar_one_or_none()

    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")

    item = db.execute(
        select(models.CartItem).where(
            models.CartItem.cart_id == cart.id,
            models.CartItem.variant_id == variant_id,
        )
    ).scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Item not in cart")

    db.delete(item)
    cart.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Item removed from cart"}


# --- Payment router ---
payment_router = APIRouter(prefix="/payment", tags=["payment"])


@payment_router.post(
    "/create-checkout-session", summary="Create Stripe checkout session"
)
def create_checkout_session(
    body: CreateCheckoutSessionBody = Body(...),
    db: Session = Depends(get_db),
):
    """Create a Stripe checkout session for the cart."""
    session_id = body.session_id

    # Get cart
    cart = db.execute(
        select(models.Cart).where(models.Cart.session_id == session_id)
    ).scalar_one_or_none()

    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")

    # Get cart items
    items = (
        db.execute(select(models.CartItem).where(models.CartItem.cart_id == cart.id))
        .scalars()
        .all()
    )

    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    line_items = []
    for item in items:
        variant = db.get(models.Variant, item.variant_id)
        if not variant:
            raise HTTPException(
                status_code=404, detail=f"Variant {item.variant_id} not found"
            )

        line_items.append(
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": variant.product.name,
                        "description": variant.product.description or "",
                    },
                    "unit_amount": int(float(variant.price) * 100),
                },
                "quantity": item.quantity,
            }
        )

    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe API key not configured")

    checkout_session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=line_items,
        mode="payment",
        metadata={"session_id": session_id},
        success_url=(f"{FRONTEND_URL}/cart/success?session_id={{CHECKOUT_SESSION_ID}}"),
        cancel_url=f"{FRONTEND_URL}/cart/cancel",
    )

    return {"checkout_url": checkout_session.url}


@payment_router.post("/webhook", summary="Stripe webhook handler")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    event = None

    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        raise HTTPException(
            status_code=503, detail="Stripe webhook secret not configured"
        )

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {e!s}")
    except stripe.error.SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail=f"Invalid signature: {e!s}")

    # Handle the checkout.session.completed event
    if event.type == "checkout.session.completed":
        session = event.data.object
        # TODO: Fulfill the order - update inventory, create order record, etc.
        # For now, just mark the cart as paid
        cart = db.execute(
            select(models.Cart).where(
                models.Cart.session_id == session.get("metadata", {}).get("session_id")
            )
        ).scalar_one_or_none()
        if cart:
            cart.payment_status = "paid"
            cart.status = "paid"
            db.commit()

    return {"status": "success"}
