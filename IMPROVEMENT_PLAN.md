# Maison Hygia — Improvement Plan (from Codebase Evaluation)

> Generated: Aug 17, 2026. Working list for the next session. Each item references `file_path:line_number`.
> Context: the cloned React bundle runs on hard-coded data + Supabase; only the custom search feature in `index.html` talks to the FastAPI backend.

---

## P0 — Functional bugs (fix first)

- [ ] **1. Add-to-bag sessions never persist**
  - `addToBag` sends the localStorage id from `getBagSessionId()` (`Website/index.html:542-551,557-565`), but the backend only reuses a cart if that exact `session_id` exists; otherwise it mints a **new** UUID (`backend/routes.py:151-168`) and returns it. The frontend ignores the returned `session_id`, so the second add creates *another* cart.
  - Fix: frontend must store the server-returned id, OR backend should adopt the client-supplied id for new carts.

- [ ] **2. `GET /cart/` without `session_id` returns HTTP 500**
  - `routes.py:113-118` selects all carts then calls `scalar_one_or_none()` (`routes.py:118`), raising `MultipleResultsFound` once >1 cart exists. Public unauthenticated endpoint.

- [ ] **3. Stripe webhook can never mark a cart paid (two stacked defects)**
  - Checkout session created without `metadata={"session_id": ...}` (`routes.py:296-302`), but webhook reads `session.get("metadata", {}).get("session_id")` (`routes.py:330`) → always `None`.
  - Even if found, `routes.py:334-335` sets `cart.payment_status = "paid"` / `cart.status = "paid"` but the `Cart` model has **no such columns** (`models.py:124-142`) — assignments silently discarded.

- [ ] **4. Stripe redirect URLs point at a dead port/routes**
  - `routes.py:300-301` hardcode `http://localhost:8023/cart/success` and `/cart/cancel`. Port 8023 appears nowhere else; neither route is registered. Frontend runs on 8000 (dev + Docker).

---

## P1 — Contract / architecture mismatches

- [ ] **5. Cloned bundle never uses the backend**
  - `Website/assets/index-DLFkKnAo.js` has no `/api/v1`, `/cart`, or `/payment` refs. Data layer = hard-coded catalog + Supabase project `cowggxamybvlpkgoyfve` (publishable key `sb_publishable_833-mh1RnbYB8mrbfMeagA_aR6C_kf1`), tables `products`, `orders`, `customer_profiles`, `newsletter_subscribers`, `job_applications`, `user_roles`, RPC `has_paid_order`. Bundle checkout writes `orders` with `status:'pending'`, requires Supabase auth, no Stripe.
  - Decision needed: integrate backend into bundle, or accept backend is only for the search feature.

- [ ] **6. Two product catalogs with conflicting prices**
  - Bundle: Face Serum `$62`, Body Wash `$32`, Body Lotion `$36`, Shampoo `$28`. Seeder (`seed_products.py:22,50,84,131`): `52.00`, `22.00`, `32.00`, `28.00`. Search feature surfaces different names/prices than shop pages.

- [ ] **7. `seed_products.py` fails on fresh DB**
  - Queries `products` before tables exist (tables only created by backend startup, `backend/main.py:17-20`). Verified: `OperationalError: no such table: products`. Skip logic (`seed_products.py:150-155`) never reconciles stale rows — leftover `MH-001 Ayurvedic Face Oil` persists with broken image.
  - Fix: run backend once first, OR add `Base.metadata.create_all` to the seeder.

- [ ] **8. SPA deep links 404 + port collisions**
  - `serve_frontend.py:57-67` has no `index.html` fallback → `/shop`, `/botanical-beauty`, `/ritual-nutrition`, `/story`, `/contact`, `/careers/apply/:jobId`, `/account`, `/admin`, `/auth`, etc. 404 on refresh/direct open.
  - `run_backend.py:8` and `serve_frontend.py:76` both default to port 8000. Use backend=8001 / frontend=8000 (Dockerfile convention).

