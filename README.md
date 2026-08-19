# Maison Hygia

A hybrid project pairing a statically-served clone of the [maisonhygia.com](https://maisonhygia.com) site (React/Vite bundle + custom search/cart overlays) with a custom FastAPI backend for products, carts, Stripe checkout, and a Cognito-authenticated admin dashboard. The repo is **AWS-migration-ready**: Cognito auth, S3 presigned uploads, Alembic migrations, and a JSON admin API.

> **Status (August 19, 2026): AWS-migration-ready.** Code migration Phases 1–4 and CI/CD Phase 6 are complete; all ten migration-readiness gates (§15.2) pass locally. What remains is the manual AWS console infrastructure build (Phase 5), monitoring (Phase 7), and live validation (Phase 8) — see [Roadmap](#16-roadmap).

## Table of Contents

1. [Overview](#1-overview)
2. [Features & Status](#2-features--status)
3. [Tech Stack](#3-tech-stack)
4. [Target Architecture](#4-target-architecture)
5. [Repository Structure](#5-repository-structure)
6. [Getting Started (Local Dev)](#6-getting-started-local-dev)
7. [Testing & Linting](#7-testing--linting)
8. [API Reference](#8-api-reference)
9. [Authentication (Cognito)](#9-authentication-cognito)
10. [CI/CD Deployment](#10-cicd-deployment)
11. [Manual AWS Deployment Checklist (Phase 5)](#11-manual-aws-deployment-checklist-phase-5)
12. [Cost](#12-cost)
13. [Security](#13-security)
14. [Runbooks](#14-runbooks)
15. [Validation & Migration-Readiness Gates](#15-validation--migration-readiness-gates)
16. [Roadmap](#16-roadmap)
17. [Known Limitations](#17-known-limitations)
18. [Consolidated Documentation Note](#18-consolidated-documentation-note)

---

## 1. Overview

Three halves share one repo:

- **Customer site** (`Website/`): a static clone of the Maison Hygia site. It consists of a single `index.html` (inline CSS + custom search / cart / checkout-confirmation overlays) plus a minified React bundle (`Website/assets/index-DLFkKnAo.js`). A small shim in `index.html` intercepts the bundle's Supabase calls and returns empty responses, and checkout redirects land on a first-party `/checkout/success` confirmation view backed by the API.
- **Backend** (`backend/`): FastAPI application (SQLAlchemy, PostgreSQL) exposing product, cart, Stripe payment, order, and admin endpoints. Configured via pydantic-settings (`backend/config.py`); schema managed by Alembic; JSON structured logging; Cognito JWT auth for admin routes; S3 presigned uploads for product images.
- **Admin dashboard** (`admin-dashboard/`): a vanilla JS SPA (no build step) authenticated via Cognito Hosted UI (PKCE), wired to the backend's JSON admin API (KPIs, products, inventory, orders, users). No mock fallback — all pages read real API data.

> **Documented product decision:** the compiled React bundle is left as-is. Its hard-coded catalog and Supabase calls are neutralized by the shim in `index.html`, and the custom search/cart features on top of the clone talk to the FastAPI backend. A full rewrite of the bundle is out of scope.

### What changed in the AWS migration

- **Auth**: the Supabase JWKS path and its role table were replaced by Cognito JWKS verification (`custom:role` claim, no pre-token Lambda).
- **Admin API**: multipart-form product handlers removed; JSON product CRUD with variant sync and `image_url`; new `/dashboard/kpis`, `/dashboard/revenue`, `/orders/{id}`, `/orders/{id}/refund`, `/users`, `/users/{id}/role`, `/users/{id}` (enable/disable), `/inventory/bulk`, `/upload-url`.
- **Orders**: `Order` + `OrderItem` models; the Stripe webhook now creates the order and decrements inventory (was a TODO).
- **Images**: local `Website/assets/` saves replaced by S3 presigned uploads.
- **Website**: embedded `#mh-admin-*` panel removed (Supabase-token auth); Supabase shim added; checkout confirmation view added.
- **Admin dashboard**: Settings page removed; mock fallback disabled; relative asset paths; `api-base-url` meta tag.
- **Migrations**: Alembic initialized with a baseline revision; `AUTO_CREATE_SCHEMA` gates `create_all` in dev.
- **Ops**: JSON logging, `X-Request-Id` trace IDs, DB-checking `/health`, graceful shutdown, Cognito/S3 env vars in `.env.example`.

---

## 2. Features & Status

A factual, current-state inventory of what this project does today. Every row reflects what is verifiable in the codebase.

| Feature | Status | Notes |
|---------|--------|-------|
| Site clone (marketing pages, shop, collections, story, contact, careers, account, auth) | Working | From the cloned React bundle; hard-coded content. Unchanged by this work (documented decision). |
| Supabase call shim | Working | `index.html` intercepts fetch/XHR to `cowggxamybvlpkgoyfve.supabase.co`; returns Supabase-shaped empty responses |
| Live search suggestions | Working | Custom overlay; calls `GET /api/v1/products/?search=` |
| Product detail view (overlay) | Working | Calls `GET /api/v1/products/{id}` |
| Add to bag / cart (overlay) | Working | Sessions persist: backend adopts the client-supplied `session_id`; frontend stores it in `localStorage` (`mh_bag_session`) |
| Stripe checkout session | Working | `POST /payment/create-checkout-session`; redirects to `/checkout/success?session_id=...` and `/checkout/cancel` |
| Checkout confirmation view | Working | `/checkout/success` overlay polls `GET /api/v1/orders/confirm` and renders the order summary |
| Stripe webhook → order creation | Working | `checkout.session.completed` creates an Order + OrderItems (price snapshots), decrements inventory, marks cart paid; idempotent per `stripe_session_id` |
| Public products/cart API | Working | List/search/detail, cart view/add/remove |
| Admin API (`/api/v1/admin`) | Working | JSON contract `{data,total,page,limit}`; KPIs, revenue, products CRUD, upload-url, orders (+status, +refund), users (Cognito), inventory bulk |
| Admin auth (Cognito) | Working | JWKS verification, `custom:role`/`cognito:groups` admin check, PKCE Hosted UI on the dashboard |
| Admin dashboard pages | Working | Dashboard, Products, Inventory, Orders, Users — real API data, no mock fallback |
| Product image uploads | Working | `POST /upload-url` → presigned S3 PUT → `image_url` stored/served via CDN |
| Orders & refunds | Working | Order model + webhook creation; admin status transitions (`pending\|paid\|fulfilled\|cancelled\|refunded`); Stripe refunds |
| Alembic migrations | Working | Baseline `4c876b623f11` creates all 10 tables (no `user_roles`); runs at container start |
| JSON logging / health / graceful shutdown | Working | Structured logs, trace IDs, `SELECT 1` health check, lifespan engine disposal |
| Catalog seeding (`python cli.py seed`) | Working | Upserts 16 products by slug (MH-002..MH-017) |
| Dev proxy (`python cli.py serve`) | Working | Serves `Website/`, proxies `/api`, `/cart`, `/payment`, SPA fallback |
| Docker / docker-compose | Working | Three services: backend (`alembic upgrade head` + uvicorn 8001), frontend proxy (8000), seed |
| CI pipeline (lint / test / security) | Working | Real `tests/` suite in the test job; `safety check -r requirements.txt` gates |

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React/Vite (cloned, minified bundle), inline CSS single-file `index.html`, Supabase calls shimmed out |
| Admin | Vanilla ES modules, Chart.js, Cognito Hosted UI (PKCE) |
| Backend | Python 3.14+, FastAPI, SQLAlchemy 2.0, Pydantic, Alembic, boto3 |
| Database | PostgreSQL (`DATABASE_URL`), SQLite for tests |
| Auth | AWS Cognito (JWKS-verified JWT, `custom:role` claim) |
| Storage | AWS S3 presigned uploads + CloudFront CDN |
| Payments | Stripe (checkout session + webhook → order creation) |
| Deployment | Docker, docker-compose, GitHub Actions CI |

---

## 4. Target Architecture

Production topology for the AWS migration. Everything below is **target-state** — the console resources do not exist yet; the repo artifacts that map to each resource are listed per component and in the mapping table (§4.4). A rendered diagram lives at [`architecture.svg`](architecture.svg) (also reproduced in ASCII below).

```
                      ROUTE 53 (Hosted Zone: adityanair.tech)
  maisonhygia.adityanair.tech      -> CloudFront (Web)      -> S3 web bucket + ALB (API paths)
  admin.maisonhygia.adityanair.tech -> CloudFront (Admin)   -> S3 admin bucket
  assets.maisonhygia.adityanair.tech -> CloudFront (Assets) -> S3 assets bucket (OAC)
  api.maisonhygia.adityanair.tech   -> ALB
  auth.maisonhygia.adityanair.tech  -> Cognito Hosted UI

                      VPC (10.0.0.0/16) — 2 AZs
  Public  (2)  : ALB + NAT Gateway (AZ A)
  App     (2)  : EC2 ASG (Docker, port 8001) — 100% On-Demand, Min=1/Desired=1
  Data    (2)  : RDS PostgreSQL 16 (Single-AZ, t3.medium, 100 GB GP3)

  S3 (3 buckets, Block Public Access ON, OAC for CloudFront only):
    maison-hygia-web-prod, maison-hygia-admin-prod, maison-hygia-assets-prod
  Cognito User Pool (email auth, custom:role, MFA optional) + SendGrid SMTP
  CloudWatch dashboard + alarms -> SNS -> email
  AWS Budgets ($150 forecast)
```

### 4.1 Route 53 (`adityanair.tech` hosted zone)

One hosted zone serves all five public names:

| Record | Target |
|--------|--------|
| `maisonhygia.adityanair.tech` | Web CloudFront distribution |
| `admin.maisonhygia.adityanair.tech` | Admin CloudFront distribution |
| `assets.maisonhygia.adityanair.tech` | Assets CloudFront distribution |
| `api.maisonhygia.adityanair.tech` | ALB |
| `auth.maisonhygia.adityanair.tech` | Cognito custom domain |

### 4.2 CloudFront Web behavior order (critical — preserves same-origin API calls)

The customer site uses **relative** URLs (`/api/v1/...`, `/cart/...`, `/payment/...`) and today relies on a dev proxy. CloudFront replaces that proxy:

| Order | Path pattern | Origin | Cache |
|-------|--------------|--------|-------|
| 1 | `/api/*` | ALB (`api.maisonhygia.adityanair.tech`) | Disabled |
| 2 | `/cart*` | ALB | Disabled |
| 3 | `/payment*` | ALB | Disabled |
| 4 | default (`*`) | S3 web bucket (OAC) | Managed-CachingOptimized |

- SPA fallback: CloudFront custom error response 404 → `/index.html` (200) for deep links and `/checkout/success`.
- Stripe redirect URLs use `/checkout/success` and `/checkout/cancel` (NOT `/cart/...`) so they stay on the S3 origin and render the confirmation view.
- CORS is only needed for the **admin dashboard** (cross-origin to `api.*`). Set `ALLOWED_ORIGINS=https://admin.maisonhygia.adityanair.tech,https://maisonhygia.adityanair.tech` via Parameter Store; never `*` with credentials.
- The three CloudFront distributions (Web, Admin, Assets) all use the ACM wildcard certificate `*.maisonhygia.adityanair.tech` (us-east-1) and PriceClass_100. Admin and Assets distributions use 404 → `/index.html` fallback (Admin, for hash routing `/admin#callback`) and an optimized cache policy (Assets).

### 4.3 Components

**S3 (3 buckets, Block Public Access ON, versioning ON, SSE-S3):**

| Bucket | Serves | Origin access |
|--------|--------|---------------|
| `maison-hygia-web-prod` | `Website/` (index.html + bundle + assets) | CloudFront Web via OAC |
| `maison-hygia-admin-prod` | `admin-dashboard/` | CloudFront Admin via OAC |
| `maison-hygia-assets-prod` | Product images (uploaded via presigned PUT) | CloudFront Assets via OAC; CORS for the admin origin |

The bundle hardcodes root-absolute asset paths (`/assets/...`), so the web bucket must be served at the domain root (documented limitation, §17).

**ALB:** internet-facing, HTTPS:443 with the ACM cert; HTTP:80 redirects to 443. Target group: HTTP:8001 on EC2, health check `GET /health` (30s interval, 5s timeout, healthy 2 / unhealthy 3, deregistration delay 30s). Default action forwards to the ASG target group; `api.maisonhygia.adityanair.tech` points here.

**EC2 ASG (backend compute):** launch template (AMI + t3.medium + IAM instance profile + User Data), App subnets, attaches the target group. **Min=1 / Desired=1 / Max=5, 100% On-Demand** (decision 10; spot deferred until load-testing proves stability). Runs the backend Docker image: container start runs `alembic upgrade head` then `uvicorn backend.main:app --host 0.0.0.0 --port 8001`. Boot-time environment injection from Secrets Manager + Parameter Store (instance role; no keys baked into the image). Deploys via launch template version bump + ASG instance refresh.

**RDS PostgreSQL 16:** single-AZ `db.t3.medium`, 100 GB GP3, encrypted, deletion protection, 7-day backups, maintenance Sun 03:00–04:00. DB subnet group over both Data subnets; parameter group with `pg_stat_statements` and `log_min_duration_statement=1000`. Schema managed exclusively by Alembic (baseline `4c876b623f11`, 10 tables, no `user_roles`); `AUTO_CREATE_SCHEMA=false` in production.

**Cognito User Pool:** email authentication, required `custom:role` String attribute, MFA optional (enable for admin accounts), 8-char password policy. SPA app client (PKCE, OAuth code grant, scopes openid/email/profile): callbacks `https://maisonhygia.adityanair.tech/callback` and `https://admin.maisonhygia.adityanair.tech/admin#callback`, logout `https://maisonhygia.adityanair.tech/`. Backend app client (confidential, ADMIN_USER_PASSWORD_AUTH) if needed. Custom domain `auth.maisonhygia.adityanair.tech`; groups `admin` / `editor` / `customer`; **no pre-token Lambda** (the JWT `custom:role` claim is read directly).

**SendGrid:** verified sender `no-reply@maisonhygia.adityanair.tech`; Cognito-compatible SMTP (`smtp.sendgrid.net:587`) for sign-up verification and password resets. Credentials live in Secrets Manager, never in the repo.

**CloudWatch + SNS + Budgets:** dashboard `MaisonHygia-Prod` (EC2 CPU/mem ASG avg, ALB latency/5XX/RPS, RDS CPU/connections/storage, custom orders/min); log groups `/aws/ec2/maison-hygia/app` + `/aws/ec2/maison-hygia/access` (30-day retention) consuming the backend's JSON structured logs; CloudWatch agent on instances; alarms → SNS `maison-hygia-alerts` → email (ASG unhealthy, ALB 5XX, RDS CPU/storage, app ERROR rate); AWS Budgets `$150` forecast → SNS.

### 4.4 Repo artifact → AWS resource mapping

| Repo artifact | AWS resource | Mechanism |
|---------------|--------------|-----------|
| `Website/` (index.html + `assets/`) | S3 `maison-hygia-web-prod` + CloudFront Web | `deploy-frontend.yml`: `aws s3 sync Website/ s3://$WEB_BUCKET --delete` + invalidation |
| `admin-dashboard/` | S3 `maison-hygia-admin-prod` + CloudFront Admin | `deploy-admin.yml`: `aws s3 sync admin-dashboard/ s3://$ADMIN_BUCKET --delete` + invalidation |
| `Dockerfile` + `backend/` + `alembic/` + `cli.py` | ECR + EC2 ASG | `deploy-backend.yml`: test → build/push `sha-<commit>` tag → launch template version → ASG instance refresh |
| `backend/config.py` env contract | Secrets Manager + Parameter Store | Instance role injection at container start |
| `backend/auth.py` | Cognito (JWKS) | JWT verification with `custom:role` |
| `backend/s3.py` + `CF_ASSETS_DOMAIN` | S3 assets + CloudFront Assets | Presigned PUT uploads, CDN URLs |
| `.github/workflows/ci.yml` | CI (tests/lint/security) | Push/PR to `main`/`master` |
| `alembic/` baseline `4c876b623f11` | RDS schema | `alembic upgrade head` at container start |

**Dev vs. production parity:** local development runs the same artifacts — `cli.py serve 8000` plays the role of CloudFront Web (serves `Website/`, proxies `/api`, `/cart`, `/payment` to the backend), and uvicorn on 8001 plays the role of the ALB target. The CloudFront behaviors above are the production equivalent of that proxy.

### 4.5 Locked-in design decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Customer site | Keep the minified bundle **for rendering**, block its Supabase network calls via a fetch/XHR shim; the custom search / cart / Stripe checkout drive the demo | The bundle renders every page (`<div id="root">`); it cannot be deleted without blanking the site. No external Supabase data writes after the shim. |
| 2 | Embedded admin panel in `Website/index.html` | **Remove** — it authenticates with a Supabase token from `localStorage` and is superseded by `admin-dashboard/` | Kills the obsolete Supabase auth path; one admin UI going forward |
| 3 | Admin dashboard | Keep the vanilla JS app (no React rebuild); wire it to the new JSON API | Already Cognito-PKCE ready; ~10–14 hrs of JS edits vs 30+ hrs for a rebuild |
| 4 | Admin scope | Dashboard KPIs, Products, Inventory, Orders, Users. **Cut** Settings + Email-templates | Realistic for 6–8 weeks; Settings/Email-templates need new DB models |
| 5 | Order model | **Build minimal `Order` + `OrderItem`**; the Stripe webhook creates an order and decrements inventory | Makes the "checkout → order in admin" demo real |
| 6 | Admin API contract | **Rewrite backend to clean JSON** `{data,total,page,limit}`; add missing endpoints | The dashboard already expects this shape; small JS tweaks on our side |
| 7 | Auth | **Cognito JWKS**, read `custom:role` claim; delete the `user_roles` table and Supabase JWKS code | No pre-token Lambda required; fewer moving parts |
| 8 | DB migrations | **Add Alembic**; baseline revision; the container entrypoint runs `alembic upgrade head` | Prevents schema drift on shared RDS; `create_all` cannot alter tables |
| 9 | Images | **Direct S3 presigned PUT**; `Product.image_url` stores the S3 key; remove local-disk saves | Scalable; admin-only; no API bandwidth |
| 10 | Compute | ASG, **100% On-Demand, Min=1/Desired=1, Max=5**, ASG instance refresh for deploys | Spot deferred until load-testing proves stability |
| 11 | Database | Single-AZ `db.t3.medium`, 100 GB GP3, encrypted, 7-day backups, deletion protection | Upgrade path to Multi-AZ documented in runbooks |
| 12 | Staging | **Cut entirely** | Single prod stack + CI + local dev is the right scope |
| 13 | VPC endpoints | **S3 gateway endpoint only**; no interface endpoints (NAT handles egress) | Saves ~$56/mo; NAT is already required for ECR pull |
| 14 | WAF / GuardDuty | **Defer** | Listed in the security checklist as future work |
| 15 | Email | **SendGrid** (verified domain, Cognito-compatible, free tier) | Reliable delivery, native Cognito integration |
| 16 | Secrets | Secrets Manager (DB/Stripe/Cognito) + Parameter Store (non-secrets) | Least privilege, no keys in the image |
| 17 | Pre-token Lambda | **Skip** — read `custom:role` from the JWT | Fewer failure modes for zero demo benefit |
| 18 | Golden AMI | **Optional / deferred** — User Data remains the source of truth | Bake only after the app + CloudWatch agent are verified |
| 19 | Terraform | **Deferred to post-submission** | Manual console + runbooks is fine for a case study |

---

## 5. Repository Structure

```
Maison-Hygia/
├── Website/                        # Statically-served customer frontend
│   ├── index.html                  # Clone + shim + search/cart/checkout-confirmation overlays
│   └── assets/                     # Minified React bundle, images, stylesheet
├── admin-dashboard/                # Vanilla JS admin SPA (Cognito PKCE, JSON API)
│   ├── index.html                  # Meta-tag config (cognito-client-id, api-base-url)
│   ├── css/                        # Design tokens + layout + pages + darkmode
│   └── js/                         # app.js, api.js, auth.js, store.js, pages/, components/
├── backend/                        # FastAPI backend
│   ├── main.py                     # App, JSON logging, trace IDs, /health, graceful shutdown
│   ├── config.py                   # pydantic-settings (env / .env)
│   ├── database.py                 # SQLAlchemy engine / session / ensure_schema
│   ├── models.py                   # ORM: Product, Variant, Inventory, Cart, CartItem, Order, OrderItem
│   ├── auth.py                     # Cognito JWKS verification, require_admin
│   ├── routes.py                   # Public products/cart/payment + checkout confirm
│   ├── admin.py                    # JSON admin API (KPIs, products, orders, users, inventory, upload-url)
│   ├── orders.py                   # Order creation from Stripe webhook, refunds, revenue queries
│   └── s3.py                       # Presigned uploads + CDN public URLs
├── alembic/                        # Schema migrations (baseline revision)
├── cli.py                          # `python cli.py seed` + `python cli.py serve 8000`
├── tests/                          # pytest suite (TestClient + mocked Stripe)
├── requirements.txt                # Pinned dependencies (incl. dev: pytest, ruff, black)
├── pyproject.toml                  # Project metadata (PEP 621) + ruff/black config
├── Dockerfile                      # Python 3.14-slim; copies backend/, Website/, admin-dashboard/, alembic/
├── docker-compose.yml              # backend + frontend proxy + seed services
├── .github/workflows/              # ci.yml + 3 deploy workflows (backend, frontend, admin)
├── architecture.svg                # Target AWS architecture diagram
└── .env.example                    # Documented environment variables (copy to .env)
```

How each piece deploys:

- **Customer site** (`Website/`): synced to the web S3 bucket by `deploy-frontend.yml` (`aws s3 sync Website/ s3://$WEB_BUCKET --delete`) and fronted by CloudFront Web. The bundle references assets with root-absolute paths, so it must be served at the domain root; same-origin API paths (`/api/*`, `/cart/*`, `/payment/*`) are handled by the CloudFront behaviors in §4.2.
- **Admin dashboard** (`admin-dashboard/`): synced to the admin S3 bucket by `deploy-admin.yml`; `cognito-client-id`, `cognito-domain`, and `api-base-url` are set via meta tags in `index.html`; CloudFront 404 → `/index.html` for hash routing.
- **Backend** (`backend/` + `Dockerfile` + `alembic/`): built by `deploy-backend.yml` into an ECR image tagged `sha-<commit>` and deployed to the EC2 ASG via launch-template version + instance refresh. `alembic upgrade head` runs at container start; env vars come from Secrets Manager + Parameter Store on the instance role.
- **Tests** (`tests/`): the pytest suite runs in CI (`ci.yml` test job) and in `deploy-backend.yml` before any deploy.

---

## 6. Getting Started (Local Dev)

### 6.1 Prerequisites

- Python 3.10 or newer (the project declares `requires-python = ">=3.10"`)
- `pip`
- Git (to clone)
- Optional: Docker / Docker Compose for containerized runs

### 6.2 Install dependencies

```bash
pip install -r requirements.txt
```

### 6.3 Configure environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL` (PostgreSQL recommended; a SQLite URL works for quick local runs) and optionally Stripe/Cognito/S3 keys.

All configuration is read from environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | *(required)* | SQLAlchemy database URL (PostgreSQL in production). |
| `BACKEND_URL` | `http://127.0.0.1:8001` | Base URL that `python cli.py serve` proxies `/api`, `/cart`, `/payment` to. |
| `FRONTEND_URL` | `http://localhost:8000` | Base URL used by the backend to build Stripe checkout redirects (`/checkout/success`, `/checkout/cancel`). |
| `ALLOWED_ORIGINS` | `http://localhost:8000,http://localhost:8001` | Comma-separated CORS origins allowed by the backend's `CORSMiddleware`. |
| `STRIPE_SECRET_KEY` | *(unset)* | Stripe API secret key. If unset, checkout/refund endpoints fail with HTTP 503. |
| `STRIPE_WEBHOOK_SECRET` | *(unset)* | Stripe webhook signing secret. If unset, `POST /payment/webhook` fails with HTTP 503. |
| `COGNITO_USER_POOL_ID` | *(unset)* | Cognito user pool for admin auth (JWKS + user management). |
| `COGNITO_APP_CLIENT_ID` | *(unset)* | Cognito app client; also used as the JWT audience. |
| `AWS_REGION` | `us-east-1` | AWS region for Cognito/S3 clients. |
| `S3_ASSETS_BUCKET` | *(unset)* | S3 bucket for product image uploads (presigned). |
| `CF_ASSETS_DOMAIN` | `assets.maisonhygia.adityanair.tech` | Public CDN domain that serves the bucket. |
| `AUTO_CREATE_SCHEMA` | `true` | Create tables on startup (dev convenience). Production uses Alembic. |
| `LOG_LEVEL` | `INFO` | Level for the JSON-structured backend logs. |

### 6.4 Create the schema and seed the catalog

```bash
alembic upgrade head        # apply migrations (10 tables)
python cli.py seed          # seeds 16 products (MH-002..MH-017); upserts by slug on re-runs
```

For quick local dev without Alembic, set `AUTO_CREATE_SCHEMA=true` and the backend creates tables on startup.

### 6.5 Start the backend

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001
```

Health check: `GET /health` runs `SELECT 1` and returns `{"status":"ok"}`.

### 6.6 Start the frontend + proxy

```bash
python cli.py serve 8000
```

This serves the `Website/` directory and proxies requests under `/api/`, `/cart`, and `/payment` to `BACKEND_URL` (default `http://127.0.0.1:8001`). Extensionless paths that don't exist on disk (e.g. `/shop`) fall back to `index.html`, so SPA deep links work on refresh/direct open.

Open [http://localhost:8000](http://localhost:8000) in your browser.

> The port split matters: backend on **8001**, frontend on **8000**.

### 6.7 Admin dashboard (optional, local)

Serve `admin-dashboard/` with any static server (e.g. `python -m http.server 8002 -d admin-dashboard`). Point the `api-base-url` and `cognito-client-id` meta tags at your Cognito user pool and API. Sign in via Cognito Hosted UI; admin routes require the `custom:role=admin` claim (or membership in the `admin` group).

### 6.8 Running with Docker

```bash
docker-compose up --build
```

Three services:

- **backend** — `alembic upgrade head && uvicorn backend.main:app --port 8001`, healthchecked on `/health`; Stripe/Cognito/S3 secrets are passed through env substitution (`${STRIPE_SECRET_KEY:-}`, etc.) — export them in your shell or `.env` before `docker-compose up`. `AUTO_CREATE_SCHEMA` defaults to `false` here so migrations are exercised.
- **frontend** — `python cli.py serve 8000` proxying to `BACKEND_URL=http://backend:8001`.
- **seed** — `python cli.py seed` one-shot after backend is healthy.

- Backend: [http://localhost:8001](http://localhost:8001)
- Frontend: [http://localhost:8000](http://localhost:8000)
- Health: [http://localhost:8001/health](http://localhost:8001/health)

---

## 7. Testing & Linting

```bash
# Tests
python -m pytest

# Lint
ruff check backend/

# Format check
black --check backend/
```

The `tests/` suite uses `fastapi.testclient.TestClient` with a throwaway SQLite database (set via `DATABASE_URL` in `tests/conftest.py` before importing the backend) and monkeypatched Stripe calls — it never touches the dev database. Coverage includes product listing/search/pagination, cart persistence, checkout-session metadata/redirect URLs, webhook order creation + inventory decrement + idempotency, checkout confirmation, and seed reconciliation.

---

## 8. API Reference

Public endpoints are prefixed `/api/v1`; admin endpoints are prefixed `/api/v1/admin` (Cognito admin role required). FastAPI auto-generates interactive Swagger/OpenAPI docs at `/docs` (and `/openapi.json`) on the running backend.

### 8.1 Public endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check: runs `SELECT 1`; 200 with `{"status":"ok"}` or 500 JSON. |
| `GET` | `/api/v1/products/` | List active products with pagination + search. |
| `GET` | `/api/v1/products/{product_id}` | Single active product with variants and inventory. |
| `GET` | `/cart/` | View cart items for a session. |
| `POST` | `/cart/add` | Add a variant to the cart. |
| `POST` | `/cart/remove` | Remove a variant from the cart. |
| `POST` | `/payment/create-checkout-session` | Create a Stripe Checkout session; redirects to `/checkout/success?session_id=...`. |
| `POST` | `/payment/webhook` | Stripe webhook: `checkout.session.completed` creates an Order, decrements inventory, marks the cart paid. |
| `GET` | `/api/v1/orders/confirm?session_id=...` | Public order summary for the checkout confirmation view. |

### 8.2 Admin endpoints (JSON contract)

All routes under `/api/v1/admin`, all `Depends(require_admin)`, all list responses shaped `{data, total, page, limit}`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/dashboard/kpis` | GET | `{total_products, active_products, variants, orders, paid_orders, revenue, customers}` |
| `/dashboard/revenue?days=30` | GET | `[{date, revenue}]` |
| `/products` | GET | Paginated, search (name/description/sku) |
| `/products` | POST | Create product + variants (JSON body) |
| `/products/{id}` | PUT | Update product + sync variants |
| `/products/{id}` | DELETE | Cascade delete |
| `/upload-url` | POST | `{filename, folder}` → validate ext (png/jpg/jpeg/webp/gif) + content-type → presign PUT → `{url, key, public_url}` |
| `/orders?page&limit&status` | GET | Paginated, status filter |
| `/orders/{id}` | GET | Full detail (items, customer, timeline) |
| `/orders/{id}` | PUT | `{status}` update |
| `/orders/{id}/refund` | POST | Stripe refund |
| `/users?page&limit&search` | GET | Cognito `ListUsers` + local order counts |
| `/users/{id}/role` | PUT | Cognito `AdminAddUserToGroup` / `AdminRemoveUserFromGroup` |
| `/users/{id}` | PUT | `{enabled}` → `AdminEnableUser` / `AdminDisableUser` |
| `/inventory` | GET | All variants with stock + low-stock flag |
| `/inventory/bulk` | PUT | `{updates: [{variant_id, quantity}]}` |

Public product payloads include `image_url` as an S3 key (full CDN URL resolved client-side from `CF_ASSETS_DOMAIN`).

---

## 9. Authentication (Cognito)

- **Backend** (`backend/auth.py`): verifies JWTs against the Cognito user pool JWKS endpoint (`https://cognito-idp.{region}.amazonaws.com/{poolId}/.well-known/jwks.json`), checking issuer (the pool base URL) and audience (`COGNITO_APP_CLIENT_ID`). JWKS is cached for 3600s with refresh on an unknown `kid` (the old cache-clear bug on a plain function is fixed). `require_admin` accepts `custom:role == "admin"` **or** `cognito:groups` containing `admin` — no `user_roles` table, no pre-token Lambda.
- **Admin dashboard** (`admin-dashboard/js/auth.js`): Cognito Hosted UI with PKCE (OAuth code grant, no client secret), configured via the `cognito-client-id` / `cognito-domain` meta tags in `admin-dashboard/index.html`; callback lands on `{origin}/admin#callback` (hash routing + CloudFront 404 → `/index.html`).
- **API client** (`admin-dashboard/js/api.js`): reads the `api-base-url` meta tag (default `https://api.maisonhygia.adityanair.tech/api/v1/admin`), injects the Bearer token, retries once on 401 with a refresh token.
- Admin user endpoints (`/users`, `/users/{id}/role`, `/users/{id}`) use the Cognito Admin API (`ListUsers`, `AdminAddUserToGroup`, `AdminRemoveUserFromGroup`, `AdminEnableUser`, `AdminDisableUser`) — the EC2 instance role needs Cognito admin permissions (see §11.5).
- Without `COGNITO_USER_POOL_ID` / `COGNITO_APP_CLIENT_ID`, admin user endpoints return 503.

---

## 10. CI/CD Deployment

### 10.1 Workflows

**`ci.yml` (CI/CD Pipeline)** — runs on push/PR to `main`/`master`; three jobs:

1. **test** — installs dependencies; runs `pytest`.
2. **lint** — runs `ruff check backend/` and `black --check backend/`.
3. **security** — installs `requirements.txt` and `safety`, then runs `safety check -r requirements.txt --full-report` (gates the build).

**`deploy-backend.yml` (Deploy Backend)** — runs on push to `main` touching `backend/**`, `alembic/**`, `alembic.ini`, `Dockerfile`, `requirements.txt`, `pyproject.toml`, or the workflow file:

1. **test** job: pytest + ruff + black (same as CI).
2. **deploy** job (needs test): assumes the Actions role via OIDC → logs into ECR → `docker build`/`push` tagged `sha-<12 hex of commit>`.
3. Reads the `$Latest` launch template version's User Data, rewrites the `sha-<12 hex>` token to the new image tag, and creates a new launch template version from `$Latest`.
4. Starts an ASG instance refresh (`InstanceWarmup: 300`, `MinHealthyPercentage: 100`, `SkipMatching: true`) and waits for status `Successful` (fails the deploy otherwise).

**`deploy-frontend.yml` (Deploy Frontend)** — runs on push to `main` touching `Website/**` or the workflow file: `aws s3 sync Website/ s3://$WEB_BUCKET --delete` then `aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_WEB_DIST_ID --paths '/*'`.

**`deploy-admin.yml` (Deploy Admin Dashboard)** — runs on push to `main` touching `admin-dashboard/**` or the workflow file: `aws s3 sync admin-dashboard/ s3://$ADMIN_BUCKET --delete` then `aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ADMIN_DIST_ID --paths '/*'`.

### 10.2 GitHub OIDC + secrets

All deploy workflows assume a GitHub Actions role via OIDC (`aws-actions/configure-aws-credentials@v4`, `role-to-assume: ${{ secrets.AWS_ROLE_ARN }}`) — no long-lived AWS keys in GitHub. Trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": { "StringLike": { "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_USER/maison-hygia:*" } }
  }]
}
```

The Actions role needs (minimum): ECR `GetAuthorizationToken` + push on the repo, `ec2:CreateLaunchTemplateVersion`/`DescribeLaunchTemplateVersions` on the launch template, `autoscaling:StartInstanceRefresh`/`DescribeInstanceRefreshes` on the ASG, `s3:PutObject`/`DeleteObject`/`ListBucket` on the three buckets, `cloudfront:CreateInvalidation` on the three distributions.

Required GitHub repository secrets (Actions → Secrets and variables):

| Secret | Used by |
|--------|---------|
| `AWS_ACCOUNT_ID` | backend (ECR image URI) |
| `AWS_ROLE_ARN` | all three deploy workflows (OIDC assume) |
| `ECR_REPOSITORY` | backend |
| `LAUNCH_TEMPLATE_ID` | backend |
| `ASG_NAME` | backend |
| `WEB_BUCKET` | frontend |
| `ADMIN_BUCKET` | admin |
| `ASSETS_BUCKET` | (reserved; assets bucket for future uploads) |
| `CLOUDFRONT_WEB_DIST_ID` | frontend |
| `CLOUDFRONT_ADMIN_DIST_ID` | admin |
| `CLOUDFRONT_ASSETS_DIST_ID` | (reserved; assets distribution) |

### 10.3 Launch template User Data contract

The launch template **User Data must contain the image reference with a `sha-<12 hex>` tag** (e.g. `export IMAGE_TAG=sha-000000000000` or the full ECR URI). The backend deploy workflow rewrites that token to `sha-<commit sha>` on every deploy via `sed -E "s/sha-[0-9a-f]{12}/$IMAGE_TAG/g"` when creating the new launch template version.

---

## 11. Manual AWS Deployment Checklist (Phase 5)

Console work, executed only after Phases 1–4 are committed and gates (§15.2) pass. Work through the phases in order; every placeholder is to be filled with the real ARN/ID/endpoint as the resource is created. This section must never contain real secrets — reference Secrets Manager / Parameter Store names and GitHub secret names instead.

### Phase 5.0 — Prerequisites

- [ ] AWS account + MFA + billing alerts
- [ ] Route 53 hosted zone for `adityanair.tech`
- [ ] ACM wildcard `*.maisonhygia.adityanair.tech` in **us-east-1**
- [ ] SendGrid domain verified + SMTP credentials
- [ ] Stripe test keys
- [ ] AWS CLI v2 configured

Records to capture:

| Field | Value |
|-------|-------|
| AWS account ID (also GitHub secret `AWS_ACCOUNT_ID`) | `________` |
| Route 53 hosted zone `adityanair.tech` ID | `________` |
| ACM certificate ARN | `________` |
| SendGrid sender `no-reply@maisonhygia.adityanair.tech` (verified domain) | `________` |

Validation: `aws sts get-caller-identity` works; cert status = Issued; hosted zone resolves.

### Phase 5.1 — Network

- [ ] VPC `10.0.0.0/16` (DNS hostnames ON)
- [ ] 6 subnets (2 AZs × Public/App/Data)
- [ ] Internet Gateway + 1 NAT Gateway (AZ A)
- [ ] Route tables (Public → IGW, App/Data → NAT)
- [ ] S3 gateway endpoint only (no interface endpoints)
- [ ] 4 security groups (ALB 443/80 from 0.0.0.0/0; EC2 8001 from ALB SG; RDS 5432 from EC2 SG; NAT)

Records to capture:

| Field | Value |
|-------|-------|
| VPC ID | `________` |
| Public subnets (AZ A / AZ B) | `________` / `________` |
| App subnets (AZ A / AZ B) | `________` / `________` |
| Data subnets (AZ A / AZ B) | `________` / `________` |
| Internet Gateway ID | `________` |
| NAT Gateway ID (AZ A) + EIP | `________` / `________` |
| Route table IDs (Public → IGW, App → NAT, Data → NAT) | `________` |
| S3 gateway endpoint ID | `________` |
| Security group IDs — ALB / EC2 / RDS / NAT | `________` / `________` / `________` / `________` |

Validation: flow logs → CloudWatch; connectivity from a test instance.

### Phase 5.2 — Database & Storage

- [ ] RDS PostgreSQL 16, single-AZ `db.t3.medium`, 100 GB GP3, encrypted, deletion protection, 7-day backups, maintenance Sun 03:00–04:00
- [ ] DB subnet group (both Data subnets) + parameter group (`pg_stat_statements`, `log_min_duration_statement=1000`)
- [ ] S3: `maison-hygia-web-prod`, `maison-hygia-admin-prod`, `maison-hygia-assets-prod` — Block Public Access ON, versioning ON, SSE-S3, CORS on the assets bucket
- [ ] CloudFront: **Web** (default → S3 via OAC; `/api/*`, `/cart*`, `/payment*` → ALB; 404 → `/index.html`), **Admin** (S3 via OAC; 404 → `/index.html`), **Assets** (S3 REST via OAC; optimized cache policy). All use the ACM cert; PriceClass_100.

Records to capture:

| Field | Value |
|-------|-------|
| RDS instance identifier | `________` |
| RDS endpoint (host:port) | `________` |
| RDS database name / master user | `________` / `________` |
| DB subnet group name | `________` |
| DB parameter group name | `________` |
| S3 bucket names — web / admin / assets (GitHub secrets `WEB_BUCKET`, `ADMIN_BUCKET`, `ASSETS_BUCKET`) | `________` / `________` / `________` |
| CloudFront Web distribution ID / domain | `________` / `https://maisonhygia.adityanair.tech` |
| CloudFront Admin distribution ID / domain | `________` / `https://admin.maisonhygia.adityanair.tech` |
| CloudFront Assets distribution ID / domain | `________` / `https://assets.maisonhygia.adityanair.tech` |
| CloudFront dist IDs (GitHub secrets `CLOUDFRONT_WEB_DIST_ID`, `CLOUDFRONT_ADMIN_DIST_ID`, `CLOUDFRONT_ASSETS_DIST_ID`) | `________` |

Validation: `psql` to RDS; S3 upload/download; CloudFront URLs serve.

### Phase 5.3 — Cognito

- [ ] User Pool (email auth; required `custom:role` String; MFA optional; 8-char password policy)
- [ ] SPA app client (PKCE, OAuth Code grant, scopes openid/email/profile, callbacks `https://maisonhygia.adityanair.tech/callback` and `https://admin.maisonhygia.adityanair.tech/admin#callback`, logout `https://maisonhygia.adityanair.tech/`)
- [ ] Backend app client (confidential, ADMIN_USER_PASSWORD_AUTH) if needed
- [ ] Custom domain `auth.maisonhygia.adityanair.tech`
- [ ] Groups: `admin`, `editor`, `customer`
- [ ] SendGrid SMTP config (`smtp.sendgrid.net:587`, FROM `no-reply@maisonhygia.adityanair.tech`)
- [ ] No pre-token Lambda

Records to capture:

| Field | Value |
|-------|-------|
| User pool ID | `________` |
| SPA app client ID (PKCE, OAuth code grant, callbacks + logout URLs) | `________` |
| Backend app client ID (confidential, if used) | `________` |
| Custom domain | `https://auth.maisonhygia.adityanair.tech` |
| Required attribute `custom:role` (String) | `________` |

Validation: Hosted UI loads; sign-up → email → sign-in → JWT has `custom:role`.

### Phase 5.4 — Compute

- [ ] IAM role `EC2InstanceProfile`: ECR read, Secrets Manager read, SSM, CloudWatch Logs, S3 Put on assets bucket, Cognito admin (for the Users page)
- [ ] Test instance (Amazon Linux 2023, t3.medium, App subnet, SG EC2, IAM role) → iterate User Data (Docker, ECR pull, env injection from Secrets/SSM, `alembic upgrade head`, app start, `/health`, CloudWatch agent) until 100% reliable
- [ ] Golden AMI (optional, deferred until stability proven)
- [ ] Launch template: AMI + t3.medium + IAM profile + SG + minimal User Data (`systemctl start maison-hygia`), tags
- [ ] Target group: HTTP:8001, `/health`, 30s interval, 5s timeout, healthy 2 / unhealthy 3, dereg delay 30s
- [ ] ALB: internet-facing, HTTPS:443 (ACM), HTTP:80 → redirect 443, both public subnets, default action → target group
- [ ] ASG: launch template, App subnets, attach target group, **Min=1 / Desired=1 / Max=5, 100% On-Demand**
- [ ] Scaling: target-tracking CPU 60%; scheduled day/night sizing (Min=1 off-peak, 2 peak if desired)
- [ ] Secrets Manager: `maison-hygia/prod/database` (DATABASE_URL), `maison-hygia/prod/stripe` (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET), `maison-hygia/prod/cognito` (COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID, COGNITO_CLIENT_SECRET if used)
- [ ] Parameter Store: `/maison-hygia/prod/CORS_ORIGINS`, `/maison-hygia/prod/LOG_LEVEL`, `/maison-hygia/prod/S3_ASSETS_BUCKET`, `/maison-hygia/prod/CF_ASSETS_DOMAIN`, `/maison-hygia/prod/COGNITO_USER_POOL_ID`, `/maison-hygia/prod/COGNITO_APP_CLIENT_ID`, `/maison-hygia/prod/AWS_REGION`

Records to capture:

| Field | Value |
|-------|-------|
| IAM role ARN + instance profile name | `________` |
| Launch template ID (GitHub secret `LAUNCH_TEMPLATE_ID`) | `________` |
| Target group ARN (HTTP:8001, `/health`, 30s/5s, healthy 2 / unhealthy 3) | `________` |
| ALB DNS name + ARN | `________` / `________` |
| ASG name (GitHub secret `ASG_NAME`; Min=1 / Desired=1 / Max=5, 100% On-Demand) | `________` |
| Scaling policy (target-tracking CPU 60%) ARN | `________` |

> **User Data contract:** the launch template User Data must contain the image reference with a `sha-<12 hex>` tag (e.g. `export IMAGE_TAG=sha-000000000000` or the full ECR URI). The backend deploy workflow rewrites that token to `sha-<commit sha>` on every deploy (§10.3).

Validation: ALB DNS → `/health` 200; ASG healthy; secrets inject.

### Phase 5.5 — DNS & Integration

- [ ] Route 53 records: web/admin/api/auth/assets (see §4.1)
- [ ] Stripe webhook URL: `https://api.maisonhygia.adityanair.tech/payment/webhook` (events: `checkout.session.completed`)
- [ ] Cognito callback URLs: `https://maisonhygia.adityanair.tech/callback`, `https://admin.maisonhygia.adityanair.tech/admin#callback`; logout URL `https://maisonhygia.adityanair.tech/`
- [ ] `admin-dashboard/index.html` meta tags set: `cognito-client-id`, `cognito-domain`, `api-base-url` (`https://api.maisonhygia.adityanair.tech/api/v1/admin`)
- [ ] Full validation suite (§15.1)

Records to capture:

| Field | Value |
|-------|-------|
| Route 53 record `maisonhygia.adityanair.tech` → Web CloudFront | `________` |
| Route 53 record `admin.maisonhygia.adityanair.tech` → Admin CloudFront | `________` |
| Route 53 record `api.maisonhygia.adityanair.tech` → ALB | `________` |
| Route 53 record `auth.maisonhygia.adityanair.tech` → Cognito domain | `________` |
| Route 53 record `assets.maisonhygia.adityanair.tech` → Assets CloudFront | `________` |

### CI/CD — GitHub OIDC (console)

- [ ] OIDC provider `token.actions.githubusercontent.com` created (IAM → Identity providers)
- [ ] Actions role created with the §10.2 trust policy (subject `repo:<owner>/maison-hygia:*`) — set as GitHub secret `AWS_ROLE_ARN`
- [ ] ECR repository created (set as GitHub secret `ECR_REPOSITORY`)
- [ ] GitHub repository secrets set: `AWS_ACCOUNT_ID`, `AWS_ROLE_ARN`, `ECR_REPOSITORY`, `LAUNCH_TEMPLATE_ID`, `ASG_NAME`, `WEB_BUCKET`, `ADMIN_BUCKET`, `ASSETS_BUCKET`, `CLOUDFRONT_WEB_DIST_ID`, `CLOUDFRONT_ADMIN_DIST_ID`, `CLOUDFRONT_ASSETS_DIST_ID`

Validation: run each workflow from a test push; deploy backend then check `https://api.maisonhygia.adityanair.tech/health`.

---

## 12. Cost

Corrected monthly estimate. The original "$80–100/mo free-tier" claim is **wrong**: EC2 t3.medium, RDS db.t3.medium and the ALB are **not free-tier eligible**, so the full amount applies from month one.

| Component | Config | Monthly cost | Notes |
|-----------|--------|-------------|-------|
| EC2 | 1x t3.medium On-Demand (Min=1, 100% OD) | ~$31 | ASG Min=1/Desired=1/Max=5; no spot until load-testing proves stability |
| RDS | t3.medium single-AZ, 100 GB GP3, encrypted, 7-day backups | ~$53 | Upgrade path to Multi-AZ documented (~+$50/mo) |
| ALB | Base + ~1 LCU | ~$20 | No free tier; HTTPS:443 + HTTP:80 redirect |
| NAT Gateway | 1 AZ (AZ A) + data processing | ~$35 | VPC endpoints deferred; NAT required for ECR pull |
| S3 + CloudFront | 3 distributions, ~50 GB/mo transfer | ~$12 | Web/Admin/Assets; OAC; PriceClass_100 |
| Secrets Manager + Parameter Store | 4 secrets + 7 params | ~$3 | DB/Stripe/Cognito secrets; non-secrets in Parameter Store |
| CloudWatch | Logs, metrics, dashboard, alarms | ~$7 | 30-day log retention; JSON app logs |
| Cognito / SendGrid / ACM / Route 53 / ECR | Free tiers + zone | ~$2 | SendGrid free tier, ACM certs free, R53 zone ~$0.50 |
| **Total** | | **~$163/mo** | |

**Deferred items (would add cost):**

| Item | Monthly cost | Status |
|------|-------------|--------|
| WAF + rate limiting | ~$6–8 | Deferred (security checklist future work) |
| GuardDuty | ~$4 | Deferred |
| Interface VPC endpoints | ~$56 | Rejected — S3 gateway endpoint only (decision 13) |
| Multi-AZ RDS | ~+$50 | Deferred; documented upgrade path |
| Spot instances | variable | Deferred until load tests prove stability (decision 10) |

**Budget guardrails:** AWS Budgets **$150 forecast** → SNS alert (billing anomaly + forecast). The single-instance minimum (Min=1) keeps the demo alive 24/7; scheduled day/night sizing can reduce off-peak cost if desired (ASG Min=1 off-peak).

---

## 13. Security

### 13.1 Checklist

| Control | Status | Verification |
|---------|--------|--------------|
| No public EC2 | (console) | EC2 instances in private App subnets, no public IPs |
| ALB HTTPS only | (console) | HTTPS:443 with ACM cert; HTTP:80 → 443 redirect; TLS 1.2+ |
| SG least privilege | (console) | ALB 443 from 0.0.0.0/0; EC2 8001 from ALB SG only; RDS 5432 from EC2 SG only; NAT SG for egress |
| No secrets in code | **In repo** | `grep` for keys/passwords returns zero results; `.env.example` holds placeholders only; real values live in Secrets Manager / GitHub secrets |
| Cognito MFA | (console) | Optional for customers; **enable for admin accounts** |
| Scoped IAM | (console) | EC2 instance role: ECR read, Secrets read, SSM, CloudWatch, S3 put (assets), Cognito admin; Actions role scoped per workflow (§10.2) |
| S3 private | (console) | Block Public Access ON all 3 buckets; CloudFront access via OAC only |
| RDS encrypted | (console) | At rest (KMS) + in transit (TLS); deletion protection ON |
| CloudTrail | (console) | Management events logged |
| Supabase key | **In repo** | Publishable-by-design (anon key in the cloned bundle) — documented, not a secret; all network calls blocked by the shim in `Website/index.html` |
| Backups | (console) | RDS 7-day automated backups; versioning ON on all 3 buckets |
| Deferred | — | WAF + rate limit, GuardDuty (post-submission) |

### 13.2 Encryption overview

| Layer | At rest | In transit |
|-------|---------|------------|
| RDS PostgreSQL | KMS-encrypted (EBS + RDS encryption) | TLS (psycopg2 `sslmode`; SG restricts to EC2) |
| S3 (web/admin/assets) | SSE-S3 (AES-256) | HTTPS via CloudFront (OAC), TLS 1.2+ |
| CloudFront / ALB | — | ACM TLS 1.2+; HTTP→HTTPS redirect |
| Cognito | AWS-managed | JWKS over HTTPS; PKCE code flow on the admin dashboard |
| Secrets Manager | KMS | TLS from EC2 instance role |
| Docker image | ECR (encrypted at rest) | HTTPS pull from EC2 |

### 13.3 Repository hygiene

- **No secrets in the repo**: `.env.example` documents variable names with empty/placeholder values; real values are injected at runtime (Secrets Manager + Parameter Store on EC2, GitHub encrypted secrets for CI/CD).
- **CI security job**: `.github/workflows/ci.yml` runs `safety check -r requirements.txt --full-report` and gates the build on findings.
- **Least-privilege CI**: deploy workflows assume the Actions role via OIDC (`role-to-assume` from `AWS_ROLE_ARN`, no long-lived AWS keys in GitHub); the trust policy is scoped to `repo:<owner>/maison-hygia:*` (§10.2).
- **Dependency pins**: `requirements.txt` pins exact versions; `safety` runs on every push/PR.
- **Public-but-inert**: the Supabase anon key and old Supabase project domain are publishable-by-design; the shim guarantees no external writes (gates 4 and 7).

### 13.4 Incident notes

- Any secret accidentally committed: rotate the value immediately (Secrets Manager new version / GitHub secret), then scrub history (BFG or filter-repo) — never just delete the file.
- Stripe keys are test-mode in dev and live-mode scoped to the Stripe account; the webhook signing secret is verified on every `POST /payment/webhook` (HTTP 503 without it).

---

## 14. Runbooks

Operational runbooks for the target AWS deployment. All commands assume the AWS CLI v2 and the `maison-hygia-prod` account profile; resource IDs come from §11.

### 14.1 Deploy backend

**Trigger**: push to `main` touching `backend/`, `alembic/`, `Dockerfile`, or `requirements.txt`.

1. GitHub Actions `deploy-backend.yml` runs automatically: pytest + ruff + black, then Docker build/push to ECR tagged `sha-<commit>`.
2. The workflow creates a new launch template version from `$Latest`, rewriting the `sha-<12 hex>` token in User Data to the new image tag.
3. The workflow starts an ASG instance refresh (InstanceWarmup 300s, MinHealthyPercentage 100, SkipMatching) and waits for it to finish.
4. Verify:
   ```bash
   curl -fsS https://api.maisonhygia.adityanair.tech/health
   aws autoscaling describe-instance-refreshes --auto-scaling-group-name maison-hygia-prod-asg
   ```
5. Monitor CloudWatch dashboard `MaisonHygia-Prod` for ALB 5XX or ASG unhealthy.

**Success criteria**: `/health` returns `{"status":"ok","database":"ok"}`; instance refresh status `Successful`; ALB target group all healthy; no ERROR-level log spikes.

### 14.2 Rollback backend

**Trigger**: failed deploy (unhealthy targets, refresh failed, or 5XX storm after a deploy).

1. Find the previous good launch template version:
   ```bash
   aws ec2 describe-launch-template-versions --launch-template-id <LT_ID> --versions '$Latest'
   # previous version = Latest - 1, or the version noted in the last successful deploy
   ```
2. Create a new version from the known-good one (do not delete the bad version — keep it for forensics):
   ```bash
   aws ec2 create-launch-template-version --launch-template-id <LT_ID> --source-version <GOOD_VERSION>
   ```
3. Start a refresh:
   ```bash
   aws autoscaling start-instance-refresh --auto-scaling-group-name maison-hygia-prod-asg
   ```
4. Watch until `Successful`, then re-run the validation from runbook 14.1.
5. If the image itself is bad (not just config), the rollback is a Git revert + deploy instead: `git revert <commit>` → push to `main` → runbook 14.1.

**Success criteria**: refresh `Successful`; `/health` OK; ALB 5XX back to baseline.

### 14.3 Scale up (emergency)

**Trigger**: high CPU alarm, traffic spike, or planned load test.

1. Immediate: raise desired capacity.
   ```bash
   aws autoscaling set-desired-capacity --auto-scaling-group-name maison-hygia-prod-asg --desired-capacity 2
   ```
2. Confirm instances register:
   ```bash
   aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names maison-hygia-prod-asg
   aws elbv2 describe-target-health --target-group-arn <TG_ARN>
   ```
3. After the spike: lower back to 1 (or rely on the CPU 60% target-tracking policy to scale in).

**Success criteria**: new instance healthy in the target group; ALB latency and 5XX recover; desired capacity returns to baseline after the event.

### 14.4 RDS storage full

**Trigger**: alarm "RDS FreeStorageSpace < 2 GB" (or CloudWatch storage alarm).

1. Assess:
   ```bash
   aws rds describe-db-instances --db-instance-identifier maison-hygia-prod
   # check AllocatedStorage vs MaxAllocatedStorage; confirm backups are recent
   ```
2. Increase storage (GP3 can scale up live, no downtime):
   ```bash
   aws rds modify-db-instance --db-instance-identifier maison-hygia-prod --allocated-storage <NEW_GB> --apply-immediately
   ```
3. Investigate the growth driver: `SELECT pg_size_pretty(pg_database_size(current_database()));` and the top tables (pg_stat_user_tables); check `log_min_duration_statement=1000` output for runaway queries.
4. If the growth is data bloat, `VACUUM FULL` the top tables in a maintenance window.

**Success criteria**: storage alarm clears; free storage > 20%; growth driver identified and documented.

### 14.5 Stripe webhook 5xx

**Trigger**: alarm "ALB 5XX" on `/payment/webhook`, or Stripe dashboard shows failed webhook deliveries.

1. Confirm the failure: `aws cloudwatch get-metric-statistics` on ALB 5XX for the `/payment/webhook` path, or check `/aws/ec2/maison-hygia/app` logs for webhook errors.
2. Check the webhook secret: `POST /payment/webhook` returns 503 without `STRIPE_WEBHOOK_SECRET`; verify the secret in Secrets Manager matches the Stripe dashboard (`maison-hygia/prod/stripe`).
3. Verify the endpoint URL in Stripe: `https://api.maisonhygia.adityanair.tech/payment/webhook` with event `checkout.session.completed`.
4. Check the app logs for signature verification failures (tampered payload, retry replay with the same `stripe_session_id` — the handler is idempotent, so replays are safe).
5. If a code bug: fix → push → deploy backend (runbook 14.1); if env issue: update the secret/parameter, then restart the instance (`aws autoscaling start-instance-refresh`).

**Success criteria**: Stripe "Webhook deliveries" shows 200s; ALB 5XX alarm clears; test checkout creates an order end-to-end.

### 14.6 Cognito / SendGrid issue

**Trigger**: users report missing verification emails, or sign-in failures.

1. Verify the user pool config: `aws cognito-idp describe-user-pool --user-pool-id <POOL_ID>` — check MFA, `custom:role` attribute, and the domain `auth.maisonhygia.adityanair.tech`.
2. Verify the app client: callbacks `https://maisonhygia.adityanair.tech/callback` and `https://admin.maisonhygia.adityanair.tech/admin#callback`; PKCE (no client secret) for the SPA client.
3. SendGrid: check the account dashboard for SMTP failures / spam reports; verify the FROM address `no-reply@maisonhygia.adityanair.tech` is still domain-verified and not suppressed.
4. Test: trigger a resend from the Cognito console ("Resend invitation") and watch `/aws/ec2/maison-hygia/app` for the JWT flow after sign-in.
5. If the pool/client changed, update the `admin-dashboard/index.html` meta tags (`cognito-client-id`, `cognito-domain`) and redeploy the admin dashboard (deploy-admin workflow).

**Success criteria**: verification email arrives < 1 min; Hosted UI loads on `auth.*`; JWT carries `custom:role` after sign-in; admin login works.

### 14.7 Image upload broken

**Trigger**: admin reports product image uploads failing.

1. Reproduce in the admin dashboard; check the browser network tab — the flow is `POST /api/v1/admin/upload-url` → presigned `PUT` to S3 → `image_url` saved.
2. Verify the presign generation: instance role must have `s3:PutObject` on `maison-hygia-assets-prod`; `S3_ASSETS_BUCKET` parameter must match.
3. Verify the bucket CORS allows the admin origin (`https://admin.maisonhygia.adityanair.tech`) for PUT; verify `CF_ASSETS_DOMAIN` (assets CloudFront) actually serves the uploaded object.
4. Check the assets CloudFront distribution OAC is attached and the cache policy is optimized for images; invalidate if needed:
   ```bash
   aws cloudfront create-invalidation --distribution-id <ASSETS_DIST_ID> --paths '/images/*'
   ```
5. If presign is fine but rendering fails, check the products API returns `image_url` keys and the admin resolves them against `CF_ASSETS_DOMAIN` (see `backend/s3.py` `public_url`).

**Success criteria**: upload succeeds in the admin UI; the image renders via `https://assets.maisonhygia.adityanair.tech/...` within minutes.

### 14.8 DB migration (schema change)

**Trigger**: a schema change lands in `alembic/versions/`.

1. Pre-deploy snapshot (always):
   ```bash
   aws rds create-db-snapshot --db-instance-identifier maison-hygia-prod --db-snapshot-identifier pre-migrate-<date>
   ```
2. Push the migration to `main` → deploy backend (runbook 14.1); the container entrypoint runs `alembic upgrade head` before uvicorn starts.
3. Verify:
   ```bash
   aws logs tail /aws/ec2/maison-hygia/app   # expect "Running upgrade -> <revision>"
   curl -fsS https://api.maisonhygia.adityanair.tech/health
   ```
4. Post-checks: `alembic current` on the instance (or via `docker exec`), spot-check the changed tables, watch ALB 5XX and app ERROR logs for 15 minutes.
5. Rollback path: restore the pre-migrate snapshot to a new instance, validate, then fail over `DATABASE_URL` (Secrets Manager update) + instance refresh. Forward-only migrations are preferred — write the reverse migration only when unavoidable.

**Success criteria**: `alembic upgrade head` idempotent (second run no-op); `/health` DB-ok; application queries work; snapshot retained for 7 days.

---

## 15. Validation & Migration-Readiness Gates

### 15.1 Live validation matrix (Phase 8, against the deployed stack)

| Test | Method | Pass criteria |
|------|--------|---------------|
| Health | `curl https://api.…/health` | 200, DB healthy |
| Auth | Sign up → email → sign in → access admin | JWT `custom:role: admin` |
| Product CRUD | Admin UI: create → edit → image upload → delete | DB + S3 + CloudFront consistent |
| Checkout | Cart → Stripe test → webhook → **Order in admin** | Order created, inventory decremented |
| Admin pages | KPIs / Products / Inventory / Orders / Users | Real data, no mock fallback |
| Auto-scaling | `hey -z 2m -c 50` | ASG scales out, scales in |
| Deploy | Push commit → ASG instance refresh | Zero downtime, health checks pass |
| Failover | Terminate EC2 manually | ASG replaces, ALB reroutes < 60s |
| Budget alert | Set budget to $1 → trigger | Email received |

### 15.2 Migration-readiness gates (Definition of Done)

The repository is **AWS-migration-ready** only when all of the following pass. These gates are run locally before any AWS console work begins. Current status (August 19, 2026): **all pass**.

| # | Gate | Status |
|---|------|--------|
| 1 | `python -m pytest` green on SQLite (tests) **and** a local PostgreSQL instance. | Pass |
| 2 | `ruff check backend/` and `black --check backend/` clean. | Pass |
| 3 | Alembic baseline applies on an empty PostgreSQL database → schema matches models exactly; `alembic upgrade head` is idempotent; `user_roles` does not exist. | Pass |
| 4 | `grep -ri "supabase\|user_roles\|UPLOAD_DIR\|sb-" .` returns zero code hits (docs may mention Supabase only as a historical note). | Pass |
| 5 | The Docker image builds and, with `AUTO_CREATE_SCHEMA=false`, runs `alembic upgrade head` then uvicorn; `/health` reports DB-ok; SIGTERM drains gracefully. | Pass |
| 6 | The admin dashboard renders from a static folder with zero build; all 5 pages (Dashboard KPIs, Products, Inventory, Orders, Users) hit real JSON endpoints; no mock data shown. | Pass |
| 7 | The customer site renders the bundle with **zero Supabase network calls** (verified in DevTools network tab); checkout confirmation view works. | Pass |
| 8 | CI: test/lint/security pass; the three deploy workflows exist and are syntactically valid. | Pass |
| 9 | `.env.example` documents every required variable including Cognito and S3/AWS settings. | Pass |
| 10 | README and FEATURES.md are accurate (no references to deleted files or features). | Pass (FEATURES.md consolidated into this README on August 19, 2026 — see §18) |

---

## 16. Roadmap

### 16.1 Phase 5 — AWS console work (remaining, ~25–30 hrs)

Execute the [Manual AWS Deployment Checklist](#11-manual-aws-deployment-checklist-phase-5) in order: 5.0 Prerequisites → 5.1 Network → 5.2 Database & Storage → 5.3 Cognito → 5.4 Compute → 5.5 DNS & Integration, plus the CI/CD OIDC items. Fill in the placeholder records as each resource is created; re-validate every gate in §15.2 after each deployment-related change.

### 16.2 Phase 7 — Monitoring & Operations (~5 hrs)

- CloudWatch dashboard `MaisonHygia-Prod`: EC2 CPU/mem (ASG avg), ALB latency/5XX/RPS, RDS CPU/connections/storage, custom orders/min.
- Log groups `/aws/ec2/maison-hygia/app` + `/aws/ec2/maison-hygia/access`, 30-day retention, JSON logs (§1).
- CloudWatch agent on the AMI: logs + CPU/mem/disk metrics.
- Alarms → SNS `maison-hygia-alerts` → email: ASG unhealthy, ALB 5XX, RDS CPU/storage, app ERROR rate.
- AWS Budgets: `$150` forecast → SNS.

### 16.3 Phase 8 — Testing & Validation (~6 hrs)

Run the [validation matrix](#151-live-validation-matrix-phase-8-against-the-deployed-stack) against the live stack: health, auth, product CRUD, checkout, admin pages, auto-scaling (`hey -z 2m -c 50`), deploy, failover, budget alert.

### 16.4 Submission deliverables

Architecture diagram ([`architecture.svg`](architecture.svg) — done in repo) · Live demo URLs (`https://maisonhygia.adityanair.tech`, `https://admin.maisonhygia.adityanair.tech` — manual, after Phase 5.5 DNS) · Demo admin credentials (Cognito user with `custom:role=admin`, created in console) · OpenAPI/Swagger at `/docs` (auto-generated by FastAPI; live check manual, after Phase 5.4) · Cost one-pager (§12 — done in repo) · Security checklist + encryption overview (§13 — done in repo) · Scaling demo (video or live load test: `hey -z 2m -c 50` against `api.*` while watching the ASG scale out/in) · Clean GitHub repo with visible CI/CD (workflows exist and are syntactically valid; the Actions role + secrets are Phase 5.0 console items).

**Definition of done for the demo:**

1. `https://maisonhygia.adityanair.tech` renders the site; search/cart/checkout work; `/checkout/success` shows the order summary (gate 7).
2. `https://admin.maisonhygia.adityanair.tech` signs in with the demo admin Cognito user; all 5 pages show real data (gate 6).
3. `https://api.maisonhygia.adityanair.tech/health` returns 200 `{"status":"ok","database":"ok"}`; `/docs` loads.
4. A Stripe test checkout creates an Order in the admin Orders page with inventory decremented (§15.1).
5. A push to `main` deploys: backend via ECR + ASG refresh; frontend/admin via S3 sync + CloudFront invalidation (§10).
6. `hey -z 2m -c 50` scales the ASG out and back in (scaling demo).

### 16.5 Future enhancements (post-submission)

| Priority | Enhancement | Effort |
|----------|-------------|--------|
| P1 | Terraform all resources | 20 hrs |
| P1 | Multi-AZ RDS + cross-region snapshot | 4 hrs |
| P2 | X-Ray distributed tracing | 4 hrs |
| P2 | Synthetic canaries (3 regions) | 2 hrs |
| P2 | WAF on ALB + rate limiting | 4 hrs |
| P3 | Image processing Lambda (resize, WebP, watermark) | 8 hrs |
| P4 | Multi-account (prod/staging isolation) | 16 hrs |
| P4 | Blue/Green CodeDeploy | 8 hrs |
| P5 | Kubernetes (EKS) migration | 40+ hrs |

Candidate directions from the pre-migration feature notes (aspirational, not commitments): connect the cloned React bundle to the FastAPI backend (replace hard-coded catalogs; the bundle is minified and currently neutralized by the shim — a full rewire remains out of scope per the documented product decision); email notifications (order confirmation / shipping; the admin Settings/email-template page was cut because no models/endpoints exist); newsletter signup (replace the shimmed Supabase `newsletter_subscribers` flow with a first-party backend endpoint); rate limiting & auth hardening on public endpoints (cart, checkout).

---

## 17. Known Limitations

- **The minified React bundle hardcodes root-absolute asset paths** (`/assets/...`, 48 references). It renders correctly when the site is served from the domain root, but cannot live under a subpath.
- **The bundle's own cart/checkout flow is shimmed out** — the Supabase shim in `index.html` makes its checkout non-functional; the first-party overlay (search → cart → Stripe → `/checkout/success` confirmation) is the supported path.
- **Stripe requires real keys.** Checkout/webhook/refund return HTTP 503 until `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are set (no placeholders).
- **Admin pages require the Cognito admin role** and a configured user pool; without Cognito env vars, admin user endpoints return 503.
- **Docker daemon / PostgreSQL needed for full gate verification** — the Docker build and real-Postgres migration checks (gates 1, 3, 5 in §15.2) were verified locally; re-run them against the live stack as part of Phase 8.

---

## 18. Consolidated Documentation Note

On **August 19, 2026**, the following documents were consolidated into this README and deleted from the repository:

| File | Where its content now lives |
|------|-----------------------------|
| `FEATURES.md` | Feature status table → §2; migration changes → §1; roadmap ideas → §16.5 |
| `execute.md` (AWS migration handoff brief) | Locked-in decisions → §4.5; current-state inventory → §2; execution order → §16.1 |
| `plan.md` (authoritative migration plan, 20 sections) | Decisions §2 → §4.5; architecture §4 → §4; Phase 1–3 work → §1/§2; Phase 4 cleanup → §1; Phase 5 checklist §18 → §11; Phase 6 CI/CD → §10; Phase 7 monitoring → §16.2; Phase 8 validation §12 → §15.1; cost §13 → §12; security §14 → §13; runbooks §15 → §14; deliverables §16 → §16.4; enhancements §17 → §16.5; gates §19 → §15.2; execution order §20 → §16.1 |
| `manual-deployment-notes.md` (Phase 6 scaffold) | Full console checklist with placeholders → §11; User Data `sha-<12 hex>` contract → §10.3 and §11.5; CI/CD OIDC console items → §11 |
| `docs/` (cancelled-task partial docs) | Architecture narrative + CloudFront table + mapping → §4; runbooks → §14; cost → §12; security + encryption → §13; submission checklist → §16.4; `docs/architecture.svg` moved to [`architecture.svg`](architecture.svg) |

The `docs are stale` notes that previously pointed at these files are fixed: this README is now the single source of truth for the repository.