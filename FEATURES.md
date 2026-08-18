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
- **Add to bag** — posts to `POST /cart/add`. The backend reuses the client-supplied `session_id` (no new UUID minted), and the frontend writes the server-returned id to `localStorage` (`mh_bag_session`), so repeated adds persist to one cart.

### Custom Admin Panel (added on top of the clone, in `Website/index.html`)

A first-party admin products page that replaces the static clone shell on `/admin-products` with the repo's own FastAPI admin API:

- **Route takeover** — when the SPA navigates to `/admin-products`, a custom full-screen panel (`#mh-admin-products`) loads and renders an admin product manager (topbar, stats cards, searchable product table, orders view)
- **Products view** — lists all products (active + inactive) from `GET /api/v1/admin/products`, with per-row edit/delete actions
- **Create/Edit modal** — multipart form (`#mh-admin-modal`) with name, SKU, slug, description, optional image upload, and a dynamic variant list (name, SKU, price, compare-at, stock); saved via `POST /api/v1/admin/products` or `PUT /api/v1/admin/products/{id}`
- **Delete confirmation** — `#mh-admin-delete-modal` then `DELETE /api/v1/admin/products/{id}`
- **Orders view** — reads carts/orders from `GET /api/v1/admin/orders`
- **Toasts** — success/error feedback via `#mh-toast-container`
- **Auth** — reads the Supabase access token from `localStorage` (`sb-*-auth-token`) and sends it as `Authorization: Bearer`; a friendly "Admin access required" state is shown when the API returns 401/403

### Backend API (`backend/`)

FastAPI application (SQLAlchemy + SQLite by default) exposing four routers:

- **Products** — list/search (`GET /api/v1/products/`, `routes.py`) and detail (`GET /api/v1/products/{product_id}`, `routes.py`)
- **Admin** (`/api/v1/admin`, `routes.py`) — role-gated via Supabase `user_roles` (`auth.py`):
  - `GET /products` / `GET /products/{id}` — full catalog incl. inactive
  - `POST /products` (multipart form + variants JSON + optional image upload) / `PUT /products/{id}` / `DELETE /products/{id}`
  - `POST /variants`, `PUT /variants/{id}`, `DELETE /variants/{id}`, `PUT /variants/{id}/inventory`
  - `GET /orders`, `GET /stats`
- **Cart** — view (`GET /cart/`), add (`POST /cart/add`), remove (`POST /cart/remove`)
- **Payment** — Stripe checkout session creation (`POST /payment/create-checkout-session`) and webhook (`POST /payment/webhook`)

ORM models in `backend/models.py`: `Product`, `Variant`, `Inventory`, `Cart`, `CartItem`, `Tag` (products router only). Tables are created automatically on backend startup (`backend/main.py`).

### Deployment

- **Dockerfile** — Python 3.14-slim image; installs pinned `requirements.txt`; copies `backend/`, `Website/`, `serve_frontend.py`, and `seed_products.py`; exposes ports 8000 (frontend) and 8001 (backend); default `CMD` runs uvicorn on 8001 (docker-compose overrides per service)
- **docker-compose.yml** — `backend`, `frontend`, and one-shot `seed` services, each running one process (see Feature Status)
- **CI pipeline** (`.github/workflows/ci.yml`) — three jobs: test (runs the real pytest suite), lint (`ruff check` + `black --check` on `backend/`), security (`safety check -r requirements.txt`, gating)

---

## Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Site clone (marketing pages, shop, collections, story, contact, careers, account, admin) | Working | From the cloned React bundle; hard-coded content + Supabase. Unchanged by this work (documented decision). |
| Mobile-responsive layout & fonts | Working | From the cloned site |
| Live search suggestions | Working | Custom feature; calls `GET /api/v1/products/?search=` |
| Product detail view (search feature) | Working | Calls `GET /api/v1/products/{id}` |
| Add to bag (search feature) | Working | Sessions persist: backend adopts the client-supplied `session_id` for new carts, and the frontend stores the server-returned id to `localStorage` (`mh_bag_session`), so repeated adds reuse one cart |
| Cart view (`GET /cart/`) | Working | Returns the empty payload `{"items": [], "total": 0, "total_quantity": 0}` without a `session_id` — no HTTP 500 |
| Product list/search/detail API | Working | `routes.py`; `total` is the true match count before pagination now |
| Admin products panel | Working | Custom, FastAPI-backed overlay on `/admin-products`: product list, create/edit modal, delete confirmation, image upload, variants, toasts. Auth via Supabase token from `localStorage` (`auth.py`) |
| Admin API (`/api/v1/admin`) | Working | Role-gated product/variant/inventory CRUD, orders list, stats. Form-data product create/update; JSON variants; optional image upload to `Website/assets/` |
| Dev proxy error forwarding | Working | `cli.py serve` forwards backend status codes + bodies (401/403/422) instead of a blanket 502 |
| Stripe checkout session creation | Working | Reads `STRIPE_SECRET_KEY` from env only (503 if unset); passes `metadata={"session_id": ...}`; redirect URLs built from `FRONTEND_URL` to `/cart/success?session_id={CHECKOUT_SESSION_ID}` and `/cart/cancel`. Requires a real `STRIPE_SECRET_KEY` to operate end-to-end |
| Stripe webhook | Working | `metadata.session_id` is passed on the checkout session; `Cart.payment_status`/`status` columns added via idempotent dev migration (`ensure_schema`); marks the matching cart paid. Requires `STRIPE_WEBHOOK_SECRET` |
| Catalog seeding (`seed_products.py`) | Working | Runs `create_all` itself (works on a fresh DB before the backend has started); upserts by slug on re-runs |
| SPA deep links (`/shop`, etc.) | Working | `index.html` fallback in `serve_frontend.py` for extensionless paths that don't exist on disk |
| Docker / docker-compose | Working | One process per container (`backend` on 8001, `frontend` on 8000, one-shot `seed`), pinned requirements in the image |
| CI pipeline (lint / test / security) | Working | Real `tests/` suite runs in the test job; security job installs `requirements.txt` and gates with `safety check -r requirements.txt --full-report` |

