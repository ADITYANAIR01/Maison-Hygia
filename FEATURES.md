# Maison Hygia — Feature Overview

A factual, current-state inventory of what this project does today, what is partial or broken, and what is planned. This document only reflects what is verifiable in the codebase — nothing here is aspirational unless it is explicitly labeled as proposed.

> For bugs and fixes by priority, see [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md). For onboarding and run instructions, see [README.md](README.md).

---

## Current Features

### Frontend — Site Clone (`Website/`)

The static site is a clone of [maisonhygia.com](https://maisonhygia.com) delivered as a single `Website/index.html` (inline Tailwind CSS) plus a minified React bundle (`Website/assets/index-DLFkKnAo.js`, ~934 KB). These pages and behaviors come from the **cloned bundle**, not from this repo's backend:

- **Marketing pages**: home, shop, story, contact
- **Collections**: botanical beauty (`/botanical-beauty`), ritual nutrition (`/ritual-nutrition`)
- **Careers** (`/careers`, `/careers/apply/:jobId`)
- **Account** (`/account`), **auth** (`/auth`)
- **Admin area**: `/admin`, `/admin-products`, `/admin-applications` (role-gated via Supabase `user_roles`)
- **Mobile-responsive** layout and **custom fonts** (from the cloned site)
- **Cart & checkout in the bundle**: the bundle's cart stores items in `localStorage` (`mh_ritual_cart_v1`), applies signup/first-buyer discounts, and writes `orders` with `status: 'pending'` to a live Supabase project (project `cowggxamybvlpkgoyfve`, publishable key embedded in the bundle). It does **not** use the FastAPI backend and does **not** use Stripe.

### Custom Search Feature (added on top of the clone, in `Website/index.html`)

The one feature that talks to this repo's backend (through the dev proxy):

- **Live search suggestions** — queries `GET /api/v1/products/?search=...` against the FastAPI API and renders results (search panel CSS at ~lines 23–452, markup ~457–496, logic ~498–926)
- **Product detail view** — fetches `GET /api/v1/products/{id}` for a selected product
- **Add to bag** — posts to `POST /cart/add` (note: cart sessions do not persist across adds; see status table)

### Backend API (`backend/`)

FastAPI application (SQLAlchemy + SQLite by default) exposing three routers in `backend/routes.py`:

- **Products** — list/search (`GET /api/v1/products/`, `routes.py:28-65`) and detail (`GET /api/v1/products/{product_id}`, `routes.py:68-101`)
- **Cart** — view (`GET /cart/`, `routes.py:112-139`), add (`POST /cart/add`, `routes.py:142-208`), remove (`POST /cart/remove`, `routes.py:211-239`)
- **Payment** — Stripe checkout session creation (`POST /payment/create-checkout-session`, `routes.py:246-304`) and webhook (`POST /payment/webhook`, `routes.py:307-338`)

ORM models in `backend/models.py`: `Product`, `Variant`, `Inventory`, `Cart`, `CartItem`, `Tag` (products router only). Tables are created automatically on backend startup (`backend/main.py`).

### Deployment

- **Dockerfile** — Python 3.14-slim image; installs dependencies, copies `backend/`, `Website/`, and `serve_frontend.py`; exposes ports 8000 (frontend) and 8001 (backend); `CMD` runs uvicorn on 8001 plus `serve_frontend.py` on 8000
- **docker-compose.yml** — `backend` and `frontend` services, both built from the same Dockerfile (see Known limitations / P2 plan)
- **CI pipeline** (`.github/workflows/ci.yml`) — three jobs: test (conditional on tests existing), lint (`ruff check` + `black --check` on `backend/`), security (`safety`, non-blocking)

---

## Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Site clone (marketing pages, shop, collections, story, contact, careers, account, admin) | Working | From the cloned React bundle; hard-coded content + Supabase |
| Mobile-responsive layout & fonts | Working | From the cloned site |
| Live search suggestions | Working | Custom feature; calls `GET /api/v1/products/?search=` |
| Product detail view (search feature) | Working | Calls `GET /api/v1/products/{id}` |
| Add to bag (search feature) | Partial | Requests reach `POST /cart/add`, but cart sessions never persist across adds — the frontend ignores the server-returned `session_id` and the backend mints a new cart each time |
| Cart view (`GET /cart/`) | Buggy | Without `session_id` it can return HTTP 500 once more than one cart exists |
| Product list/search/detail API | Working | `routes.py:28-101`; `total` is reported as page size, not true match count |
| Stripe checkout session creation | Partial | Endpoint works, but keys are placeholders and redirect URLs point at `localhost:8023` (nothing serves it) |
| Stripe webhook | Not functional | Checkout session lacks `metadata.session_id`; `Cart` model has no `payment_status`/`status` columns, so carts can never be marked paid |
| Catalog seeding (`seed_products.py`) | Works after backend start | Fails on a fresh DB because tables are created by the backend startup event, not by the seeder |
| SPA deep links (`/shop`, etc.) | Broken | 404 under `serve_frontend.py` — no `index.html` fallback |
| Docker / docker-compose | Partial | Both services run both processes (redundant); no automated DB seeding in the image |
| CI pipeline (lint / test / security) | Working (with gaps) | Lint runs; test job skips when no tests exist; security job is a no-op (`safety` installed but project deps never installed; `\|\| true` never gates) |

---

## Planned Improvements

Summarized from [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) (the authoritative list, with file/line references). Grouped by priority:

### P0 — Functional bugs (fix first)
- Add-to-bag sessions never persist (frontend must store the server-returned `session_id`, or the backend should adopt the client-supplied id for new carts)
- `GET /cart/` without `session_id` returns HTTP 500 (fix the multiple-results query)
- Stripe webhook can never mark a cart paid (missing `metadata` on the checkout session **and** missing `status`/`payment_status` columns on `Cart`)
- Stripe redirect URLs point at dead port `localhost:8023` and unregistered routes

### P1 — Contract / architecture mismatches
- Cloned React bundle never uses the backend (decision needed: integrate the backend into the bundle, or accept the backend is only for the search feature)
- Two product catalogs with conflicting prices (bundle vs. seeded DB)
- `seed_products.py` fails on a fresh DB (run backend once first, or add `create_all` to the seeder)
- SPA deep links 404 and port defaults collide (backend 8001 / frontend 8000 convention)
- "Face Serum" search shows a broken image (seeder slug `MH_Face_Serum` vs. on-disk `MH_Face_Serem-2.png` typo)

### P2 — Build / packaging
- `pyproject.toml` cannot build (dependencies must be an array of strings per PEP 621)
- Dockerfile ignores pinned `requirements.txt` and installs unpinned versions
- docker-compose builds the same image twice, runs both processes in each container, and never seeds the DB
- Placeholder Stripe secrets (`sk_test_placeholder`, `whsec_placeholder`) in code and compose

### P3 — Dead code / CI nits
- Dead config in `backend/config.py` (`API_V1_STR`, `ALLOWED_ORIGINS` with no CORS middleware, security settings, unused `get_db()`)
- `.gitignore` whitelists `.env.example` but no such file exists
- CI `security` job is a no-op; test job would fail if an empty `tests/` dir is added
- `.ruff_cache/` not covered by repo `.gitignore`
- Minor: deprecated `@app.on_event("startup")`; `list_products` reports `total` as page size

---

## Roadmap Ideas (Proposed — Not Yet Implemented)

The items below are **aspirational suggestions only**. They are not in the codebase and are listed as candidate directions, not commitments.

- **Connect the cloned React bundle to the FastAPI backend** — replace hard-coded catalogs and the Supabase checkout flow with the repo's own API and Stripe integration so the frontend and backend share one data layer.
- **Single source of truth for the catalog and prices** — eliminate the two conflicting catalogs (bundle hard-coded vs. seeded DB) so search results and shop pages always agree.
- **Order fulfillment** — persist orders server-side, mark carts paid end-to-end, update inventory on checkout, and reconcile via the Stripe webhook.
- **Admin dashboard for orders** — manage products, inventory, and orders from the API instead of the current static admin shell.
- **Newsletter signup** — replace/back the Supabase `newsletter_subscribers` flow with a first-party backend endpoint.
- **Deep-link support** — add an `index.html` fallback in `serve_frontend.py` so `/shop`, `/account`, `/admin`, etc. survive refresh and direct navigation.
- **Rate limiting & auth hardening** — protect public endpoints (cart, checkout) from abuse.
- **Real Stripe keys in production** — move off the `sk_test_placeholder` / `whsec_placeholder` defaults via environment variables.
- **Automated tests** — add pytest coverage for products, cart, and payment routes; make the CI test job meaningful.
- **Fix the docker-compose layout** — one process per container (backend on 8001, frontend on 8000), plus a seeding step in the image.