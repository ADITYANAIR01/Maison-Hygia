# Architecture Report — Maison Hygia

> **Scope of this document:** a factual, repo-grounded architecture report for the Maison Hygia project. It describes the current system (a statically-served cloned storefront + FastAPI backend + vanilla-JS admin dashboard, AWS-migration-ready) with emphasis on the **completed migration off Stripe/Supabase and onto Razorpay**, and references the actual files and endpoints in this repository.

---

## 1. System / Architecture Overview

Maison Hygia is a hybrid e-commerce demo that pairs a **statically-served clone** of the `maisonhygia.com` site with a **first-party FastAPI backend** that powers products, carts, payments, orders, and an admin API. A separate **vanilla-JS admin dashboard** (Cognito-authenticated) consumes that admin API.

Three logical halves share one repo:

1. **Customer site** (`Website/`) — a single `index.html` (inline CSS + custom search/cart/checkout-confirmation overlays) plus a minified React bundle (`Website/assets/index-DLFkKnAo.js`). The compiled bundle is an **inert third-party asset**: first-party code does not integrate Supabase, and the old Supabase fetch/XHR shim has been removed from `index.html`. All first-party behavior (search, cart, Razorpay checkout) is driven by overlays that call the FastAPI backend.
2. **Backend** (`backend/`) — FastAPI + SQLAlchemy/PostgreSQL, exposing product, cart, **Razorpay payment**, order, and admin endpoints; Cognito JWT auth for admin routes; S3 presigned uploads; JSON structured logging; Alembic-managed schema.
3. **Admin dashboard** (`admin-dashboard/`) — a no-build vanilla ES-module SPA, Cognito Hosted UI (PKCE), wired to the JSON admin API. No mock fallback.

**Payment provider:** Razorpay. The flow is: create a Razorpay order server-side → open Razorpay Checkout.js in the browser → verify the return signature → create an `Order` (idempotent on `razorpay_order_id`) → confirm on `/checkout/success`. Refunds are issued through Razorpay using `razorpay_payment_id`.

**AWS posture:** the repo is *AWS-migration-ready*. The target topology (Route 53, CloudFront, S3, ALB, EC2 ASG, RDS, Cognito, SendGrid, Secrets Manager, CloudWatch) is documented in `README.md` §4 and rendered in `architecture.svg`. Console build (Phase 5) and live validation (Phase 8) remain manual.

---

## 2. Component Decomposition

### 2.1 Customer site (`Website/`)
- `index.html` — inline CSS, first-party overlays (search suggestions, cart, checkout confirmation), and a `<script src="https://checkout.razorpay.com/v1/checkout.js">` tag. The custom checkout overlay calls `POST /payment/create-order`, opens `Razorpay.Checkout`, then on success calls `POST /payment/verify` and redirects to `/checkout/success?session_id=<razorpay_order_id>`.
- `assets/index-DLFkKnAo.js` — the cloned minified React bundle. Treated as an **inert third-party asset**; first-party code does not integrate its Supabase calls.

### 2.2 Frontend proxy / dev server (`cli.py serve`)
- `python cli.py serve 8000` serves `Website/` and proxies `/api`, `/cart`, and `/payment` to `BACKEND_URL` (default `http://127.0.0.1:8001`). In production, CloudFront Web + the `/api/*`, `/cart*`, `/payment*` behaviors replace this proxy (see `README.md` §4.2).

