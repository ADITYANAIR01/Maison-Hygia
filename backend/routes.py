from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from . import models
from .config import settings
from .database import SessionLocal
from .orders import create_order_from_cart
from .payments import (
    create_order,
    fetch_order,
    verify_payment_signature,
    verify_webhook_signature,
)


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
    query = (
        select(models.Product)
        .options(
            selectinload(models.Product.variants).selectinload(models.Variant.inventory)
        )
        .where(models.Product.is_active)
    )

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
                "image_url": p.image_url,
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
        "image_url": product.image_url,
        "variants": variants_out,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


# --- Cart router ---
cart_router = APIRouter(prefix="/cart", tags=["cart"])


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


class CreateOrderBody(BaseModel):
    session_id: str
    email: str | None = None
    name: str | None = None


class VerifyPaymentBody(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    session_id: str
    email: str | None = None
    name: str | None = None


@payment_router.post("/create-order", summary="Create a Razorpay order")
def create_payment_order(
    body: CreateOrderBody = Body(...),
    db: Session = Depends(get_db),
):
    """Create a Razorpay order for the cart and return its id + key for Checkout.js."""
    cart = db.execute(
        select(models.Cart).where(models.Cart.session_id == body.session_id)
    ).scalar_one_or_none()
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")

    items = (
        db.execute(select(models.CartItem).where(models.CartItem.cart_id == cart.id))
        .scalars()
        .all()
    )
    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    amount = 0
    for item in items:
        variant = db.get(models.Variant, item.variant_id)
        if not variant:
            raise HTTPException(
                status_code=404, detail=f"Variant {item.variant_id} not found"
            )
        amount += int(float(variant.price) * 100) * item.quantity

    currency = settings.PAYMENT_CURRENCY
    receipt = f"mh_{body.session_id}"
    notes = {"session_id": body.session_id}
    if body.email:
        notes["email"] = body.email
    if body.name:
        notes["name"] = body.name

    razorpay_order = create_order(amount, currency, receipt, notes)

    return {
        "order_id": razorpay_order["id"],
        "amount": razorpay_order["amount"],
        "currency": razorpay_order["currency"],
        "razorpay_key_id": settings.RAZORPAY_API_KEY,
        "session_id": body.session_id,
    }


@payment_router.post("/verify", summary="Verify a Razorpay payment")
def verify_payment(
    body: VerifyPaymentBody = Body(...),
    db: Session = Depends(get_db),
):
    """Verify the Checkout.js return signature and create the order."""
    verify_payment_signature(
        body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
    )

    cart = db.execute(
        select(models.Cart)
        .options(selectinload(models.Cart.items).selectinload(models.CartItem.variant))
        .where(models.Cart.session_id == body.session_id)
    ).scalar_one_or_none()
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")

    razorpay_order = fetch_order(body.razorpay_order_id)
    customer = {"email": body.email, "name": body.name}
    order = create_order_from_cart(
        db,
        cart,
        razorpay_order,
        payment_id=body.razorpay_payment_id,
        customer=customer,
    )

    return {
        "order_id": order.id,
        "razorpay_order_id": order.razorpay_order_id,
        "status": order.status,
    }


@payment_router.post("/webhook", summary="Razorpay webhook handler")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Razorpay webhook events and create orders for captured payments."""
    payload = await request.body()
    signature = request.headers.get("x-razorpay-signature")
    verify_webhook_signature(payload, signature)

    import json

    event = json.loads(payload or b"{}")
    if event.get("event") != "payment.captured":
        return {"status": "ignored"}

    entity = (event.get("payload") or {}).get("payment", {}).get("entity", {})
    session_id = (entity.get("notes") or {}).get("session_id")
    cart = None
    if session_id:
        cart = db.execute(
            select(models.Cart)
            .options(
                selectinload(models.Cart.items).selectinload(models.CartItem.variant)
            )
            .where(models.Cart.session_id == session_id)
        ).scalar_one_or_none()

    if cart:
        razorpay_order = {
            "id": entity.get("order_id"),
            "amount": entity.get("amount", 0),
            "currency": entity.get("currency", settings.PAYMENT_CURRENCY),
            "notes": entity.get("notes", {}),
        }
        create_order_from_cart(db, cart, razorpay_order, payment_id=entity.get("id"))

    return {"status": "success"}


# --- Order confirmation router (public) ---
checkout_router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


@checkout_router.get("/confirm", summary="Confirm a checkout session")
def confirm_order(
    session_id: str,
    db: Session = Depends(get_db),
):
    """Public endpoint used by the /checkout/success page to confirm an order."""
    order = db.execute(
        select(models.Order)
        .options(selectinload(models.Order.items))
        .where(models.Order.razorpay_order_id == session_id)
    ).scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return {
        "id": order.id,
        "customer_email": order.customer_email,
        "customer_name": order.customer_name,
        "status": order.status,
        "payment_status": order.payment_status,
        "total": float(order.total),
        "currency": order.currency,
        "items": [
            {
                "name": item.name_snapshot,
                "sku": item.sku_snapshot,
                "quantity": item.quantity,
                "price": str(item.price_snapshot),
            }
            for item in order.items
        ],
        "created_at": order.created_at,
    }
