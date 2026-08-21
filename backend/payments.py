"""Razorpay client helpers: order creation, signature verification, and refunds.

All functions raise ``fastapi.HTTPException`` with sensible status codes when
Razorpay is misconfigured or a signature does not verify, so callers can let
FastAPI render the error response.
"""

from __future__ import annotations

import hashlib
import hmac

import razorpay
from fastapi import HTTPException

from .config import settings

_client: razorpay.Client | None = None


def get_client() -> razorpay.Client:
    """Return a cached Razorpay client, raising 503 if keys are missing."""
    if not settings.RAZORPAY_API_KEY or not settings.RAZORPAY_API_SECRET:
        raise HTTPException(status_code=503, detail="Razorpay API keys not configured")
    global _client
    if _client is None:
        _client = razorpay.Client(
            auth=(settings.RAZORPAY_API_KEY, settings.RAZORPAY_API_SECRET)
        )
    return _client


def create_order(
    amount: int, currency: str, receipt: str, notes: dict | None = None
) -> dict:
    """Create a Razorpay order for the given amount (in the currency subunit)."""
    client = get_client()
    return client.order.create(
        {
            "amount": amount,
            "currency": currency.upper(),
            "receipt": receipt[:40],
            "notes": notes or {},
            "payment_capture": 1,
        }
    )


def fetch_order(order_id: str) -> dict:
    """Fetch a previously created Razorpay order by id."""
    client = get_client()
    return client.order.fetch(order_id)


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> None:
    """Verify the Checkout.js return signature; raises 400 on failure."""
    client = get_client()
    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
            }
        )
    except razorpay.errors.SignatureVerificationError as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid Razorpay signature: {e!s}"
        )


def verify_webhook_signature(payload: bytes, signature: str | None) -> None:
    """Verify the HMAC-SHA256 webhook signature; raises 400/503 on failure."""
    if not settings.RAZORPAY_API_SECRET:
        raise HTTPException(
            status_code=503, detail="Razorpay API secret not configured"
        )
    if not signature:
        raise HTTPException(
            status_code=400, detail="Missing Razorpay webhook signature"
        )
    expected = hmac.new(
        settings.RAZORPAY_API_SECRET.encode("utf-8"), payload, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(
            status_code=400, detail="Invalid Razorpay webhook signature"
        )


def refund_payment(payment_id: str) -> dict:
    """Refund a captured Razorpay payment in full."""
    client = get_client()
    return client.payment.refund(payment_id)