### 2.3 Backend API (`backend/`)
| Module | Responsibility (repo-grounded) |
|--------|-------------------------------|
| `main.py` | App factory, JSON logging, `X-Request-Id`, `/health`, graceful shutdown |
| `config.py` | pydantic-settings env contract (`DATABASE_URL`, `RAZORPAY_API_KEY`, `RAZORPAY_API_SECRET`, `PAYMENT_CURRENCY`, Cognito/S3 vars) |
| `database.py` | SQLAlchemy engine/session; `ensure_schema` |
| `models.py` | ORM: `Product`, `Variant`, `Inventory`, `Cart`, `CartItem`, `Order` (with `razorpay_order_id`, `razorpay_payment_id`), `OrderItem`, `Tag`, `ProductImage` |
| `auth.py` | Cognito JWKS verification, `require_admin` (`custom:role`/`cognito:groups`) |
| `routes.py` | Public products, cart, **payment** (`/payment/create-order`, `/payment/verify`, `/payment/webhook`), and `/api/v1/orders/confirm` |
| `orders.py` | `create_order_from_cart` (idempotent), `refund_order`, `revenue_between` |
| `payments.py` | Razorpay client helpers: `create_order`, `fetch_order`, `verify_payment_signature`, `verify_webhook_signature` (HMAC-SHA256), `refund_payment` |
| `s3.py` | Presigned PUT uploads + CDN public URLs |
| `admin.py` | JSON admin API (`/api/v1/admin/*`): KPIs, products, orders (+refund), users, inventory, upload-url |

### 2.4 Admin dashboard (`admin-dashboard/`)
- `index.html` — meta-tag config (`cognito-client-id`, `cognito-domain`, `api-base-url`).
- `js/` — `app.js`, `api.js`, `auth.js` (Cognito PKCE), `store.js`, `pages/`, `components/`. Reads real admin API data; no mock fallback.

### 2.5 Data layer
- **PostgreSQL** (RDS in target; local SQLite for tests). Schema owned by **Alembic** (baseline `4c876b623f11`, 10 tables; `user_roles` does not exist). `Order` is the central commerce entity; `Order.razorpay_order_id` is `UNIQUE`, `Order.razorpay_payment_id` is indexed and nullable. The old `stripe_session_id` column has been removed.

### 2.6 AWS services (target-state, per `README.md` §4 and `infra/cloudformation/maison-hygia-stack.yaml`)
- **Route 53** (`adityanair.tech`) → CloudFront/ALB/Cognito.
- **CloudFront** (Web/Admin/Assets) → S3 origins + ALB for API paths.
- **S3** (`maison-hygia-web-prod`, `maison-hygia-admin-prod`, `maison-hygia-assets-prod`), Block Public Access ON, OAC.
- **ALB** → EC2 ASG (port 8001), `/health` checks.
- **EC2 ASG** — Docker image, `alembic upgrade head` + uvicorn at start; Min=1/Desired=1/Max=5, 100% On-Demand.
- **RDS PostgreSQL 16** (single-AZ `db.t3.medium`, 100 GB GP3, encrypted).
- **Cognito** User Pool (`custom:role`, PKCE SPA client, no pre-token Lambda).
- **SendGrid** SMTP (Cognito emails).
- **Secrets Manager** — `maison-hygia/${Environment}/database`, `.../razorpay`, `.../cognito`, `.../sendgrid`.
- **CloudWatch + SNS + Budgets** — dashboards, alarms, `$150` forecast.

---

## 3. Data Flow

### 3.1 Customer request lifecycle (browse → paid order)
```
Browser (Website/index.html overlays)
  │
  ├─ GET  /api/v1/products/?search=        → backend: list/search products
  ├─ GET  /api/v1/products/{id}            → product detail
  ├─ POST /cart/add  (session_id, variant) → backend: cart persistence (client-supplied session_id)
  ├─ GET  /cart/                           → cart view
  │
  ├─ POST /payment/create-order {session_id, email?, name?}
  │       → backend: loads cart, computes amount (×100, currency from PAYMENT_CURRENCY),
  │         calls Razorpay orders.create, returns {order_id, amount, currency, razorpay_key_id, session_id}
  │         (503 if RAZORPAY_API_KEY/SECRET unset)
  │
  ├─ Razorpay Checkout.js opens (uses razorpay_key_id + order_id)
  │       → shopper pays on Razorpay-hosted modal
  │       → Razorpay returns {razorpay_order_id, razorpay_payment_id, razorpay_signature}
  │
  ├─ POST /payment/verify {razorpay_order_id, razorpay_payment_id, razorpay_signature, session_id, email?, name?}
  │       → backend: verify_payment_signature (Razorpay SDK), fetch_order,
  │         create_order_from_cart (idempotent on razorpay_order_id)
  │         → returns {order_id, razorpay_order_id, status}
  │
  └─ redirect → /checkout/success?session_id=<razorpay_order_id>
         → GET /api/v1/orders/confirm?session_id=<razorpay_order_id>
           (matches Order.razorpay_order_id) → renders order summary
```

