import json
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import stripe
from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .auth import require_admin, require_editor_or_admin
from .database import FRONTEND_URL, SessionLocal

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

# Directory where admin-uploaded product images are saved (served at /assets/).
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "Website" / "assets"


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


# --- Admin router ---
admin_router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _serialize_admin_product(product) -> dict:
    """Serialize a product with variants, inventory, and images for admin views."""
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
        "is_active": product.is_active,
        "variants": variants_out,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


def _apply_variant_data(db: Session, variant: models.Variant, data: dict) -> None:
    """Apply validated variant fields to an existing or new Variant object."""
    if "sku" in data:
        variant.sku = data["sku"]
    if "name" in data:
        variant.name = data["name"]
    if "price" in data:
        variant.price = data["price"]
    if "compare_at_price" in data:
        variant.compare_at_price = data["compare_at_price"]
    if "is_active" in data:
        variant.is_active = data["is_active"]

    if "inventory_quantity" in data:
        if not variant.inventory:
            variant.inventory = models.Inventory(
                quantity=data["inventory_quantity"], variant_id=variant.id
            )
            variant.inventory.variant = variant
        else:
            variant.inventory.quantity = data["inventory_quantity"]
        db.add(variant.inventory)


@admin_router.get(
    "/products",
    summary="List all products (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_list_products(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    include_inactive: bool = True,
    db: Session = Depends(get_db),
):
    """List products for the admin panel, optionally including inactive ones."""
    query = select(models.Product)
    if search:
        query = query.where(
            models.Product.name.ilike(f"%{search}%")
            | models.Product.description.ilike(f"%{search}%")
            | models.Product.sku.ilike(f"%{search}%")
        )
    if not include_inactive:
        query = query.where(models.Product.is_active)

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    products = db.execute(query.offset(skip).limit(limit)).scalars().unique().all()

    return {
        "total": total,
        "items": [_serialize_admin_product(p) for p in products],
        "skip": skip,
        "limit": limit,
    }


@admin_router.get(
    "/products/{product_id}",
    summary="Retrieve a product (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_retrieve_product(product_id: int, db: Session = Depends(get_db)):
    """Retrieve full product detail for editing in the admin panel."""
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return _serialize_admin_product(product)


def _parse_variants_json(raw: str | None) -> list[dict] | None:
    """Parse the variants JSON string submitted by the admin form."""
    if raw is None or not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Variants must be valid JSON")
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="Variants must be a JSON array")
    return parsed


def _save_uploaded_image(image: UploadFile, slug: str) -> str | None:
    """Persist an uploaded image into the assets dir and return its URL path.

    Returns None (silently) when the assets dir is not writable, so product
    CRUD still succeeds in environments where the Website folder is read-only.
    """
    if not image or not image.filename:
        return None
    ext = Path(image.filename).suffix.lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        raise HTTPException(status_code=400, detail="Unsupported image type")
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        dest = UPLOAD_DIR / f"{slug}{ext}"
        dest.write_bytes(image.file.read())
        return f"/assets/{slug}{ext}"
    except OSError:
        return None


@admin_router.post(
    "/products",
    summary="Create a product (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_create_product(
    name: str = Form(...),
    sku: str = Form(...),
    slug: str = Form(...),
    description: str | None = Form(default=None),
    is_active: bool = Form(default=True),
    variants: str = Form(default="[]"),
    image: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    """Create a product. Variants arrive as a JSON string in the multipart form."""
    variants_list = _parse_variants_json(variants) or []

    if db.execute(
        select(models.Product).where(models.Product.slug == slug)
    ).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already in use")
    if db.execute(
        select(models.Product).where(models.Product.sku == sku)
    ).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="SKU already in use")

    product = models.Product(
        sku=sku,
        name=name,
        slug=slug,
        description=description,
        is_active=is_active,
    )
    db.add(product)
    db.flush()

    for vdata in variants_list:
        variant = models.Variant(
            product_id=product.id,
            sku=vdata.get("sku", f"{sku}-{len(product.variants) + 1}"),
            name=vdata.get("name"),
            price=vdata.get("price", Decimal("0.00")),
            compare_at_price=vdata.get("compare_at_price"),
            is_active=vdata.get("is_active", True),
        )
        db.add(variant)
        db.flush()
        _apply_variant_data(db, variant, vdata)

    image_url = _save_uploaded_image(image, slug) if image else None
    if image_url:
        product.image_url = image_url

    db.commit()
    db.refresh(product)
    return _serialize_admin_product(product)


