"""Admin API - JSON contract endpoints under /api/v1/admin.

All list responses are shaped ``{data, total, page, limit}`` and every route
requires the Cognito admin role.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from . import models
from .auth import get_db, require_admin
from .config import settings
from .orders import refund_order, revenue_between
from .s3 import content_type_for_ext, presign_upload, public_url, validate_filename

admin_router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


def _paginated(data: list, total: int, page: int, limit: int) -> dict:
    return {"data": data, "total": total, "page": page, "limit": limit}


def _serialize_product(product: models.Product) -> dict:
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

    first = variants_out[0] if variants_out else None
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "image_url": product.image_url,
        "is_active": product.is_active,
        "price": first["price"] if first else None,
        "variants": variants_out,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


def _apply_variant_data(db: Session, variant: models.Variant, data: dict) -> None:
    if "sku" in data:
        variant.sku = data["sku"]
    if "name" in data:
        variant.name = data["name"]
    if "price" in data:
        variant.price = data["price"]
    if "compare_at_price" in data:
        variant.compare_at_price = data["compare_at_price"] or None
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


# ---------- Dashboard ----------


@admin_router.get("/dashboard/kpis", summary="Dashboard KPIs")
def dashboard_kpis(db: Session = Depends(get_db)):
    total_products = db.execute(
        select(func.count()).select_from(models.Product)
    ).scalar_one()
    active_products = db.execute(
        select(func.count()).select_from(models.Product).where(models.Product.is_active)
    ).scalar_one()
    variants = db.execute(select(func.count()).select_from(models.Variant)).scalar_one()
    orders = db.execute(select(func.count()).select_from(models.Order)).scalar_one()
    paid_orders = db.execute(
        select(func.count())
        .select_from(models.Order)
        .where(models.Order.payment_status == "paid")
    ).scalar_one()
    revenue = db.execute(
        select(func.coalesce(func.sum(models.Order.total), 0)).where(
            models.Order.payment_status == "paid"
        )
    ).scalar_one()
    customers = db.execute(
        select(func.count(func.distinct(models.Order.customer_email)))
    ).scalar_one()

    return {
        "total_products": total_products,
        "active_products": active_products,
        "variants": variants,
        "orders": orders,
        "paid_orders": paid_orders,
        "revenue": float(revenue),
        "customers": customers,
    }


@admin_router.get("/dashboard/revenue", summary="Daily revenue")
def dashboard_revenue(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return revenue_between(db, start, end)


# ---------- Products ----------


@admin_router.get("/products", summary="List all products (admin)")
def admin_list_products(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    query = select(models.Product).options(
        selectinload(models.Product.variants).selectinload(models.Variant.inventory)
    )
    if search:
        query = query.where(
            models.Product.name.ilike(f"%{search}%")
            | models.Product.description.ilike(f"%{search}%")
            | models.Product.sku.ilike(f"%{search}%")
        )
    if is_active is not None:
        query = query.where(models.Product.is_active == is_active)

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    products = (
        db.execute(
            query.order_by(models.Product.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        .scalars()
        .unique()
        .all()
    )
    return _paginated([_serialize_product(p) for p in products], total, page, limit)


@admin_router.get("/products/{product_id}", summary="Retrieve a product (admin)")
def admin_retrieve_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return _serialize_product(product)


@admin_router.post("/products", summary="Create a product (admin)")
def admin_create_product(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    sku = payload.get("sku")
    slug = payload.get("slug")
    if not sku or not slug:
        raise HTTPException(status_code=400, detail="sku and slug are required")

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
        name=payload.get("name") or "",
        slug=slug,
        description=payload.get("description"),
        is_active=payload.get("is_active", True),
        image_url=payload.get("image_url"),
    )
    db.add(product)
    db.flush()

    for vdata in payload.get("variants") or []:
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

    db.commit()
    db.refresh(product)
    return _serialize_product(product)


@admin_router.put("/products/{product_id}", summary="Update a product (admin)")
def admin_update_product(
    product_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if "sku" in payload and payload["sku"] != product.sku:
        clash = db.execute(
            select(models.Product).where(
                models.Product.sku == payload["sku"],
                models.Product.id != product_id,
            )
        ).scalar_one_or_none()
        if clash:
            raise HTTPException(status_code=400, detail="SKU already in use")
        product.sku = payload["sku"]

    new_slug = payload.get("slug", product.slug)
    if new_slug != product.slug:
        clash = db.execute(
            select(models.Product).where(
                models.Product.slug == new_slug,
                models.Product.id != product_id,
            )
        ).scalar_one_or_none()
        if clash:
            raise HTTPException(status_code=400, detail="Slug already in use")
        product.slug = new_slug

    if "name" in payload:
        product.name = payload["name"]
    if "description" in payload:
        product.description = payload["description"]
    if "is_active" in payload:
        product.is_active = payload["is_active"]
    if "image_url" in payload:
        product.image_url = payload["image_url"] or None

    if "variants" in payload:
        existing = list(product.variants)
        for idx, vdata in enumerate(payload["variants"]):
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

        for stale in existing[len(payload["variants"]) :]:
            db.delete(stale)

    db.commit()
    db.refresh(product)
    return _serialize_product(product)


@admin_router.delete("/products/{product_id}", summary="Delete a product (admin)")
def admin_delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    db.delete(product)
    db.commit()
    return {"message": "Product deleted"}


@admin_router.post("/upload-url", summary="Presign an image upload")
def admin_upload_url(payload: dict = Body(...)):
    filename = payload.get("filename")
    folder = payload.get("folder", "products")
    size = int(payload.get("size", 0))

    if not filename:
        raise HTTPException(status_code=400, detail="filename is required")

    ext = validate_filename(filename)
    key = f"{folder.strip('/')}/{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{validate_filename(filename)}"
    content_type = content_type_for_ext(ext)
    url = presign_upload(key, content_type, size)
    return {"url": url, "key": key, "public_url": public_url(key)}


# ---------- Orders ----------


def _serialize_order(order: models.Order) -> dict:
    items = [
        {
            "id": item.id,
            "variant_id": item.variant_id,
            "sku": item.sku_snapshot,
            "name": item.name_snapshot,
            "price": str(item.price_snapshot),
            "quantity": item.quantity,
            "line_total": str(item.price_snapshot * item.quantity),
        }
        for item in order.items
    ]
    return {
        "id": order.id,
        "cart_id": order.cart_id,
        "session_id": order.session_id,
        "customer": order.customer_name or order.customer_email or "Unknown",
        "email": order.customer_email,
        "shipping_address": order.shipping_address,
        "total": float(order.total),
        "currency": order.currency,
        "status": order.status,
        "payment_status": order.payment_status,
        "items": items,
        "items_count": len(items),
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    }


@admin_router.get("/orders", summary="List orders (admin)")
def admin_list_orders(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = select(models.Order).options(selectinload(models.Order.items))
    if status:
        query = query.where(models.Order.status == status)
    if search:
        query = query.where(
            models.Order.customer_email.ilike(f"%{search}%")
            | models.Order.customer_name.ilike(f"%{search}%")
            | models.Order.session_id.ilike(f"%{search}%")
        )

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    orders = (
        db.execute(
            query.order_by(models.Order.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        .scalars()
        .unique()
        .all()
    )
    return _paginated([_serialize_order(o) for o in orders], total, page, limit)


@admin_router.get("/orders/{order_id}", summary="Retrieve an order (admin)")
def admin_retrieve_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _serialize_order(order)


@admin_router.put("/orders/{order_id}", summary="Update order status (admin)")
def admin_update_order(
    order_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    new_status = payload.get("status")
    allowed = {"pending", "paid", "fulfilled", "cancelled", "refunded"}
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    order.status = new_status
    if new_status == "refunded":
        order.payment_status = "refunded"
    order.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return _serialize_order(order)


@admin_router.post("/orders/{order_id}/refund", summary="Refund an order (admin)")
def admin_refund_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    refund_order(db, order)
    return _serialize_order(order)


# ---------- Users (Cognito) ----------


def _cognito_client():
    return boto3.client("cognito-idp", region_name=settings.AWS_REGION)


def _cognito_user_dict(user: dict, order_stats: dict) -> dict:
    attrs = {a["Name"]: a["Value"] for a in user.get("Attributes", [])}
    email = attrs.get("email", "")
    stats = order_stats.get(email, {"orders_count": 0, "total_spent": 0})
    return {
        "id": user.get("Username") or attrs.get("sub"),
        "username": user.get("Username"),
        "email": email,
        "name": attrs.get("name") or attrs.get("custom:display_name") or email,
        "role": attrs.get("custom:role", "customer"),
        "groups": attrs.get("cognito:groups") or [],
        "is_active": user.get("Enabled", True),
        "user_status": user.get("UserStatus"),
        "orders_count": stats["orders_count"],
        "total_spent": stats["total_spent"],
        "created_at": user.get("UserCreateDate"),
    }


def _order_stats_by_email(db: Session) -> dict:
    rows = db.execute(
        select(
            models.Order.customer_email,
            func.count(models.Order.id),
            func.coalesce(func.sum(models.Order.total), 0),
        ).group_by(models.Order.customer_email)
    ).all()
    return {
        row[0]: {"orders_count": row[1], "total_spent": float(row[2])} for row in rows
    }


@admin_router.get("/users", summary="List users (Cognito)")
def admin_list_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    db: Session = Depends(get_db),
):
    if not settings.COGNITO_USER_POOL_ID:
        raise HTTPException(status_code=503, detail="Cognito not configured")

    try:
        client = _cognito_client()
        users = []
        pagination_token = None
        while True:
            kwargs = {"UserPoolId": settings.COGNITO_USER_POOL_ID, "Limit": 60}
            if pagination_token:
                kwargs["PaginationToken"] = pagination_token
            response = client.list_users(**kwargs)
            users.extend(response.get("Users", []))
            pagination_token = response.get("PaginationToken")
            if not pagination_token or len(users) >= page * limit:
                break
    except ClientError as e:
        raise HTTPException(status_code=502, detail=f"Cognito error: {e}")

    order_stats = _order_stats_by_email(db)
    results = [_cognito_user_dict(u, order_stats) for u in users]
    if search:
        needle = search.lower()
        results = [
            u
            for u in results
            if needle in (u["email"] or "").lower()
            or needle in (u["name"] or "").lower()
        ]

    total = len(results)
    start = (page - 1) * limit
    return _paginated(results[start : start + limit], total, page, limit)


@admin_router.put("/users/{user_id}/role", summary="Change a user's role (Cognito)")
def admin_update_user_role(
    user_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    if not settings.COGNITO_USER_POOL_ID:
        raise HTTPException(status_code=503, detail="Cognito not configured")

    role = payload.get("role")
    allowed = {"admin", "editor", "customer"}
    if role not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role}")

    try:
        client = _cognito_client()
        pool_id = settings.COGNITO_USER_POOL_ID
        current = client.admin_list_groups_for_user(
            UserPoolId=pool_id, Username=user_id
        )
        for group in current.get("Groups", []):
            group_name = group["GroupName"]
            if group_name in allowed and group_name != role:
                client.admin_remove_user_from_group(
                    UserPoolId=pool_id, Username=user_id, GroupName=group_name
                )
        if role != "customer":
            client.admin_add_user_to_group(
                UserPoolId=pool_id, Username=user_id, GroupName=role
            )
        client.admin_update_user_attributes(
            UserPoolId=pool_id,
            Username=user_id,
            UserAttributes=[{"Name": "custom:role", "Value": role}],
        )
    except ClientError as e:
        raise HTTPException(status_code=502, detail=f"Cognito error: {e}")

    return {"message": "Role updated", "role": role}


@admin_router.put("/users/{user_id}", summary="Enable or disable a user (Cognito)")
def admin_update_user(
    user_id: str,
    payload: dict = Body(...),
):
    if not settings.COGNITO_USER_POOL_ID:
        raise HTTPException(status_code=503, detail="Cognito not configured")

    enabled = payload.get("enabled")
    if enabled is None:
        raise HTTPException(status_code=400, detail="enabled is required")

    try:
        client = _cognito_client()
        if enabled:
            client.admin_enable_user(
                UserPoolId=settings.COGNITO_USER_POOL_ID, Username=user_id
            )
        else:
            client.admin_disable_user(
                UserPoolId=settings.COGNITO_USER_POOL_ID, Username=user_id
            )
    except ClientError as e:
        raise HTTPException(status_code=502, detail=f"Cognito error: {e}")

    return {"message": "User updated", "enabled": enabled}


# ---------- Inventory ----------


@admin_router.get("/inventory", summary="List inventory (admin)")
def admin_list_inventory(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    search: str | None = None,
    low_stock: bool = False,
    db: Session = Depends(get_db),
):
    query = (
        select(models.Variant)
        .options(
            selectinload(models.Variant.product), selectinload(models.Variant.inventory)
        )
        .join(models.Product)
    )
    if search:
        query = query.where(
            models.Product.name.ilike(f"%{search}%")
            | models.Variant.sku.ilike(f"%{search}%")
        )
    if low_stock:
        query = query.join(models.Inventory).where(models.Inventory.quantity < 10)

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    variants = (
        db.execute(
            query.order_by(models.Product.name.asc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        .scalars()
        .unique()
        .all()
    )

    data = []
    for v in variants:
        inv = v.inventory if v.inventory else None
        quantity = inv.quantity if inv else 0
        data.append(
            {
                "id": v.id,
                "variant_id": v.id,
                "product_id": v.product_id,
                "product_name": v.product.name if v.product else "",
                "variant_name": v.name or "",
                "sku": v.sku,
                "inventory_quantity": quantity,
                "low_stock": quantity < 10,
                "is_active": v.is_active,
            }
        )
    return _paginated(data, total, page, limit)


@admin_router.put("/inventory/bulk", summary="Bulk update inventory (admin)")
def admin_bulk_update_inventory(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    updates = payload.get("updates") or []
    if not updates:
        raise HTTPException(status_code=400, detail="updates is required")

    for update in updates:
        variant_id = update.get("variant_id")
        quantity = update.get("quantity")
        if variant_id is None or quantity is None:
            raise HTTPException(
                status_code=400, detail="Each update needs variant_id and quantity"
            )
        variant = db.get(models.Variant, variant_id)
        if not variant:
            raise HTTPException(
                status_code=404, detail=f"Variant {variant_id} not found"
            )
        if not variant.inventory:
            variant.inventory = models.Inventory(
                quantity=quantity, variant_id=variant.id
            )
            variant.inventory.variant = variant
            db.add(variant.inventory)
        else:
            variant.inventory.quantity = quantity

    db.commit()
    return {"message": "Inventory updated", "updated": len(updates)}