**Async path — Razorpay webhook** (`POST /payment/webhook`):
```
Razorpay → POST /payment/webhook  (header x-razorpay-signature = HMAC-SHA256(raw_body, RAZORPAY_API_SECRET))
   → backend: verify_webhook_signature
   → if event == "payment.captured":
        load cart via notes.session_id
        create_order_from_cart (idempotent on razorpay_order_id)
        → Order created, OrderItems snapshotted, inventory decremented, cart marked paid
```
Both `/payment/verify` and `/payment/webhook` converge on `create_order_from_cart`, which is **idempotent per `razorpay_order_id`** — replays are safe.

### 3.2 Admin flows
```
Admin browser (admin-dashboard/) → Cognito Hosted UI (PKCE) → JWT
  ├─ GET  /api/v1/admin/dashboard/kpis        → KPIs
  ├─ GET  /api/v1/admin/products (+/inventory) → catalog management
  ├─ POST /api/v1/admin/upload-url            → S3 presigned PUT → image_url
  ├─ GET  /api/v1/admin/orders                → order list
  ├─ PUT  /api/v1/admin/orders/{id}           → status transition
  └─ POST /api/v1/admin/orders/{id}/refund
         → backend: refund_order → Razorpay payment.refund(razorpay_payment_id)
           → Order.status/payment_status = "refunded"
  └─ GET/PUT /api/v1/admin/users/*            → Cognito Admin API
```

---

## 4. Cloud Data Flow (AWS topology & boundaries)

Target topology (from `README.md` §4 and `architecture.svg`):

```
                       Route 53 (adityanair.tech)
  maisonhygia.*   → CloudFront Web  → S3 web bucket (+ ALB for /api,/cart,/payment)
  admin.*         → CloudFront Admin→ S3 admin bucket
  assets.*        → CloudFront Assets→ S3 assets bucket (OAC, CORS)
  api.*           → ALB             → EC2 ASG (Docker, :8001)
  auth.*          → Cognito Hosted UI

  VPC: ALB (public) → EC2 ASG (App subnet) → RDS (Data subnet)
  EC2 → Secrets Manager / Parameter Store (instance role)
  EC2 → S3 (presigned PUT) / Cognito (admin API) / CloudWatch (logs)
  External: Razorpay (payments), SendGrid (email)
```

**What crosses each boundary:**
- **Browser ↔ CloudFront/S3/ALB** — static assets, same-origin `/api`, `/cart`, `/payment`, and `/checkout/*` calls. CORS only needed for the cross-origin admin dashboard (`ALLOWED_ORIGINS`).
- **EC2 ↔ RDS** — SQL over TLS (SG restricts to EC2). Sensitive order/customer data at rest (KMS) and in transit.
- **EC2 ↔ Secrets Manager / Parameter Store** — secrets injected at container start via instance role (no keys in image). Includes `RAZORPAY_API_KEY`/`RAZORPAY_API_SECRET`.
- **EC2 ↔ Razorpay (external)** — HTTPS: order creation, signature verification (server-side SDK), refunds; webhook signature verification uses `RAZORPAY_API_SECRET` (HMAC-SHA256 over raw body).
- **EC2 ↔ Cognito** — JWKS fetch for token verification; Admin API for user management.
- **EC2 ↔ S3** — presigned PUT for product images; GET via CloudFront CDN.
- **EC2 ↔ SendGrid** — SMTP for Cognito emails.
- **CloudWatch/SNS** — operational telemetry, alarms, budget alerts.

