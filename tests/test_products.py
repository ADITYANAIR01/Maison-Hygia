def test_list_products_returns_all(client):
    resp = client.get("/api/v1/products/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 16
    assert len(data["items"]) == 16


def test_total_is_true_count_before_pagination(client):
    resp = client.get("/api/v1/products/?limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 16
    assert len(data["items"]) == 5
    assert data["skip"] == 0
    assert data["limit"] == 5


def test_search_filters_products(client):
    resp = client.get("/api/v1/products/?search=serum")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert all(
        "serum" in p["name"].lower() or "serum" in (p["description"] or "").lower()
        for p in data["items"]
    )


def test_search_no_match_returns_empty(client):
    resp = client.get("/api/v1/products/?search=zzznomatch")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_retrieve_product(client):
    resp = client.get("/api/v1/products/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"]
    assert data["variants"][0]["price"]
