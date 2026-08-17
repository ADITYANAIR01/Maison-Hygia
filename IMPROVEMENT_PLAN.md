# Maison Hygia — Improvement Plan (from Codebase Evaluation)

> Generated: Aug 17, 2026. Working list for the next session. Each item references `file_path:line_number`.
> Context: the cloned React bundle runs on hard-coded data + Supabase; only the custom search feature in `index.html` talks to the FastAPI backend.
>
> **Status: all items addressed (fixed or documented-as-decided) — Aug 17, 2026.**

---

## P0 — Functional bugs (fix first)

- [x] **1. Add-to-bag sessions never persist**
  - `addToBag` sends the localStorage id from `getBagSessionId()` (`Website/index.html:542-551,557-565`), but the backend only reuses a cart if that exact `session_id` exists; otherwise it mints a **new** UUID (`backend/routes.py:151-168`) and returns it. The frontend ignores the returned `session_id`, so the second add creates *another* cart.
  - Fix: frontend must store the server-returned id, OR backend should adopt the client-supplied id for new carts.
  - **Fixed:** backend now reuses the client-supplied `session_id` for new carts (UUID only minted as a fallback when no id is sent), and `addToBag` writes the server-returned `session_id` back to `localStorage` (`mh_bag_session`).

- [x] **2. `GET /cart/` without `session_id` returns HTTP 500**
  - `routes.py:113-118` selects all carts then calls `scalar_one_or_none()` (`routes.py:118`), raising `MultipleResultsFound` once >1 cart exists. Public unauthenticated endpoint.
  - **Fixed:** no-session requests short-circuit to the empty cart payload `{"items": [], "total": 0, "total_quantity": 0}` without querying.

- [x] **3. Stripe webhook can never mark a cart paid (two stacked defects)**
  - Checkout session created without `metadata={"session_id": ...}` (`routes.py:296-302`), but webhook reads `session.get("metadata", {}).get("session_id")` (`routes.py:330`) → always `None`.
  - Even if found, `routes.py:334-335` sets `cart.payment_status = "paid"` / `cart.status = "paid"` but the `Cart` model has **no such columns** (`models.py:124-142`) — assignments silently discarded.
  - **Fixed:** `metadata={"session_id": ...}` is passed to `stripe.checkout.Session.create`; `Cart` gained `payment_status` and `status` columns; startup runs an idempotent `ALTER TABLE` migration for existing SQLite dev DBs (checks `PRAGMA table_info(carts)`, adds missing columns with defaults `'unpaid'`/`'open'` — see `backend/database.py:ensure_schema`). No heavyweight migration framework added.