Note: the cloned React bundle still uses its own localStorage cart and Supabase checkout flow — that is unchanged, per the documented product decision.

---

## Recently Fixed

All items from [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) (#1-#18) are addressed. Grouped by priority:

### P0 — Functional bugs (fixed)
- Add-to-bag sessions now persist: backend reuses the client-supplied `session_id`; frontend stores the returned id (`routes.py`, `index.html`)
- `GET /cart/` without `session_id` returns the empty payload instead of HTTP 500 (`routes.py`)
- Stripe webhook can mark carts paid: `metadata.session_id` passed on the checkout session; `Cart.payment_status`/`status` columns added (`routes.py`, `models.py`)
- Stripe redirect URLs built from `FRONTEND_URL` to `/cart/success|cancel` instead of dead `localhost:8023` (`routes.py`)

### P1 — Contract / architecture (fixed)
- Seed catalog prices reconciled to the bundle (`62.00`/`32.00`/`36.00`/`28.00` in `seed_products.py`)
- `seed_products.py` runs `create_all` itself and upserts by slug, so it works on a fresh DB and fixes stale rows
- SPA deep links fall back to `index.html` in `serve_frontend.py`; `run_backend.py` defaults to port 8001
- "Face Serum" image fixed via `git mv` of `MH_Face_Serem-2.png` -> `MH_Face_Serum-2.png`

### P2 — Build / packaging (fixed)
- `pyproject.toml` builds (dependencies as PEP 621 array, `type = "application"` removed, package discovery scoped to `backend*`)
- Dockerfile installs pinned `requirements.txt` and copies `seed_products.py`
- docker-compose runs one process per service plus a one-shot `seed` service; secrets via `${STRIPE_SECRET_KEY:-}` substitution
- Placeholder Stripe secrets removed; missing keys fail fast with HTTP 503 (`.env.example` documents the vars)

### P3 — Dead code / CI nits (fixed)
- Dead config removed from `backend/config.py`; `ALLOWED_ORIGINS` wired into real CORS middleware in `main.py`
- Real `.env.example` added (`.gitignore` whitelist honored)
- CI security job installs deps and gates with `safety check -r requirements.txt --full-report`; test job runs the real suite
- `.ruff_cache/` (and `.pytest_cache/`) gitignored; `@app.on_event("startup")` replaced with lifespan; `total` is the true match count

---

## Roadmap Ideas (Proposed — Not Yet Implemented)

The items below are **aspirational suggestions only**. They are not in the codebase and are listed as candidate directions, not commitments.

- **Connect the cloned React bundle to the FastAPI backend** — replace hard-coded catalogs and the Supabase checkout flow with the repo's own API and Stripe integration so the frontend and backend share one data layer. **Still open / out of scope** by the documented product decision: the bundle is minified and wired to a live Supabase project, and full migration would require the production data/Stripe story to be defined first.
- **Order fulfillment** — persist orders server-side, update inventory on checkout, and reconcile via the Stripe webhook (the webhook currently only marks the cart paid).
- **Admin dashboard for orders** — manage orders from the API (the admin API already lists carts at `/api/v1/admin/orders`; order status updates and fulfillment controls are not yet exposed).
- **Newsletter signup** — replace/back the Supabase `newsletter_subscribers` flow with a first-party backend endpoint.
- **Rate limiting & auth hardening** — protect public endpoints (cart, checkout) from abuse.

Completed roadmap ideas (deep-link support, env-only Stripe keys, automated tests, one-process-per-container compose with seeding, price reconciliation) are captured under [Recently Fixed](#recently-fixed).