No Supabase boundary exists: first-party code contains no Supabase integration; the cloned bundle is an inert third-party asset.

---

## 5. System Design

### 5.1 Key decisions (selected; full table in `README.md` §4.5)
- **Payments → Razorpay** (`backend/payments.py`): order creation + Checkout.js + `payment.captured` webhook + refunds. Replaces Stripe.
- **Supabase removal**: the embedded admin panel and any first-party Supabase JWKS path are gone; the cloned bundle remains as an inert asset. New payment/order/admin paths are first-party.
- **Auth → Cognito JWKS** reading `custom:role`; no `user_roles` table, no pre-token Lambda.
- **Schema → Alembic** baseline `4c876b623f11`; container entrypoint runs `alembic upgrade head`.
- **Images → S3 presigned PUT** (`backend/s3.py`); `Product.image_url` stores the key.
- **Compute → EC2 ASG, 100% On-Demand, Min=1/Desired=1/Max=5**; deploy via launch-template version + instance refresh.
- **Secrets → Secrets Manager** (`maison-hygia/${Environment}/razorpay` etc.) + Parameter Store; least privilege.

### 5.2 Idempotency
- `create_order_from_cart` (`backend/orders.py`) checks `SELECT Order WHERE razorpay_order_id == <id>` and returns the existing order if present → both `/payment/verify` and `/payment/webhook` are safe to replay.
- Webhook signature is verified before any side effect; unknown/`ignored` events (`payment.captured` only is handled) return `{status:"ignored"}`.
- Cart is marked `paid` only once; a second fulfillment raises `409`.

### 5.3 Security
- **Webhook integrity**: `verify_webhook_signature` computes `HMAC-SHA256(raw_body, RAZORPAY_API_SECRET)` and compares with the `x-razorpay-signature` header (constant-time compare). Missing secret → 503; bad signature → 400.
- **Checkout signature**: `verify_payment_signature` uses the Razorpay SDK on the Checkout.js return values (400 on failure).
- **Admin auth**: Cognito JWKS, audience + issuer checks, `custom:role`/`cognito:groups` admin gate.
- **Secrets**: never in repo/code; `grep` for keys returns zero hits; `.env.example` is placeholders only.
- **Data protection**: RDS KMS-encrypted + TLS; S3 Block Public Access + OAC; ALB HTTPS-only; CORS scoped.

### 5.4 Secrets handling
- `backend/config.py`: `RAZORPAY_API_KEY`, `RAZORPAY_API_SECRET` (both `Optional`, 503 when unset), `PAYMENT_CURRENCY` (default `"usd"`).
- `docker-compose.yml`: passes `RAZORPAY_API_KEY`/`RAZORPAY_API_SECRET` through env substitution.
- `infra/cloudformation/maison-hygia-stack.yaml`: `SecretRazorpay` named `maison-hygia/${Environment}/razorpay` holding `{"RAZORPAY_API_KEY":..., "RAZORPAY_API_SECRET":...}`; instance role granted `secretsmanager:GetSecretValue` on `maison-hygia/${Environment}/*`.
- `requirements.txt` pins `razorpay==2.0.1` (replaces the former Stripe SDK).

---

## 6. User Design / UX Flows

