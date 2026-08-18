"""Pydantic schemas for request/response validation."""

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --- Product Schemas ---


class ProductImageBase(BaseModel):
    url: str
    alt_text: str | None = None
    sort_order: int = 0
    is_primary: bool = False


class ProductImageCreate(ProductImageBase):
    pass


class ProductImageUpdate(BaseModel):
    url: str | None = None
    alt_text: str | None = None
    sort_order: int | None = None
    is_primary: bool | None = None


class ProductImageResponse(ProductImageBase):
    id: int
    product_id: int
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class ProductBase(BaseModel):
    sku: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    slug: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True
    product_metadata: dict | None = None
    image_url: str | None = None


class ProductCreate(ProductBase):
    variants: list["VariantCreate"] | None = None
    images: list[ProductImageCreate] | None = None

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        import re

        if not re.match(r"^[a-z0-9_-]+$", v.lower()):
            raise ValueError(
                "Slug must contain only lowercase letters, numbers, hyphens, and underscores"
            )
        return v.lower()


class ProductUpdate(BaseModel):
    sku: str | None = Field(None, min_length=1, max_length=100)
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    slug: str | None = Field(None, min_length=1, max_length=255)
    is_active: bool | None = None
    product_metadata: dict | None = None
    image_url: str | None = None

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str | None) -> str | None:
        if v is not None:
            import re

            if not re.match(r"^[a-z0-9_-]+$", v.lower()):
                raise ValueError(
                    "Slug must contain only lowercase letters, numbers, hyphens, and underscores"
                )
            return v.lower()
        return v


class ProductResponse(ProductBase):
    id: int
    variants: list["VariantResponse"] = []
    images: list[ProductImageResponse] = []
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


# --- Variant Schemas ---


class VariantBase(BaseModel):
    sku: str = Field(..., min_length=1, max_length=100)
    name: str | None = Field(None, max_length=255)
    price: Decimal = Field(..., ge=0, decimal_places=2)
    compare_at_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    is_active: bool = True


class VariantCreate(VariantBase):
    inventory_quantity: int = Field(0, ge=0)
    track_inventory: bool = True
    inventory_policy: str = Field("deny", pattern="^(deny|continue)$")


class VariantUpdate(BaseModel):
    sku: str | None = Field(None, min_length=1, max_length=100)
    name: str | None = Field(None, max_length=255)
    price: Decimal | None = Field(None, ge=0, decimal_places=2)
    compare_at_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    is_active: bool | None = None
    inventory_quantity: int | None = Field(None, ge=0)
    track_inventory: bool | None = None
    inventory_policy: str | None = Field(None, pattern="^(deny|continue)$")


class VariantResponse(VariantBase):
    id: int
    product_id: int
    inventory: Optional["InventoryResponse"] = None
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


# --- Inventory Schemas ---


class InventoryBase(BaseModel):
    quantity: int = Field(0, ge=0)
    track_quantity: bool = True
    policy: str = Field("deny", pattern="^(deny|continue)$")


class InventoryCreate(InventoryBase):
    pass


class InventoryUpdate(BaseModel):
    quantity: int | None = Field(None, ge=0)
    track_quantity: bool | None = None
    policy: str | None = Field(None, pattern="^(deny|continue)$")


class InventoryResponse(InventoryBase):
    id: int
    variant_id: int
    last_checked: str

    model_config = ConfigDict(from_attributes=True)


# --- Admin Response Wrappers ---


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str


# Resolve forward references
ProductCreate.model_rebuild()
ProductUpdate.model_rebuild()
ProductResponse.model_rebuild()
VariantCreate.model_rebuild()
VariantUpdate.model_rebuild()
VariantResponse.model_rebuild()
InventoryResponse.model_rebuild()
