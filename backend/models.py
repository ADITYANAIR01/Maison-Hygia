from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base

# ---------- Tags ----------


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)


product_tags = Table(
    "product_tags",
    Base.metadata,
    Column("product_id", Integer, ForeignKey("products.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True),
)


# ---------- Product ----------


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    product_metadata = Column(JSON, nullable=True, default={})
    # Primary image URL (stored as relative path from assets/)
    image_url = Column(String, nullable=True)

    # Relations
    variants = relationship(
        "Variant", back_populates="product", cascade="all, delete-orphan"
    )
    images = relationship(
        "ProductImage", back_populates="product", cascade="all, delete-orphan"
    )

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# ---------- Variant ----------


class Variant(Base):
    __tablename__ = "variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    sku = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)  # e.g., "Size M", "Color Gold"
    price = Column(Numeric(12, 2), nullable=False)
    compare_at_price = Column(Numeric(12, 2), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relations
    product = relationship("Product", back_populates="variants")
    inventory = relationship(
        "Inventory",
        back_populates="variant",
        uselist=False,
        cascade="all, delete-orphan",
    )

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# ---------- Inventory ----------


class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    variant_id = Column(Integer, ForeignKey("variants.id"), nullable=False, unique=True)
    quantity = Column(Integer, nullable=False, default=0)
    track_quantity = Column(Boolean, default=True, nullable=False)
    policy = Column(String, default="deny", nullable=False)  # deny, continue
    last_checked = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relations
    variant = relationship("Variant", back_populates="inventory")


# ---------- Product Images ----------


class ProductImage(Base):
    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    url = Column(String, nullable=False)  # Relative path from assets/
    alt_text = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    is_primary = Column(Boolean, default=False)

    # Relations
    product = relationship("Product", back_populates="images")

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )


# ---------- Cart ----------


class Cart(Base):
    __tablename__ = "carts"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True, nullable=False)
    payment_status = Column(String, nullable=False, default="unpaid")
    status = Column(String, nullable=False, default="open")
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    items = relationship(
        "CartItem", back_populates="cart", cascade="all, delete-orphan"
    )


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=False)
    variant_id = Column(Integer, ForeignKey("variants.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    price_at_addition = Column(Numeric(12, 2), nullable=False)

    # Relations
    cart = relationship("Cart", back_populates="items")
    variant = relationship("Variant")


# ---------- Order ----------


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=True)
    session_id = Column(String, index=True, nullable=False)
    customer_email = Column(String, index=True, nullable=True)
    customer_name = Column(String, nullable=True)
    shipping_address = Column(JSON, nullable=True)
    total = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, nullable=False, default="usd")
    status = Column(
        String, nullable=False, default="pending"
    )  # pending|paid|fulfilled|cancelled|refunded
    payment_status = Column(String, nullable=False, default="unpaid")
    razorpay_order_id = Column(String, unique=True, index=True, nullable=False)
    razorpay_payment_id = Column(String, index=True, nullable=True)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    items = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    variant_id = Column(Integer, ForeignKey("variants.id"), nullable=True)
    sku_snapshot = Column(String, nullable=False)
    name_snapshot = Column(String, nullable=False)
    price_snapshot = Column(Numeric(12, 2), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)

    # Relations
    order = relationship("Order", back_populates="items")
