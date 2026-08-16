# Maison Hygia

A hybrid project pairing a statically-served clone of the [maisonhygia.com](https://maisonhygia.com) site (React/Vite bundle + a custom search feature) with a custom FastAPI backend for products, carts, and Stripe checkout.

---

## Overview

This repository contains two distinct halves that share one repo:

- **Frontend** (`Website/`): A static clone of the Maison Hygia site. It consists of a single `index.html` (with inline Tailwind CSS and a custom search / "add to bag" feature) plus a minified React bundle (`Website/assets/index-DLFkKnAo.js`). **The cloned React bundle does not talk to the FastAPI backend** — it runs on hard-coded catalogs and a live Supabase project. Only the custom search feature added on top of the clone calls the backend API.
- **Backend** (`backend/`): A FastAPI application (SQLAlchemy + SQLite by default, PostgreSQL supported) exposing product, cart, and Stripe payment endpoints, plus the scripts to run, seed, and containerize it.

The two halves are wired together only by the search feature: `Website/index.html` calls `GET /api/v1/products/`, `GET /api/v1/products/{id}`, and `POST /cart/add` through a development proxy.

> See [FEATURES.md](FEATURES.md) for a detailed breakdown of what works, what is partial, and what is broken.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React/Vite (cloned, minified bundle), Tailwind CSS (inline, single-file `index.html`), Supabase (in the cloned bundle) |
| Backend | Python 3.10+, FastAPI, SQLAlchemy 2.0, Pydantic |
| Database | SQLite (default), PostgreSQL (via `DATABASE_URL`) |
| Payments | Stripe (checkout session + webhook) |
| Deployment | Docker, docker-compose, GitHub Actions CI |
| Dev tooling | uvicorn, ruff, black, pytest (no tests yet) |

## Repository Structure

```
Maison-Hygia/
├── Website/                        # Statically-served frontend
│   ├── index.html                  # Cloned site + custom search feature (single file, inline Tailwind)
│   └── assets/
│       ├── index-DLFkKnAo.js       # Minified React bundle (cloned; hard-coded catalog + Supabase)
│       └── *.png, *.jpg, *.css     # Site images and stylesheet
├── backend/                        # FastAPI backend
│   ├── __init__.py
│   ├── main.py                     # FastAPI app; creates DB tables on startup
│   ├── config.py                   # Settings (DATABASE_URL, CORS, security) — some dead config
│   ├── database.py                 # SQLAlchemy engine / session
│   ├── models.py                   # ORM: Product, Variant, Inventory, Cart, CartItem, Tag
│   └── routes.py                   # Endpoints: products, cart, payment (Stripe)
├── run_backend.py                  # uvicorn launcher for the backend (default port 8000; convention 8001)
├── serve_frontend.py               # Static file server + proxy of /api, /cart, /payment to the backend
├── seed_products.py                # Seeds 16 products (MH-002..MH-017) — run after backend starts once
├── requirements.txt                # Pinned dependencies (incl. dev: pytest, ruff, black)
├── pyproject.toml                  # Project metadata + ruff/black config
├── Dockerfile                      # Python 3.14-slim image (runs backend on 8001 + frontend on 8000)
├── docker-compose.yml              # backend + frontend services (see Known limitations)
├── .github/workflows/ci.yml        # CI: test, lint, security
├── .gitignore                      # Python, *.db, .env, .DS_Store, .vscode/, logs
├── Maison_Hygia_Fellowship_Case_Study_Challenge_Branded.md  # Fellowship case-study brief
└── IMPROVEMENT_PLAN.md             # Prioritized list of known bugs/fixes (P0–P3)
```

## Prerequisites

- Python 3.10 or newer (the project declares `requires-python = ">=3.10"`)
- `pip`
- Git (to clone)
- Optional: Docker / Docker Compose for containerized runs

## Getting Started (Run Locally)

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Start the backend first

The database file and tables are created automatically on backend startup.

```bash
python run_backend.py 8001
```

The backend runs at `http://0.0.0.0:8001`.

### 3. Start the frontend + proxy

```bash
python serve_frontend.py 8000
```

This serves the `Website/` directory and proxies requests under `/api/`, `/cart`, and `/payment` to `BACKEND_URL` (default `http://127.0.0.1:8001`).

### 4. Open the site

Open [http://localhost:8000](http://localhost:8000) in your browser.

> The port split matters: backend on **8001**, frontend on **8000**. Both scripts default to 8000, which collides — always pass the ports explicitly as shown above.

### 5. Seed the product catalog (optional)

The database starts empty. To populate it with the 16 seeded products (MH-002 through MH-017), run the seeder **after** the backend has started at least once (the backend creates the tables on startup; the seeder does not).

```bash
python seed_products.py
```

## Configuration

All configuration is read from environment variables. Defaults are safe for local development only.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite:///<backend>/database.db` | SQLAlchemy database URL. Use a PostgreSQL URL in production. |
| `BACKEND_URL` | `http://127.0.0.1:8001` | Base URL that `serve_frontend.py` proxies `/api`, `/cart`, `/payment` to. |
| `STRIPE_SECRET_KEY` | `sk_test_placeholder` | Stripe API secret key. Placeholder — set a real key via env. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_placeholder` | Stripe webhook signing secret. Placeholder — set a real secret via env. |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins. Currently unused — no `CORSMiddleware` is registered. |

## API Reference

Base path for products: `/api/v1/products`. Cart and payment endpoints are prefixed with `/cart` and `/payment`.

| Method | Path | Params | Purpose |
|--------|------|--------|---------|
| `GET` | `/` | — | Health check: `{"message": "Maison Hygia API is running", ...}` |
| `GET` | `/api/v1/products/` | `skip` (int, default 0), `limit` (int, default 50), `search` (str, optional) | List active products with pagination; `search` filters name/description (case-insensitive). |
| `GET` | `/api/v1/products/{product_id}` | `product_id` (int, path) | Retrieve a single active product with its variants and inventory. 404 if missing or inactive. |
| `GET` | `/cart/` | `session_id` (str, query, optional) | View cart items for a session. Without `session_id` it can return HTTP 500 once more than one cart exists (see Known limitations). |
| `POST` | `/cart/add` | JSON body: `variant_id` (int), `quantity` (int, default 1), `session_id` (str) | Add a variant to the cart. Creates a new cart (and session_id) if none matches; validates variant and inventory. |
| `POST` | `/cart/remove` | JSON body: `variant_id` (int), `session_id` (str) | Remove a variant from the cart. |
| `POST` | `/payment/create-checkout-session` | JSON body: `session_id` (str) | Create a Stripe Checkout session for the cart's line items. Returns `checkout_url`. |
| `POST` | `/payment/webhook` | Stripe-signed payload in body, `stripe-signature` header | Handle Stripe webhook events (`checkout.session.completed`). Currently cannot mark carts paid (see Known limitations). |

## Running with Docker

Build and start both services:

```bash
docker-compose up --build
```

- Frontend: [http://localhost:8000](http://localhost:8000)
- Backend: [http://localhost:8001](http://localhost:8001)

> **Compose limitations (honest note):** Both `backend` and `frontend` services are built from the same `Dockerfile`, whose `CMD` runs **both** the uvicorn backend (8001) and the frontend server (8000) in every container — so each container runs a redundant copy of the other service. The image also does not seed the database automatically, and the `backend` service bind-mounts `./backend` (which can mask the fresh-image DB with a host one). See `IMPROVEMENT_PLAN.md` (P2 items) for the planned fixes.

## Testing & Linting

```bash
# Lint
ruff check backend/

# Format check
black --check backend/

# Tests (none exist yet)
python -m pytest
```

There are **no automated tests yet**. The CI test job detects the absence of a `tests/` directory or `test_*.py` files and skips pytest with a message.

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push/PR to `main`/`master` and has three jobs:

1. **test** — installs dependencies; runs `pytest` only if tests exist (currently skipped).
2. **lint** — runs `ruff check backend/` and `black --check backend/`.
3. **security** — installs `safety` and runs `safety check --full-report`; non-blocking (`|| true`), and currently only scans the tools themselves because project dependencies are not installed in that job.

## Known Limitations

Documented accurately from the current codebase (do not assume these are fixed):

- **The cloned React bundle never calls the FastAPI backend.** It uses hard-coded catalogs and a live Supabase project (publishable key embedded in the bundle). Only the custom search feature in `index.html` talks to the backend.
- **Two product catalogs exist with conflicting prices** — the bundle's hard-coded catalog (e.g. Face Serum $62) vs. the seeded DB (Face Serum $52.00). Search results can show names/prices that differ from the shop pages.
- **Cart sessions don't persist across adds.** `POST /cart/add` mints a new UUID when the client-supplied `session_id` isn't reused, and the frontend ignores the returned `session_id`.
- **`GET /cart/` without `session_id` can return HTTP 500** once more than one cart exists (it selects all carts then expects one).
- **Stripe webhook cannot mark carts paid.** The checkout session is created without `metadata={"session_id": ...}`, and the `Cart` model has no `payment_status`/`status` columns — the webhook's assignment is silently discarded.
- **Stripe redirect URLs point at `http://localhost:8023`**, a port nothing serves; no success/cancel routes are registered there.
- **`seed_products.py` fails on a fresh database** unless the backend has been started once (tables are created by the backend startup event).
- **SPA deep links (e.g. `/shop`) return 404** under `serve_frontend.py` — there is no `index.html` fallback.
- **Port defaults collide** — both `run_backend.py` and `serve_frontend.py` default to 8000; the working convention is backend on 8001, frontend on 8000.
- **Stripe keys are placeholders** (`sk_test_placeholder`, `whsec_placeholder`) and must be provided via environment variables.
- **No automated tests exist yet.**
- **docker-compose** builds the same image for both services, runs both processes in each container (redundant), and does not seed the database automatically.

## Contributing / Roadmap

See [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) for the prioritized list of known bugs and fixes (P0 functional bugs, P1 contract/architecture mismatches, P2 build/packaging, P3 dead code/CI nits). Feature-level status is tracked in [FEATURES.md](FEATURES.md).

## License

No license specified.