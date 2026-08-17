# Maison Hygia

A hybrid project pairing a statically-served clone of the [maisonhygia.com](https://maisonhygia.com) site (React/Vite bundle + a custom search feature) with a custom FastAPI backend for products, carts, and Stripe checkout.

---

## Overview

This repository contains two distinct halves that share one repo:

- **Frontend** (`Website/`): A static clone of the Maison Hygia site. It consists of a single `index.html` (with inline Tailwind CSS and a custom search / "add to bag" feature) plus a minified React bundle (`Website/assets/index-DLFkKnAo.js`). **The cloned React bundle does not talk to the FastAPI backend** — it runs on hard-coded catalogs and a live Supabase project. Only the custom search feature added on top of the clone calls the backend API.
- **Backend** (`backend/`): A FastAPI application (SQLAlchemy + SQLite by default, PostgreSQL supported) exposing product, cart, and Stripe payment endpoints, plus the scripts to run, seed, and containerize it.

The two halves are wired together by the search feature: `Website/index.html` calls `GET /api/v1/products/`, `GET /api/v1/products/{id}`, and `POST /cart/add` through a development proxy.

> **Product decision (documented):** the compiled React bundle is left as-is. The FastAPI backend is the data source for the custom search / cart / payment feature in `index.html`. A full migration of the bundle (replacing its hard-coded catalog and Supabase integration with the backend) is explicitly **out of scope** — the bundle is minified and wired to a live Supabase project, so rewiring it would require the production data/Stripe story to be defined first.

> See [FEATURES.md](FEATURES.md) for a detailed breakdown of what works, what is partial, and what is broken.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React/Vite (cloned, minified bundle), Tailwind CSS (inline, single-file `index.html`), Supabase (in the cloned bundle) |
| Backend | Python 3.10+, FastAPI, SQLAlchemy 2.0, Pydantic |
| Database | SQLite (default), PostgreSQL (via `DATABASE_URL`) |
| Payments | Stripe (checkout session + webhook) |
| Deployment | Docker, docker-compose, GitHub Actions CI |
| Dev tooling | uvicorn, ruff, black, pytest |

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
│   ├── main.py                     # FastAPI app (lifespan: creates tables + dev migrations, CORS)
│   ├── config.py                   # Settings (DATABASE_URL, FRONTEND_URL, CORS origins)
│   ├── database.py                 # SQLAlchemy engine / session / ensure_schema
│   ├── models.py                   # ORM: Product, Variant, Inventory, Cart, CartItem, Tag
│   └── routes.py                   # Endpoints: products, cart, payment (Stripe)
├── run_backend.py                  # uvicorn launcher for the backend (default port 8001)
├── serve_frontend.py               # Static file server + proxy of /api, /cart, /payment + SPA fallback
├── seed_products.py                # Seeds 16 products (MH-002..MH-017); upserts by slug; works on a fresh DB
├── tests/                          # pytest suite (TestClient + mocked Stripe)
├── requirements.txt                # Pinned dependencies (incl. dev: pytest, ruff, black)
├── pyproject.toml                  # Project metadata (PEP 621) + ruff/black config
├── Dockerfile                      # Python 3.14-slim image; installs pinned requirements; EXPOSE 8000 8001
├── docker-compose.yml              # backend + frontend + seed services (see Running with Docker)
├── .github/workflows/ci.yml        # CI: test, lint, security (safety now gates)
├── .env.example                    # Documented environment variables (copy to .env)
├── .gitignore                      # Python, *.db, .env, .ruff_cache/, .DS_Store, logs
├── Maison_Hygia_Fellowship_Case_Study_Challenge_Branded.md  # Fellowship case-study brief
└── IMPROVEMENT_PLAN.md             # Prioritized list of known bugs/fixes (P0–P3), all addressed
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

The database file and tables are created automatically on backend startup (including lightweight dev migrations for existing SQLite databases).

```bash
python run_backend.py 8001
```

The backend runs at `http://0.0.0.0:8001` (default port is 8001).

### 3. Start the frontend + proxy

```bash
python serve_frontend.py 8000
```

This serves the `Website/` directory and proxies requests under `/api/`, `/cart`, and `/payment` to `BACKEND_URL` (default `http://127.0.0.1:8001`). Extensionless paths that don't exist on disk (e.g. `/shop`) fall back to `index.html`, so SPA deep links work on refresh/direct open.

### 4. Open the site

Open [http://localhost:8000](http://localhost:8000) in your browser.

> The port split matters: backend on **8001**, frontend on **8000**.

### 5. Seed the product catalog (optional)

The database starts empty. The seeder creates its own tables, so it works on a fresh database even before the backend has run:

```bash
python seed_products.py
```

The seeder inserts the 16 products (MH-002 through MH-017) and **upserts by slug** on re-runs — existing rows are updated (name, description, price, inventory) instead of skipped, so stale prices never linger.

## Configuration

All configuration is read from environment variables. Copy [`.env.example`](.env.example) to `.env` and fill in real values; safe defaults are used otherwise.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite:///<backend>/database.db` | SQLAlchemy database URL. Use a PostgreSQL URL in production. |
| `BACKEND_URL` | `http://127.0.0.1:8001` | Base URL that `serve_frontend.py` proxies `/api`, `/cart`, `/payment` to. |
| `FRONTEND_URL` | `http://localhost:8000` | Base URL used by the backend to build Stripe checkout redirects (`/cart/success`, `/cart/cancel`). |
| `STRIPE_SECRET_KEY` | *(unset)* | Stripe API secret key. No placeholder is committed. If unset, `POST /payment/create-checkout-session` fails fast with HTTP 503. |
| `STRIPE_WEBHOOK_SECRET` | *(unset)* | Stripe webhook signing secret. No placeholder is committed. If unset, `POST /payment/webhook` fails fast with HTTP 503. |
| `ALLOWED_ORIGINS` | `http://localhost:8000,http://localhost:8001` | Comma-separated CORS origins allowed by the backend's `CORSMiddleware`. |

## API Reference

Base path for products: `/api/v1/products`. Cart and payment endpoints are prefixed with `/cart` and `/payment`.

| Method | Path | Params | Purpose |
|--------|------|--------|---------|
| `GET` | `/` | — | Health check: `{"message": "Maison Hygia API is running", ...}` |
| `GET` | `/api/v1/products/` | `skip` (int, default 0), `limit` (int, default 50), `search` (str, optional) | List active products with pagination; `search` filters name/description (case-insensitive). `total` is the true match count before pagination. |
| `GET` | `/api/v1/products/{product_id}` | `product_id` (int, path) | Retrieve a single active product with its variants and inventory. 404 if missing or inactive. |
| `GET` | `/cart/` | `session_id` (str, query, optional) | View cart items for a session. Returns the empty payload `{"items": [], "total": 0, "total_quantity": 0}` when no/unknown `session_id` is given. |
| `POST` | `/cart/add` | JSON body: `variant_id` (int), `quantity` (int, default 1), `session_id` (str) | Add a variant to the cart. Reuses the client-supplied `session_id` for new carts (no new UUID minting), so repeated adds persist to one cart. Validates variant and inventory. |
| `POST` | `/cart/remove` | JSON body: `variant_id` (int), `session_id` (str) | Remove a variant from the cart. |
| `POST` | `/payment/create-checkout-session` | JSON body: `session_id` (str) | Create a Stripe Checkout session for the cart's line items. Passes `metadata={"session_id": ...}` and `FRONTEND_URL`-based success/cancel URLs. Returns `checkout_url`. 503 if `STRIPE_SECRET_KEY` is unset. |
| `POST` | `/payment/webhook` | Stripe-signed payload in body, `stripe-signature` header | Handle Stripe webhook events (`checkout.session.completed`); marks the matching cart `payment_status="paid"` / `status="paid"`. 503 if `STRIPE_WEBHOOK_SECRET` is unset. |

## Running with Docker

Build and start the backend, frontend, and one-shot seed service:

```bash
docker-compose up --build
```

- Frontend: [http://localhost:8000](http://localhost:8000)
- Backend: [http://localhost:8001](http://localhost:8001)

Each service runs only its own process:

- `backend` → `uvicorn backend.main:app --host 0.0.0.0 --port 8001`
- `frontend` → `python serve_frontend.py 8000` (with `BACKEND_URL=http://backend:8001`)
- `seed` → `python seed_products.py` (one-shot, `restart: "no"`, runs after the backend has created tables)

Stripe secrets are passed through env substitution (`${STRIPE_SECRET_KEY:-}`, `${STRIPE_WEBHOOK_SECRET:-}`) — export them in your shell or `.env` before `docker-compose up`; there are no placeholder secrets in the repo.

## Testing & Linting

```bash
# Tests
python -m pytest

# Lint
ruff check backend/

# Format check
black --check backend/
```

The `tests/` suite uses `fastapi.testclient.TestClient` with a throwaway SQLite database (set via `DATABASE_URL` in `tests/conftest.py` before importing the backend) and monkeypatched Stripe calls — it never touches the dev database. Coverage includes product listing/search/pagination, cart persistence (same-session adds create one cart), cart removal, checkout-session metadata/redirect URLs, the webhook paid flow, and seed reconciliation (fresh DB + re-run upsert).

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push/PR to `main`/`master` and has three jobs:

1. **test** — installs dependencies; runs `pytest` (a real `tests/` directory exists, so it always runs).
2. **lint** — runs `ruff check backend/` and `black --check backend/`.
3. **security** — installs `requirements.txt` and `safety`, then runs `safety check -r requirements.txt --full-report` (no `|| true` — it gates the build).

## Known Limitations

Documented accurately from the current codebase:

- **The cloned React bundle never calls the FastAPI backend.** It uses hard-coded catalogs and a live Supabase project (publishable key embedded in the bundle). Only the custom search feature in `index.html` talks to the backend. This is a **documented product decision** (see Overview); full bundle migration is out of scope.
- **Search-feature product names differ from the shop pages.** The seeder's names are prefixed "Ayurvedic ..." while the bundle shows e.g. "Face Serum". Prices now match the bundle, but the names and images used by the custom search feature are the backend's data, not the bundle's.
- **Stripe requires real keys.** Checkout/webhook return HTTP 503 until `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are set (no placeholders).
- **The docker-compose `backend` service bind-mounts `./backend`** — the SQLite file used in containers lives on the host at `./backend/database.db`. This is intentional for local dev and is gitignored.
- **No production database migration tool.** Dev SQLite databases get lightweight idempotent column migrations at startup; production should use a real migration framework (e.g. Alembic) before shipping.

## Contributing / Roadmap

See [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) for the prioritized list of known bugs and fixes (P0 functional bugs, P1 contract/architecture mismatches, P2 build/packaging, P3 dead code/CI nits). Feature-level status is tracked in [FEATURES.md](FEATURES.md).

## License

No license specified.