- [x] **4. Stripe redirect URLs point at a dead port/routes**
  - `routes.py:300-301` hardcode `http://localhost:8023/cart/success` and `/cart/cancel`. Port 8023 appears nowhere else; neither route is registered. Frontend runs on 8000 (dev + Docker).
  - **Fixed:** redirect URLs are built from `FRONTEND_URL` (env, default `http://localhost:8000`) and point at `/cart/success?session_id={CHECKOUT_SESSION_ID}` and `/cart/cancel`. Combined with the SPA fallback (#8), those URLs load the app.

---

## P1 — Contract / architecture mismatches

- [x] **5. Cloned bundle never uses the backend**
  - `Website/assets/index-DLFkKnAo.js` has no `/api/v1`, `/cart`, or `/payment` refs. Data layer = hard-coded catalog + Supabase project `cowggxamybvlpkgoyfve` (publishable key `sb_publishable_833-mh1RnbYB8mrbfMeagA_aR6C_kf1`), tables `products`, `orders`, `customer_profiles`, `newsletter_subscribers`, `job_applications`, `user_roles`, RPC `has_paid_order`. Bundle checkout writes `orders` with `status:'pending'`, requires Supabase auth, no Stripe.
  - Decision needed: integrate backend into bundle, or accept backend is only for the search feature.
  - **Decided (documented in README):** keep the compiled React bundle as-is. The backend is the data source for the custom search / cart / payment feature added in `index.html`. Full bundle migration (replacing hard-coded catalog + Supabase with the FastAPI backend) is explicitly **out of scope** — the bundle is minified and wired to a live Supabase project; rewiring it would require the Supabase/Stripe production story to be defined first.

- [x] **6. Two product catalogs with conflicting prices**
  - Bundle: Face Serum `$62`, Body Wash `$32`, Body Lotion `$36`, Shampoo `$28`. Seeder (`seed_products.py:22,50,84,131`): `52.00`, `22.00`, `32.00`, `28.00`. Search feature surfaces different names/prices than shop pages.
  - **Fixed:** seeder prices reconciled to the bundle values (verified by grepping `Website/assets/index-DLFkKnAo.js`): Face Serum → `62.00`, Body Wash → `32.00`, Body Lotion → `36.00`, Shampoo → `28.00`. The upsert in #7 applies these on re-seed.

- [x] **7. `seed_products.py` fails on fresh DB**
  - Queries `products` before tables exist (tables only created by backend startup, `backend/main.py:17-20`). Verified: `OperationalError: no such table: products`. Skip logic (`seed_products.py:150-155`) never reconciles stale rows — leftover `MH-001 Ayurvedic Face Oil` persists with broken image.
  - Fix: run backend once first, OR add `Base.metadata.create_all` to the seeder.
  - **Fixed:** `seed()` calls `Base.metadata.create_all(bind=engine)` first, and the skip logic is now a **reconcile/upsert by slug** — it updates name, description, price, and inventory so stale rows get fixed instead of skipped.

- [x] **8. SPA deep links 404 + port collisions**
  - `serve_frontend.py:57-67` has no `index.html` fallback → `/shop`, `/botanical-beauty`, `/ritual-nutrition`, `/story`, `/contact`, `/careers/apply/:jobId`, `/account`, `/admin`, `/auth`, etc. 404 on refresh/direct open.
  - `run_backend.py:8` and `serve_frontend.py:76` both default to port 8000. Use backend=8001 / frontend=8000 (Dockerfile convention).
  - **Fixed:** `serve_frontend.py` serves `index.html` for extensionless paths that don't exist on disk (proxy prefixes still proxy); `run_backend.py` defaults to 8001.

- [x] **9. "Face Serum" search shows broken image**
  - Seeder slug `MH_Face_Serum` (`seed_products.py:82`) but only file on disk is `Website/assets/MH_Face_Serem-2.png` (typo, matching original bundle). `imageCandidates()` (`index.html:508-512`) tries `/assets/MH_Face_Serum.png|−2|−3` → all 404.
  - **Fixed:** asset renamed via `git mv` `Website/assets/MH_Face_Serem-2.png` → `Website/assets/MH_Face_Serum-2.png` so `imageCandidates` picks it up. Verified reachable over HTTP (200 image/png).

---

## P2 — Build / packaging

- [x] **10. `pyproject.toml` cannot build** (verified with `pip install --dry-run`)
  - `pyproject.toml:12-19` — `[project.dependencies]` is a TOML table; PEP 621 requires an **array of strings**. Error: `project.dependencies must be array`.
  - `pyproject.toml:10` — `type = "application"` is not a valid `[project]` key.
  - Docker/CI install from `requirements.txt`, so only breaks `pip install .` / `pip install -e .`.
  - **Fixed:** `dependencies` is now an array of strings and `type = "application"` removed. Also scoped setuptools package discovery to `backend*` (flat-layout auto-discovery refused to build because `Website/` and `backend/` are both top-level). Verified: `pip install -e .` succeeds.

- [x] **11. Dockerfile ignores pinned `requirements.txt`**
  - `Dockerfile:6-10` copies only `pyproject.toml`, then `pip install`s latest unpinned versions and rewrites `/app/requirements.txt` via `pip freeze` — runtime differs from CI-verified pins.
  - **Fixed:** Dockerfile now `COPY requirements.txt ./` + `RUN pip install --no-cache-dir -r requirements.txt`; keeps the two-EXPOSE convention (8000/8001) and a single default `CMD` (uvicorn on 8001).

- [x] **12. docker-compose builds the same image twice, never seeds**
  - Both services (`docker-compose.yml:4-15,17-28`) use the same `Dockerfile` whose `CMD` (`Dockerfile:26`) runs **both** uvicorn (8001) and `serve_frontend.py` (8000) in every container — each container runs a redundant copy of the other service.
  - No seed step: fresh checkout has empty catalog until hand-seeded. Bind-mount `./backend:/app/backend` (`docker-compose.yml:15`) masks this only when host DB exists.
  - **Fixed:** each service overrides `command` to run only its own process (`backend` → uvicorn on 8001, `frontend` → `serve_frontend.py 8000` with `BACKEND_URL=http://backend:8001`). A dedicated one-shot `seed` service (`python seed_products.py`, `restart: "no"`, `depends_on: backend`, sharing the `./backend` mount) seeds after the backend creates tables.

- [x] **13. Placeholder Stripe secrets**
  - `routes.py:13` (`sk_test_placeholder`), `routes.py:316` (`whsec_placeholder`), `docker-compose.yml:12-13`. Webhook flow broken anyway (see #3).
  - **Fixed:** no placeholders remain. `routes.py` reads `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` from the environment only; missing keys fail fast with HTTP 503 on checkout/webhook. `docker-compose.yml` uses `${STRIPE_SECRET_KEY:-}` / `${STRIPE_WEBHOOK_SECRET:-}` substitution. Documented in README and `.env.example`.

---

## P3 — Dead code / CI nits

- [x] **14. Dead config in `backend/config.py`**
  - `API_V1_STR` (`:14`), `ALLOWED_ORIGINS` (`:18`, no `CORSMiddleware` exists anywhere), `SECRET_KEY`/`ALGORITHM`/`ACCESS_TOKEN_EXPIRE_MINUTES` (`:21-23`), `get_db()` (`:26-34`, unused; duplicated by `routes.py:16-21`). Only `DATABASE_URL` (`database.py:4`) is consumed.
  - **Fixed:** removed `API_V1_STR`, `PROJECT_NAME`, `SECRET_KEY`/`ALGORITHM`/`ACCESS_TOKEN_EXPIRE_MINUTES`, and the dead `get_db()`. Kept `DATABASE_URL`, `BASE_DIR`, added `FRONTEND_URL`, and wired `ALLOWED_ORIGINS` into a real `CORSMiddleware` in `main.py` (default `http://localhost:8000,http://localhost:8001`, overridable via env).

- [x] **15. `.gitignore` whitelists `.env.example`** but no such file exists (``.gitignore:21`).
  - **Fixed:** created a real `.env.example` at the repo root documenting `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BACKEND_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS` with blank/safe values.

- [x] **16. CI `security` job is a no-op**
  - Only `pip install safety` (`ci.yml:58`), deps never installed; `safety check --full-report` (`ci.yml:61`) scans just safety/pip; `|| true` never gates.
  - Test job guard (`ci.yml:24`) would fail with "no tests collected" if an empty `tests/` dir is added.
  - **Fixed:** security job installs `requirements.txt` first, runs `safety check -r requirements.txt --full-report`, and the `|| true` was dropped so it actually gates. A real `tests/` directory now exists, so the test job's `-d tests` branch runs pytest for real.

- [x] **17. `.ruff_cache/` not covered by repo `.gitignore`** (only hidden by ruff's internal `.gitignore`).
  - **Fixed:** added `.ruff_cache/` to `.gitignore`.

- [x] **18. Minor**
  - `backend/main.py:17-20` uses deprecated `@app.on_event("startup")` (use lifespan).
  - `list_products` reports `total` as page size (`routes.py:65`) rather than true match count — misleading for pagination.
  - **Fixed:** replaced `@app.on_event("startup")` with a FastAPI lifespan context manager (`create_all` + dev migrations inside lifespan); `list_products` now runs a separate `COUNT` query so `total` is the true match count before pagination.

---

## Recommended next-session order

1. P0 #1–#4 (cart persistence, 500 on empty query, Stripe metadata + model columns, redirect URLs)
2. P2 #10–#13 (buildable pyproject, Dockerfile uses pins, compose fix, secrets via env)
3. P1 #7–#9 (seeder on fresh DB, broken serum image, deep-link fallback)
4. P3 #14–#18 (dead config, gitignore, CI cleanup)

## Notes / context
- Current repo state: backend, Docker, CI, scripts, `.gitignore`, `.env.example`, and `tests/` are committed/ready. `clone_maison_hygia.py` was removed entirely in the "Add FastAPI backend" commit.
- README, FEATURES.md, and IMPROVEMENT_PLAN.md describe the fixed state.
- Dev run convention: `python run_backend.py 8001` + `python serve_frontend.py 8000`, open `http://localhost:8000`.