@admin_router.put(
    "/products/{product_id}",
    summary="Update a product (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_update_product(
    product_id: int,
    name: str | None = Form(default=None),
    sku: str | None = Form(default=None),
    slug: str | None = Form(default=None),
    description: str | None = Form(default=None),
    is_active: bool | None = Form(default=None),
    variants: str = Form(default=None),
    image: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    """Update a product's scalar fields and optionally sync its variant list."""
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if sku is not None and sku != product.sku:
        clash = db.execute(
            select(models.Product).where(
                models.Product.sku == sku, models.Product.id != product_id
            )
        ).scalar_one_or_none()
        if clash:
            raise HTTPException(status_code=400, detail="SKU already in use")
        product.sku = sku

    new_slug = slug if slug is not None else product.slug
    if slug is not None and slug != product.slug:
        clash = db.execute(
            select(models.Product).where(
                models.Product.slug == slug, models.Product.id != product_id
            )
        ).scalar_one_or_none()
        if clash:
            raise HTTPException(status_code=400, detail="Slug already in use")
        product.slug = slug

    if name is not None:
        product.name = name
    if description is not None:
        product.description = description
    if is_active is not None:
        product.is_active = is_active

    variants_list = _parse_variants_json(variants)
    if variants_list is not None:
        existing = list(product.variants)
        for idx, vdata in enumerate(variants_list):
            if idx < len(existing):
                _apply_variant_data(db, existing[idx], vdata)
            else:
                variant = models.Variant(
                    product_id=product.id,
                    sku=vdata.get("sku", f"{product.sku}-{idx + 1}"),
                    name=vdata.get("name"),
                    price=vdata.get("price", Decimal("0.00")),
                    compare_at_price=vdata.get("compare_at_price"),
                    is_active=vdata.get("is_active", True),
                )
                db.add(variant)
                db.flush()
                _apply_variant_data(db, variant, vdata)

        for stale in existing[len(variants_list) :]:
            db.delete(stale)

    if image is not None:
        image_url = _save_uploaded_image(image, new_slug)
        if image_url:
            product.image_url = image_url

    db.commit()
    db.refresh(product)
    return _serialize_admin_product(product)


@admin_router.delete(
    "/products/{product_id}",
    summary="Delete a product (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_delete_product(product_id: int, db: Session = Depends(get_db)):
    """Permanently delete a product, its variants, and inventory."""
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Cascade handles variants + inventory via relationships.
    db.delete(product)
    db.commit()
    return {"message": "Product deleted"}


@admin_router.post(
    "/variants",
    summary="Create a variant (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_create_variant(
    product_id: int = Body(...),
    sku: str = Body(..., min_length=1),
    name: str | None = Body(default=None),
    price: Decimal = Body(...),
    compare_at_price: Decimal | None = Body(default=None),
    is_active: bool = Body(default=True),
    inventory_quantity: int = Body(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Add a variant to a product."""
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    variant = models.Variant(
        sku=sku,
        name=name,
        price=price,
        compare_at_price=compare_at_price,
        is_active=is_active,
    )
    variant.product = product
    db.add(variant)
    db.flush()
    variant.inventory = models.Inventory(
        quantity=inventory_quantity, variant_id=variant.id
    )
    db.add(variant.inventory)
    db.commit()
    db.refresh(variant)
    return _serialize_admin_product(product)


@admin_router.put(
    "/variants/{variant_id}",
    summary="Update a variant (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_update_variant(
    variant_id: int,
    sku: str | None = Body(default=None),
    name: str | None = Body(default=None),
    price: Decimal | None = Body(default=None),
    compare_at_price: Decimal | None = Body(default=None),
    is_active: bool | None = Body(default=None),
    inventory_quantity: int | None = Body(default=None, ge=0),
    db: Session = Depends(get_db),
):
    """Update a variant's fields and inventory quantity."""
    variant = db.get(models.Variant, variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    if sku is not None:
        variant.sku = sku
    if name is not None:
        variant.name = name
    if price is not None:
        variant.price = price
    if compare_at_price is not None:
        variant.compare_at_price = compare_at_price
    if is_active is not None:
        variant.is_active = is_active
    if inventory_quantity is not None:
        if not variant.inventory:
            variant.inventory = models.Inventory(
                quantity=inventory_quantity, variant_id=variant.id
            )
            variant.inventory.variant = variant
            db.add(variant.inventory)
        else:
            variant.inventory.quantity = inventory_quantity

    db.commit()
    db.refresh(variant)
    return _serialize_admin_product(variant.product)


@admin_router.delete(
    "/variants/{variant_id}",
    summary="Delete a variant (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_delete_variant(variant_id: int, db: Session = Depends(get_db)):
    """Delete a variant and its inventory."""
    variant = db.get(models.Variant, variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    db.delete(variant)
    db.commit()
    return {"message": "Variant deleted"}


@admin_router.put(
    "/variants/{variant_id}/inventory",
    summary="Update inventory (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_update_inventory(
    variant_id: int,
    quantity: int = Body(..., embed=True, ge=0),
    db: Session = Depends(get_db),
):
    """Set inventory quantity for a variant."""
    variant = db.get(models.Variant, variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    if not variant.inventory:
        variant.inventory = models.Inventory(quantity=quantity, variant_id=variant.id)
        variant.inventory.variant = variant
        db.add(variant.inventory)
    else:
        variant.inventory.quantity = quantity

    db.commit()
    return {"message": "Inventory updated", "quantity": quantity}


@admin_router.get(
    "/orders",
    summary="List carts/orders (admin)",
    dependencies=[Depends(require_admin)],
)
def admin_list_orders(
    skip: int = 0,
    limit: int = 100,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    """List carts for order management."""
    query = select(models.Cart)
    if status:
        query = query.where(models.Cart.status == status)
    query = query.order_by(models.Cart.created_at.desc())

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    carts = db.execute(query.offset(skip).limit(limit)).scalars().unique().all()

    result = []
    for cart in carts:
        items = []
        cart_total = 0
        cart_quantity = 0
        for item in cart.items:
            items.append(
                {
                    "variant_id": item.variant_id,
                    "quantity": item.quantity,
                    "price": str(item.price_at_addition),
                    "product_name": item.variant.product.name,
                }
            )
            cart_total += float(item.price_at_addition) * item.quantity
            cart_quantity += item.quantity
        result.append(
            {
                "id": cart.id,
                "session_id": cart.session_id,
                "status": cart.status,
                "payment_status": cart.payment_status,
                "total": cart_total,
                "total_quantity": cart_quantity,
                "items": items,
                "created_at": cart.created_at,
                "updated_at": cart.updated_at,
            }
        )

    return {"total": total, "items": result, "skip": skip, "limit": limit}


@admin_router.get(
    "/stats",
    summary="Admin dashboard stats",
    dependencies=[Depends(require_admin)],
)
def admin_stats(db: Session = Depends(get_db)):
    """Return lightweight counts for the admin dashboard."""
    product_count = db.execute(
        select(func.count()).select_from(models.Product)
    ).scalar_one()
    active_product_count = db.execute(
        select(func.count()).select_from(models.Product).where(models.Product.is_active)
    ).scalar_one()
    order_count = db.execute(select(func.count()).select_from(models.Cart)).scalar_one()
    paid_order_count = db.execute(
        select(func.count())
        .select_from(models.Cart)
        .where(models.Cart.payment_status == "paid")
    ).scalar_one()
    variant_count = db.execute(
        select(func.count()).select_from(models.Variant)
    ).scalar_one()

    return {
        "products": product_count,
        "active_products": active_product_count,
        "variants": variant_count,
        "orders": order_count,
        "paid_orders": paid_order_count,
    }