### 6.1 Customer checkout (happy path)
1. Shopper browses the cloned site; the first-party search overlay calls `GET /api/v1/products/?search=`.
2. Product detail overlay calls `GET /api/v1/products/{id}`; "Add to bag" → `POST /cart/add` (session persisted via `localStorage` `mh_bag_session`).
3. Cart overlay shows items via `GET /cart/`.
4. Checkout: `POST /payment/create-order` returns order id + Razorpay key; the page injects `Razorpay Checkout.js` and opens the modal.
5. On successful payment, the modal callback `POST`s `/payment/verify`, then redirects to `/checkout/success?session_id=<razorpay_order_id>`.
6. The confirmation overlay calls `GET /api/v1/orders/confirm?session_id=<razorpay_order_id>` and renders the order summary.
7. (Async) Razorpay also fires `payment.captured` to `/payment/webhook`, which redundantly creates the order idempotently.

If Razorpay keys are unset, `/payment/create-order` and `/payment/verify` return **503** — the UI surfaces "Razorpay keys not configured."

### 6.2 Admin
1. Admin opens `admin.maisonhygia.adityanair.tech`, signs in via Cognito Hosted UI (PKCE), receives a JWT.
2. Dashboard shows KPIs (`/dashboard/kpis`); Products/Inventory/Orders/Users pages read real API data.
3. To refund: open an order → `POST /api/v1/admin/orders/{id}/refund` → backend calls Razorpay `payment.refund(razorpay_payment_id)` and sets status `refunded`.
4. Image upload: `POST /upload-url` → presigned PUT to S3 → `image_url` saved.

---

## 7. Stripe → Razorpay and Supabase-removal Migration Summary

### 7.1 What changed
- **Config / env contract** (`backend/config.py`): `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` removed; added `RAZORPAY_API_KEY`, `RAZORPAY_API_SECRET` (both optional, 503 when unset) and `PAYMENT_CURRENCY` (default `"usd"`).
- **Payment endpoints** (`backend/routes.py`):
  - `POST /payment/create-checkout-session` → **`POST /payment/create-order`** (returns `{order_id, amount, currency, razorpay_key_id, session_id}`; 503 if keys unset).
  - Added **`POST /payment/verify`** (verifies Checkout.js signature, creates Order idempotently).
  - `POST /payment/webhook` reworked to verify `x-razorpay-signature` (HMAC-SHA256) and handle `payment.captured`.
- **Razorpay client** (`backend/payments.py`, new): `create_order`, `fetch_order`, `verify_payment_signature`, `verify_webhook_signature`, `refund_payment`.
- **Order model** (`backend/models.py`): `stripe_session_id` removed; added `razorpay_order_id` (unique) and `razorpay_payment_id` (indexed, nullable). Order creation idempotent on `razorpay_order_id`.
- **Order service** (`backend/orders.py`): `create_order_from_cart` now takes a Razorpay order dict; `refund_order` calls `razorpay.payment.refund(razorpay_payment_id)`.
- **Frontend** (`Website/index.html`): removed the Supabase fetch/XHR shim; checkout now opens Razorpay Checkout.js with `razorpay_key_id` + `order_id`, POSTs `/payment/verify` on success, and redirects to `/checkout/success?session_id=<razorpay_order_id>`.
- **Refunds** (`backend/admin.py`): `POST /api/v1/admin/orders/{id}/refund` refunds via Razorpay using `razorpay_payment_id`.
- **Dependencies** (`requirements.txt`): `stripe` removed; `razorpay==2.0.1` pinned.
- **Docker** (`docker-compose.yml`): passes `RAZORPAY_API_KEY`/`RAZORPAY_API_SECRET`.
- **CloudFormation** (`infra/cloudformation/maison-hygia-stack.yaml`): `SecretRazorpay` renamed to `maison-hygia/${Environment}/razorpay` holding `RAZORPAY_API_KEY`/`RAZORPAY_API_SECRET` (the former `maison-hygia/${Environment}/stripe` is gone).
- **Supabase removal**: first-party Supabase integration removed; the cloned bundle is retained as an inert third-party asset (no shim required). This is reflected in `README.md` §1, §2, §4.5 (decisions 1, 2, 5, 7, 16), §13, §15.2 (gates 4 & 7), §17, and `SECRETS.md`.