- [ ] **9. "Face Serum" search shows broken image**
  - Seeder slug `MH_Face_Serum` (`seed_products.py:82`) but only file on disk is `Website/assets/MH_Face_Serem-2.png` (typo, matching original bundle). `imageCandidates()` (`index.html:508-512`) tries `/assets/MH_Face_Serum.png|−2|−3` → all 404.

---

## P2 — Build / packaging

- [ ] **10. `pyproject.toml` cannot build** (verified with `pip install --dry-run`)
  - `pyproject.toml:12-19` — `[project.dependencies]` is a TOML table; PEP 621 requires an **array of strings**. Error: `project.dependencies must be array`.
  - `pyproject.toml:10` — `type = "application"` is not a valid `[project]` key.
  - Docker/CI install from `requirements.txt`, so only breaks `pip install .` / `pip install -e .`.

- [ ] **11. Dockerfile ignores pinned `requirements.txt`**
  - `Dockerfile:6-10` copies only `pyproject.toml`, then `pip install`s latest unpinned versions and rewrites `/app/requirements.txt` via `pip freeze` — runtime differs from CI-verified pins.

- [ ] **12. docker-compose builds the same image twice, never seeds**
  - Both services (`docker-compose.yml:4-15,17-28`) use the same `Dockerfile` whose `CMD` (`Dockerfile:26`) runs **both** uvicorn (8001) and `serve_frontend.py` (8000) in every container — each container runs a redundant copy of the other service.
  - No seed step: fresh checkout has empty catalog until hand-seeded. Bind-mount `./backend:/app/backend` (`docker-compose.yml:15`) masks this only when host DB exists.

- [ ] **13. Placeholder Stripe secrets**
  - `routes.py:13` (`sk_test_placeholder`), `routes.py:316` (`whsec_placeholder`), `docker-compose.yml:12-13`. Webhook flow broken anyway (see #3).

---

## P3 — Dead code / CI nits

- [ ] **14. Dead config in `backend/config.py`**
  - `API_V1_STR` (`:14`), `ALLOWED_ORIGINS` (`:18`, no `CORSMiddleware` exists anywhere), `SECRET_KEY`/`ALGORITHM`/`ACCESS_TOKEN_EXPIRE_MINUTES` (`:21-23`), `get_db()` (`:26-34`, unused; duplicated by `routes.py:16-21`). Only `DATABASE_URL` (`database.py:4`) is consumed.

- [ ] **15. `.gitignore` whitelists `.env.example`** but no such file exists (``.gitignore:21`).

- [ ] **16. CI `security` job is a no-op**
  - Only `pip install safety` (`ci.yml:58`), deps never installed; `safety check --full-report` (`ci.yml:61`) scans just safety/pip; `|| true` never gates.
  - Test job guard (`ci.yml:24`) would fail with "no tests collected" if an empty `tests/` dir is added.

- [ ] **17. `.ruff_cache/` not covered by repo `.gitignore`** (only hidden by ruff's internal `.gitignore`).

- [ ] **18. Minor**
  - `backend/main.py:17-20` uses deprecated `@app.on_event("startup")` (use lifespan).
  - `list_products` reports `total` as page size (`routes.py:65`) rather than true match count — misleading for pagination.

---

## Recommended next-session order

1. P0 #1–#4 (cart persistence, 500 on empty query, Stripe metadata + model columns, redirect URLs)
2. P2 #10–#13 (buildable pyproject, Dockerfile uses pins, compose fix, secrets via env)
3. P1 #7–#9 (seeder on fresh DB, broken serum image, deep-link fallback)
4. P3 #14–#18 (dead config, gitignore, CI cleanup)

## Notes / context
- Current repo state: only the original clone is committed; backend/, Docker, CI, scripts, `.gitignore`, and the `index.html` search diff (900 insertions) are all untracked. `clone_maison_hygia.py` deleted in working tree but still in index.
- No README exists; the fellowship case-study brief is the only prose doc.
- Dev run convention: `python run_backend.py 8001` + `python serve_frontend.py 8000`, open `http://localhost:8000`.