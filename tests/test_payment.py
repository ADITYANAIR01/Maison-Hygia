from types import SimpleNamespace

import stripe
from sqlalchemy import select

from backend.database import SessionLocal
from backend.models import Cart, Inventory, Order


def _add_item(client, variant_id, sid):
    resp = client.post(
        "/cart/add", json={"variant_id": variant_id, "quantity": 1, "session_id": sid}
    )
    assert resp.status_code == 200


def _cart_by_session(sid):
    db = SessionLocal()
    try:
        return db.execute(select(Cart).where(Cart.session_id == sid)).scalar_one()
    finally:
        db.close()


def _inventory_for_variant(variant_id):
    db = SessionLocal()
    try:
        return db.execute(
            select(Inventory).where(Inventory.variant_id == variant_id)
        ).scalar_one()
    finally:
        db.close()


def test_create_checkout_session_metadata_and_urls(client, variant_ids, monkeypatch):
    sid = "pay-session-1"
    _add_item(client, variant_ids[0], sid)

    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(url="https://checkout.stripe.com/c/pay/test_123")

    monkeypatch.setattr(stripe.checkout.Session, "create", fake_create)

    resp = client.post("/payment/create-checkout-session", json={"session_id": sid})
    assert resp.status_code == 200
    assert resp.json()["checkout_url"] == "https://checkout.stripe.com/c/pay/test_123"

    assert captured["metadata"] == {"session_id": sid}
    assert (
        captured["success_url"]
        == "http://localhost:8000/checkout/success?session_id={CHECKOUT_SESSION_ID}"
    )
    assert captured["cancel_url"] == "http://localhost:8000/checkout/cancel"


def test_create_checkout_session_unknown_cart_404(client):
    resp = client.post(
        "/payment/create-checkout-session", json={"session_id": "no-such-cart"}
    )
    assert resp.status_code == 404


def test_create_checkout_session_empty_cart_400(client, variant_ids):
    sid = "pay-session-empty"
    _add_item(client, variant_ids[0], sid)
    client.post("/cart/remove", json={"variant_id": variant_ids[0], "session_id": sid})
    resp = client.post("/payment/create-checkout-session", json={"session_id": sid})
    assert resp.status_code == 400


def _completed_event(sid, session_id="cs_test_123"):
    return SimpleNamespace(
        type="checkout.session.completed",
        data=SimpleNamespace(
            object={
                "id": session_id,
                "metadata": {"session_id": sid},
                "customer_details": {
                    "email": "buyer@example.com",
                    "name": "Test Buyer",
                },
                "shipping_details": {
                    "address": {
                        "line1": "1 Wellness Way",
                        "city": "Austin",
                        "state": "TX",
                        "postal_code": "78701",
                        "country": "US",
                    }
                },
                "amount_total": 2400,
                "currency": "usd",
            }
        ),
    )


def test_webhook_creates_order_and_decrements_inventory(
    client, variant_ids, monkeypatch
):
    sid = "webhook-session-1"
    _add_item(client, variant_ids[0], sid)
    inventory_before = _inventory_for_variant(variant_ids[0]).quantity

    fake_event = _completed_event(sid, session_id="cs_test_webhook1")
    monkeypatch.setattr(
        stripe.Webhook, "construct_event", lambda *args, **kwargs: fake_event
    )

    resp = client.post(
        "/payment/webhook", content=b"{}", headers={"stripe-signature": "dummy"}
    )
    assert resp.status_code == 200

    cart = _cart_by_session(sid)
    assert cart.payment_status == "paid"
    assert cart.status == "paid"

    db = SessionLocal()
    try:
        order = db.execute(
            select(Order).where(Order.stripe_session_id == "cs_test_webhook1")
        ).scalar_one()
        assert order.status == "paid"
        assert order.payment_status == "paid"
        assert order.customer_email == "buyer@example.com"
        assert order.total == 24.00
        assert len(order.items) == 1
        assert order.items[0].quantity == 1
        assert order.items[0].sku_snapshot == "MH-002-S"
    finally:
        db.close()

    assert _inventory_for_variant(variant_ids[0]).quantity == inventory_before - 1


def test_webhook_is_idempotent_for_same_session(client, variant_ids, monkeypatch):
    sid = "webhook-session-2"
    _add_item(client, variant_ids[0], sid)
    inventory_before = _inventory_for_variant(variant_ids[0]).quantity

    fake_event = _completed_event(sid, session_id="cs_test_webhook2")
    monkeypatch.setattr(
        stripe.Webhook, "construct_event", lambda *args, **kwargs: fake_event
    )

    for _ in range(2):
        resp = client.post(
            "/payment/webhook", content=b"{}", headers={"stripe-signature": "dummy"}
        )
        assert resp.status_code == 200

    db = SessionLocal()
    try:
        orders = db.execute(select(Order)).scalars().all()
        assert sum(1 for o in orders if o.stripe_session_id == "cs_test_webhook2") == 1
    finally:
        db.close()

    assert _inventory_for_variant(variant_ids[0]).quantity == inventory_before - 1


def test_webhook_unknown_session_is_noop(client, monkeypatch):
    fake_event = _completed_event("no-such-cart")
    monkeypatch.setattr(
        stripe.Webhook, "construct_event", lambda *args, **kwargs: fake_event
    )

    resp = client.post(
        "/payment/webhook", content=b"{}", headers={"stripe-signature": "dummy"}
    )
    assert resp.status_code == 200


def test_confirm_order_endpoint(client, variant_ids, monkeypatch):
    sid = "confirm-session-1"
    _add_item(client, variant_ids[0], sid)

    fake_event = _completed_event(sid, session_id="cs_test_confirm")
    monkeypatch.setattr(
        stripe.Webhook, "construct_event", lambda *args, **kwargs: fake_event
    )
    client.post(
        "/payment/webhook", content=b"{}", headers={"stripe-signature": "dummy"}
    )

    resp = client.get(
        "/api/v1/orders/confirm", params={"session_id": "cs_test_confirm"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "paid"
    assert data["customer_email"] == "buyer@example.com"
    assert data["total"] == 24.00
    assert len(data["items"]) == 1


def test_confirm_order_unknown_session_404(client):
    resp = client.get("/api/v1/orders/confirm", params={"session_id": "no-such"})
    assert resp.status_code == 404
