from types import SimpleNamespace

import stripe

from backend.database import SessionLocal
from backend.models import Cart
from sqlalchemy import select


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
        == "http://localhost:8000/cart/success?session_id={CHECKOUT_SESSION_ID}"
    )
    assert captured["cancel_url"] == "http://localhost:8000/cart/cancel"


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


def test_webhook_marks_cart_paid(client, variant_ids, monkeypatch):
    sid = "webhook-session-1"
    _add_item(client, variant_ids[0], sid)

    fake_event = SimpleNamespace(
        type="checkout.session.completed",
        data=SimpleNamespace(object={"metadata": {"session_id": sid}}),
    )
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


def test_webhook_unknown_session_is_noop(client, monkeypatch):
    fake_event = SimpleNamespace(
        type="checkout.session.completed",
        data=SimpleNamespace(object={"metadata": {"session_id": "no-such-cart"}}),
    )
    monkeypatch.setattr(
        stripe.Webhook, "construct_event", lambda *args, **kwargs: fake_event
    )

    resp = client.post(
        "/payment/webhook", content=b"{}", headers={"stripe-signature": "dummy"}
    )
    assert resp.status_code == 200