### 7.2 Files touched (actual repo artifacts)
- `backend/config.py`, `backend/payments.py`, `backend/routes.py`, `backend/orders.py`, `backend/models.py`, `backend/admin.py`
- `Website/index.html`
- `requirements.txt`, `docker-compose.yml`
- `infra/cloudformation/maison-hygia-stack.yaml`
- `tests/` (Razorpay-mocked suite)
- Documentation: `README.md`, `SECRETS.md`, and this report

### 7.3 Why
- **Razorpay** was selected as the payment provider (order API + hosted Checkout.js + webhooks + refunds in one ecosystem). The backend contract now mirrors Razorpay's primitives directly.
- **Supabase removal** simplifies the trust boundary: no first-party dependency on Supabase remains, the obsolete embedded admin panel is gone, and the cloned bundle is explicitly treated as an inert third-party asset rather than a live integration.

---

## 8. Risks, Gaps, and Recommendations

### 8.1 Risks
- **`PAYMENT_CURRENCY` default is `"usd"`** but Razorpay's primary market is India (`inr`). If the storefront targets Indian customers, operators must set `PAYMENT_CURRENCY=inr` or amounts will be created in the wrong currency unit.
- **Webhook handler only acts on `payment.captured`**; other events return `{status:"ignored"}`. A missed/invalid `x-razorpay-signature` fails closed (400/503), but operators must monitor webhook delivery in the Razorpay dashboard.
- **Refunds are full-only** (`client.payment.refund(payment_id)` with no amount) — partial refunds are not supported by the admin UI/API today.
- **Secrets still TODO in AWS**: `maison-hygia/prod/razorpay` is a placeholder in `SECRETS.md`; until real keys are set, `/payment/*` returns 503 in production.
- **Razorpay is an external dependency**: outages or key rotation at Razorpay directly block checkout; there is no fallback provider.
- **Cloned bundle still embeds a Supabase anon key** (publishable-by-design, not a secret). It is inert from a first-party standpoint, but the bundle's own internal calls (if any fire) do not reach first-party systems; this should be documented to avoid confusion during security review.

### 8.2 Gaps
- **No OpenAPI examples** are seeded for the new `/payment/*` endpoints (FastAPI auto-generates the schema at `/docs`, but request/response examples would speed integrator onboarding).
- **Idempotency is keyed solely on `razorpay_order_id`**; if a verify and a webhook race, both call `create_order_from_cart` — safe due to the unique constraint, but the double-write path should be load-tested.
- **Limited error localization**: payment failures return generic 400/503; no structured error codes surfaced to the checkout UI beyond "keys not configured."
- **Docs-as-code not automated**: architecture/README are hand-maintained; no CI lint for doc/endpoint drift.
- **Deferred hardening** (per `README.md` §13): WAF, GuardDuty, Multi-AZ RDS, interface VPC endpoints are not yet implemented.

### 8.3 Recommendations
1. **Set `PAYMENT_CURRENCY` explicitly** per environment (and validate it matches Razorpay's accepted currencies for the merchant account).
2. **Add OpenAPI request/response examples** for `/payment/create-order`, `/payment/verify`, and `/payment/webhook` (and a `payment.captured` sample body) to reduce integration friction.
3. **Support partial refunds** by extending `refund_order` to accept an optional amount and exposing it in the admin refund endpoint.
4. **Add webhook replay/monitoring**: alarm on `/payment/webhook` 5XX (reuse runbook pattern) and surface Razorpay delivery failures in CloudWatch.
5. **Document the bundle's Supabase key** as inert in a security note to preempt false positives during audits.
6. **Advance the deferred items**: Multi-AZ RDS, WAF/rate-limiting on `/payment/*` and `/cart`, and Terraform for reproducible infra (`README.md` §16.5).
7. **CI doc gates**: add a docs lint (e.g., Vale/markdownlint) and a check that `README` payment endpoints match `backend/routes.py` to prevent drift.
