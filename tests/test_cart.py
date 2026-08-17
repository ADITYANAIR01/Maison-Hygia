def test_view_cart_without_session_id_returns_empty(client):
    resp = client.get("/cart/")
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0, "total_quantity": 0}


def test_view_cart_unknown_session_returns_empty(client):
    resp = client.get("/cart/?session_id=does-not-exist")
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0, "total_quantity": 0}


def test_add_twice_same_session_creates_one_cart(client, variant_ids):
    sid = "client-session-1"
    v1, v2 = variant_ids[:2]

    r1 = client.post(
        "/cart/add", json={"variant_id": v1, "quantity": 1, "session_id": sid}
    )
    assert r1.status_code == 200
    assert r1.json()["session_id"] == sid

    r2 = client.post(
        "/cart/add", json={"variant_id": v2, "quantity": 1, "session_id": sid}
    )
    assert r2.status_code == 200
    assert r2.json()["session_id"] == sid

    # Same cart reused, not a new one
    assert r1.json()["cart_id"] == r2.json()["cart_id"]

    resp = client.get(f"/cart/?session_id={sid}")
    assert resp.status_code == 200
    cart = resp.json()
    assert len(cart["items"]) == 2
    assert cart["total_quantity"] == 2


def test_add_same_variant_accumulates_quantity(client, variant_ids):
    sid = "client-session-accumulate"
    v1 = variant_ids[0]

    for _ in range(2):
        resp = client.post(
            "/cart/add", json={"variant_id": v1, "quantity": 1, "session_id": sid}
        )
        assert resp.status_code == 200

    cart = client.get(f"/cart/?session_id={sid}").json()
    assert len(cart["items"]) == 1
    assert cart["items"][0]["quantity"] == 2
    assert cart["total_quantity"] == 2


def test_remove_item(client, variant_ids):
    sid = "client-session-remove"
    v1 = variant_ids[0]

    client.post("/cart/add", json={"variant_id": v1, "quantity": 1, "session_id": sid})
    resp = client.post("/cart/remove", json={"variant_id": v1, "session_id": sid})
    assert resp.status_code == 200

    cart = client.get(f"/cart/?session_id={sid}").json()
    assert cart == {"items": [], "total": 0, "total_quantity": 0}


def test_remove_unknown_cart_404(client, variant_ids):
    resp = client.post(
        "/cart/remove",
        json={"variant_id": variant_ids[0], "session_id": "no-such-cart"},
    )
    assert resp.status_code == 404
