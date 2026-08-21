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


def test_create_order_returns_order_id(client, variant_ids, monkeypatch):
    sid = "create-order-session-1"
    _add_item(client, variant_ids[0], sid)

    def fake_create_order(amount, currency, receipt, notes):
        return {
            "id": "order_test1",
            "amount": amount,
            "currency": currency,
            "notes": notes or {},
        }

    monkeypatch.setattr("backend.routes.create_order", fake_create_order)

    resp = client.post("/payment/create-order", json={"session_id": sid})
    assert resp.status_code == 200
    data = resp.json()
    assert data["order_id"] == "order_test1"
    assert data["amount"] == 2400
    assert data["currency"] == "inr"
    assert "razorpay_key_id" in data


def test_create_order_unknown_cart_404(client):
    resp = client.post(
        "/payment/create-order", json={"session_id": "no-such-cart"}
    )
    assert resp.status_code == 404


def test_create_order_empty_cart_400(client, variant_ids):
    sid = "create-order-session-empty"
    _add_item(client, variant_ids[0], sid)
    client.post("/cart/remove", json={"variant_id": variant_ids[0], "session_id": sid})
    resp = client.post("/payment/create-order", json={"session_id": sid})
    assert resp.status_code == 400


def _setup_verify(
    client, variant_ids, monkeypatch, sid, razorpay_order_id="order_verify1"
):
    """Add an item and stub the Razorpay helper calls used by /payment/verify."""
    _add_item(client, variant_ids[0], sid)

    def fake_create_order(amount, currency, receipt, notes):
        return {
            "id": razorpay_order_id,
            "amount": amount,
            "currency": currency,
            "notes": notes or {},
        }

    monkeypatch.setattr("backend.routes.create_order", fake_create_order)
    monkeypatch.setattr("backend.routes.verify_payment_signature", lambda *a, **k: None)
    monkeypatch.setattr(
        "backend.routes.fetch_order",
        lambda oid: {
            "id": oid,
            "amount": 2400,
            "currency": "inr",
            "notes": {"email": "buyer@example.com", "name": "Test Buyer"},
        },
    )
    return sid


def test_verify_creates_order_and_decrements_inventory(
    client, variant_ids, monkeypatch
):
    sid = "verify-session-1"
    _setup_verify(client, variant_ids, monkeypatch, sid)
    inventory_before = _inventory_for_variant(variant_ids[0]).quantity

    resp = client.post(
        "/payment/verify",
        json={
            "razorpay_order_id": "order_verify1",
            "razorpay_payment_id": "pay_1",
            "razorpay_signature": "sig",
            "session_id": sid,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["razorpay_order_id"] == "order_verify1"

    cart = _cart_by_session(sid)
    assert cart.payment_status == "paid"

    db = SessionLocal()
    try:
        order = db.execute(
            select(Order).where(Order.razorpay_order_id == "order_verify1")
        ).scalar_one()
        assert order.customer_email == "buyer@example.com"
        assert order.total == 24.00
        assert len(order.items) == 1
    finally:
        db.close()

    assert _inventory_for_variant(variant_ids[0]).quantity == inventory_before - 1


def test_verify_is_idempotent(client, variant_ids, monkeypatch):
    sid = "verify-session-2"
    _setup_verify(client, variant_ids, monkeypatch, sid, razorpay_order_id="order_verify2")
    inventory_before = _inventory_for_variant(variant_ids[0]).quantity

    for _ in range(2):
        resp = client.post(
            "/payment/verify",
            json={
                "razorpay_order_id": "order_verify2",
                "razorpay_payment_id": "pay_2",
                "razorpay_signature": "sig",
                "session_id": sid,
            },
        )
        assert resp.status_code == 200

    db = SessionLocal()
    try:
        orders = (
            db.execute(
                select(Order).where(Order.razorpay_order_id == "order_verify2")
            ).scalars()
            .all()
        )
        assert len(orders) == 1
    finally:
        db.close()

    assert _inventory_for_variant(variant_ids[0]).quantity == inventory_before - 1


def test_webhook_creates_order(client, variant_ids, monkeypatch):
    sid = "webhook-session-1"
    _add_item(client, variant_ids[0], sid)

    monkeypatch.setattr("backend.routes.verify_webhook_signature", lambda *a, **k: None)

    body = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "order_id": "order_web1",
                    "amount": 2400,
                    "currency": "inr",
                    "id": "pay_w1",
                    "notes": {"session_id": sid},
                }
            }
        },
    }
    resp = client.post(
        "/payment/webhook",
        json=body,
        headers={"x-razorpay-signature": "dummy"},
    )
    assert resp.status_code == 200

    db = SessionLocal()
    try:
        order = db.execute(
            select(Order).where(Order.razorpay_order_id == "order_web1")
        ).scalar_one()
        assert order.status == "paid"
    finally:
        db.close()


def test_confirm_order_endpoint(client, variant_ids, monkeypatch):
    sid = "confirm-session-1"
    _setup_verify(client, variant_ids, monkeypatch, sid, razorpay_order_id="order_verifyX")

    resp = client.post(
        "/payment/verify",
        json={
            "razorpay_order_id": "order_verifyX",
            "razorpay_payment_id": "pay_x",
            "razorpay_signature": "sig",
            "session_id": sid,
        },
    )
    assert resp.status_code == 200

    resp = client.get(
        "/api/v1/orders/confirm", params={"session_id": "order_verifyX"}
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
