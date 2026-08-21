# Maison Hygia — Digital Commerce Foundation

> **Case Study 2 — Technology & Marketplace:** *Build the Digital Commerce Foundation.*
> Design the technical architecture for **MaisonHygia.com** and build one small working component.
>
> **Positioning:** *Modern Rituals Rooted in Nature* — a premium wellness portfolio where nature, science, design and technology meet.

This repository is the **working technical foundation** for the Maison Hygia commerce platform. It implements a production-shaped, AWS-ready architecture and a fully functional checkout component (catalog → cart → Razorpay payment → order → admin). It is the "small working component" required by the case study, built as a real, runnable system rather than a mock.

---

## 1. Product Vision & Scope

The case study frames a platform that will eventually support **Beauty, Nutrition, Wellness, personalized recommendations, subscriptions, bundles, customer accounts, loyalty, reviews, inventory, promotions, U.S. payments and AI-powered experiences.** This repo establishes the durable core; the table below maps that vision to current status.

| Capability (from brief) | Status | Notes |
| --- | --- | --- |
| Catalog (Beauty / Nutrition / Wellness) | **Done** | `Product → Variant → Inventory` model, admin CRUD, 16 seeded products |
| Cart | **Done** | Session-based cart API + overlay UI |
| Checkout / U.S. payments | **Done** | Razorpay (order → Checkout.js → verify → webhook → order) |
| Inventory | **Done** | Per-variant inventory, low-stock flags, bulk admin update |
| Orders & fulfillment | **Done** | Order + OrderItem, status lifecycle, refunds |
| Search | **Done (basic)** | REST search + custom front-end overlay; future: OpenSearch/Algolia |
| Customer accounts | Partial | Anonymous session carts today; Cognito powers *admin* auth; customer accounts on roadmap |
| Image storage / CDN | **Done** | S3 presigned uploads + CloudFront CDN |
| Analytics | Partial | CloudWatch dashboards; product/conversion analytics on roadmap |
| Auth / admin | **Done** | AWS Cognito JWKS, `custom:role`, Hosted-UI PKCE |
| CI/CD | **Done** | GitHub Actions (lint/test/security + 3 deploy workflows, OIDC) |
| Subscriptions / bundles / loyalty / reviews | Roadmap | Designed-for, not yet built (see §10) |
| Personalized / AI experiences | Roadmap | Natural extension (see Case Study 3 territory, §10) |

---

## 2. Features (implemented)

- **Static, brand-accurate storefront** — cloned Maison Hygia marketing site (React/Vite bundle) served with a custom search, cart, and checkout-confirmation overlay layered on top.
- **Live product search** — type-ahead suggestions calling `GET /api/v1/products/?search=`.
- **Product detail + add-to-bag** — overlay detail view; cart persists by client `session_id` (stored in `localStorage`).
- **Razorpay checkout** — `POST /payment/create-order` mints a Razorpay order; the browser opens Razorpay Checkout; on success it verifies the signature at `POST /payment/verify` and redirects to a first-party confirmation page.
- **Webhook-driven fulfillment** — `POST /payment/webhook` verifies the Razorpay `x-razorpay-signature` and creates the order on `payment.captured` (idempotent).
- **Order model + inventory decrement** — checkout creates an `Order` + `OrderItem`s (price snapshots) and decrements inventory atomically.
- **Admin API (JSON)** — KPIs, revenue, product CRUD, presigned image upload, orders (list/detail/status/refund), users (Cognito), inventory (list/bulk).
- **Admin dashboard (vanilla JS SPA)** — Dashboard, Products, Inventory, Orders, Users, authenticated via Cognito Hosted UI (PKCE). No mocks — reads real API data.
- **AWS-migration-ready** — Cognito auth, S3 presigned uploads, Alembic migrations, JSON structured logging, health checks, IaC (CloudFormation) and CI/CD.
- **Observability & safety** — JSON logs with `X-Request-Id` trace IDs, `/health`, graceful shutdown, `safety` security gate in CI.

---

## 3. Architecture

The case study asks us to choose and justify **frontend, backend, database, API architecture, authentication, catalog, cart, checkout/payment, search, hosting/cloud, CDN, image storage, analytics, security and CI/CD.** Each is addressed below.

### 3.1 Frontend
- **Customer site:** a statically-served clone of `maisonhygia.com` (React/Vite bundle) plus a hand-built overlay (`Website/index.html`) providing search, cart and checkout confirmation. The bundle renders every page; the overlay drives real commerce via the API.
- **Admin:** a no-build vanilla-JS SPA (`admin-dashboard/`) using Chart.js and Cognito PKCE.
- **Why:** keeps the real brand experience intact while letting us own the commerce layer; zero build step for admin simplifies deployment to S3 + CloudFront.

### 3.2 Backend
- **FastAPI (Python 3.14)** with SQLAlchemy 2.0 and Pydantic. Async-ready, auto-generated OpenAPI docs at `/docs`, easy CORS, dependency injection for auth/db.
- **Why:** fastest path to a typed, well-documented REST API; native `TestClient` makes the suite deterministic.

### 3.3 Database
- **PostgreSQL** in production (RDS); **SQLite** for tests. Schema owned by **Alembic** (baseline migration), with `AUTO_CREATE_SCHEMA` for local dev.
- **Why:** Postgres gives JSONB, strong types, and RDS managed backups; SQLite keeps the test suite fast and hermetic.

### 3.4 API architecture
- **REST**, versioned under `/api/v1`, JSON envelopes, OpenAPI-documented. Public surfaces (`/api/v1/products`, `/cart`, `/payment`) and an admin surface (`/api/v1/admin`) behind Cognito. CloudFront/ALB preserve same-origin calls (`/api`, `/cart`, `/payment` → ALB; everything else → S3).

### 3.5 Authentication & authorization
- **Admin:** AWS **Cognito** JWKS verification (`custom:role` claim, no pre-token Lambda). Admin dashboard uses Cognito Hosted UI with **PKCE**.
- **Customers:** anonymous **session-based carts** today (`session_id` from `localStorage`). A first-class Customer account model is a designed-for roadmap item (§10).

### 3.6 Catalog
- **Product → Variant → Inventory** (plus Tags, ProductImage). Variants carry price/inventory; inventory is decremented on order. Admin CRUD syncs variants and stores `image_url` (S3 key) served via CDN.

### 3.7 Cart
- **Session cart** (`/cart`): view/add/remove by `session_id`. The backend adopts the client-supplied session id so the SPA and API agree.

### 3.8 Checkout / payment
- **Razorpay** end-to-end:
  1. `POST /payment/create-order` → Razorpay order (`amount` in paise for `inr`).
  2. Browser opens **Razorpay Checkout.js** with the order id + key.
  3. `POST /payment/verify` validates the return signature, fetches the order, creates the `Order` (idempotent), and redirects to `/checkout/success?session_id=<razorpay_order_id>`.
  4. `POST /payment/webhook` (Razorpay `payment.captured`, HMAC-verified) creates the order for resilience.
- **Why Razorpay:** U.S.-and-India friendly, hosted PCI-DSS Checkout, simple signature verification, first-class refunds.

### 3.9 Search
- Server-side `ILIKE` search on name/description/SKU (`/api/v1/products/?search=`) plus a front-end type-ahead overlay.
- **Roadmap:** move to OpenSearch/Algolia for typo-tolerance, faceting and relevance ranking at scale.

### 3.10 Hosting / cloud (AWS)
- **VPC** (2 AZs): public (ALB+NAT), app (EC2 ASG, Docker, port 8001), data (RDS). **ALB** → **EC2 Auto Scaling Group** (t3.medium, Min=1/Desired=1/Max=5, 100% On-Demand). **RDS PostgreSQL 16** single-AZ (upgrade path to Multi-AZ). **Route 53** + **CloudFront** (Web/Admin/Assets) + **S3** (3 buckets, OAC) + **Cognito** + **Secrets Manager/Parameter Store** + **CloudWatch**.

### 3.11 CDN & image storage
- **CloudFront** serves the site, admin and product images. Product images use **S3 presigned PUT** uploads (admin only) and are delivered via the Assets distribution (`CF_ASSETS_DOMAIN`).

### 3.12 Analytics
- **CloudWatch** dashboards/log groups capture request volume, latency, 5XX, RDS CPU, and a custom `orders/min` metric. Product/conversion analytics and a CDP are roadmap.

### 3.13 Security
- Secrets in **Secrets Manager** (DB, Razorpay, Cognito), non-secrets in **Parameter Store**; instance role injection (no keys in images). HTTPS-only ALB, least-privilege SG/IAM, Razorpay signature verification on every payment call, structured JSON logging with trace IDs, and a `safety check` gate in CI.

### 3.14 CI/CD
- **GitHub Actions** with OIDC (no long-lived keys). `ci.yml` runs **lint (ruff), format (black), tests (pytest), and `safety`**. Three deploy workflows build/push to ECR and roll the ASG via launch-template version + instance refresh (backend), or sync to S3 + invalidate CloudFront (frontend/admin).

---

## 4. Data Model & APIs

### 4.1 Data model — `Product → Variant → Inventory → Cart → Order → Customer`

```
Customer (future model; today = order.customer_email + Cognito admins)
   │
   ├── Cart ──< CartItem >── Variant ──< Inventory
   │                │
   │                └── Order ──< OrderItem >── Variant
   │
   └── Product ──< Variant >── Inventory
           │
           ├── Tag  (product_tags)
           └── ProductImage
```

| Entity | Key fields | Notes |
| --- | --- | --- |
| **Product** | sku, name, slug, description, is_active, image_url | Catalog parent; has many Variants |
| **Variant** | sku, name, price, compare_at_price, is_active | Purchasable unit; links to Inventory |
| **Inventory** | variant_id, quantity, track_quantity, policy | Stock + low-stock logic |
| **Cart** | session_id (unique), payment_status, status, expires_at | Session-scoped basket |
| **CartItem** | cart_id, variant_id, quantity, price_at_addition | Snapshot of price at add-time |
| **Order** | razorpay_order_id (unique), razorpay_payment_id, customer_email, total, currency, status, payment_status | Created on paid checkout (idempotent) |
| **OrderItem** | order_id, variant_id, sku_snapshot, name_snapshot, price_snapshot, quantity | Immutable line items |
| **Customer** | *Roadmap* | Will consolidate `customer_email`, Cognito identity, addresses, loyalty |

The model satisfies the case-study requirement: **Product → Variant → Inventory → Cart → Order → Customer**, with Customer currently represented by `order.customer_email` and Cognito for staff (a dedicated `Customer` entity is the natural next step).

### 4.2 REST API design

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/products/` | List products (pagination + `search`) |
| GET | `/api/v1/products/{id}` | Product detail (variants + inventory) |
| GET | `/cart/?session_id=` | View cart |
| POST | `/cart/add` | Add variant to cart |
| POST | `/cart/remove` | Remove variant from cart |
| POST | `/payment/create-order` | Create Razorpay order for cart |
| POST | `/payment/verify` | Verify signature, create order, return status |
| POST | `/payment/webhook` | Razorpay webhook (`payment.captured`) |
| GET | `/api/v1/orders/confirm?session_id=` | Public order summary for confirmation page |
| GET | `/api/v1/admin/*` | KPIs, revenue, products, upload-url, orders, users, inventory (Cognito admin) |

These directly implement the case-study API asks: **retrieving products, searching products, adding to cart, creating an order, and retrieving customer orders.**

---

## 5. The Coding Component (this repository)

This repo *is* the working component. Structure:

```
Website/        Static storefront + search/cart/checkout overlays (Razorpay Checkout.js)
admin-dashboard/ Vanilla-JS admin SPA (Cognito PKCE, JSON API)
backend/        FastAPI app: config, models, database, auth, routes, orders, payments, admin, s3, main
alembic/        Schema migration (baseline)
infra/cloudformation/  Full-stack IaC template
cli.py          `seed` (catalog) + `serve` (static + proxy)
tests/          pytest suite (TestClient, Razorpay-monkeypatched)
.github/workflows/  CI + 3 deploy workflows (OIDC)
```

### Run instructions

```bash
pip install -r requirements.txt
cp .env.example .env            # set DATABASE_URL (+ RAZORPAY_API_KEY/SECRET for live checkout)

# Create schema + seed catalog (PostgreSQL recommended; SQLite works)
alembic upgrade head
python cli.py seed

# Terminal 1 — backend
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001
# Terminal 2 — frontend + proxy (serves Website/, proxies /api /cart /payment)
python cli.py serve 8000
```

Open http://localhost:8000. API docs at http://localhost:8001/docs. Admin dashboard: serve `admin-dashboard/` and configure the Cognito meta tags.

**Tests:** `python -m pytest` (hermetic SQLite, monkeypatched Razorpay — never touches your DB).

---

## 6. Scale Scenario — 500 → 100,000 visitors/day

**What breaks first (single t3.medium, single-AZ RDS, 1 instance):**

1. **App CPU / concurrency** — one small EC2 handles ~500 visitors easily, but 100k/day (~1.2 req/s average, with spikes from the influencer post far higher) saturates a single instance. The backend is **stateless**, so this is the easiest to fix.
2. **Database connections** — each request opens a SQLAlchemy connection; without pooling limits or a proxy, Postgres `max_connections` is hit first under burst. **RDS single-AZ** also has no failover.
3. **RDS compute** — product/search/cart queries and inventory writes concentrate on one DB; `LIKE` search and unindexed filters degrade.
4. **NAT / egress** — image pulls (ECR) and S3 egress share one NAT; not a hard limit but a single point of failure.
5. **S3 / CloudFront** — these scale horizontally and are *not* the bottleneck; static site + CDN absorb most traffic.

**How we scale / redesign:**

- **Compute:** raise ASG `Max`, tune target-tracking (CPU 60%), and run **Multi-AZ**; the app is stateless so horizontal scaling is safe. Put it behind the ALB that already exists.
- **Database:** enable **RDS Multi-AZ**, add a **read replica** for product/search reads, and front connections with **RDS Proxy** to cap open connections. Add indexes on `products(slug,sku)`, `variants(sku)`, `orders(razorpay_order_id)`, `carts(session_id)`.
- **Caching:** add **Redis** (ElastiCache) for product catalogs, search results and session cart reads; this offloads the DB dramatically.
- **Search at scale:** replace `ILIKE` with **OpenSearch/Algolia** for relevance and offloaded query load.
- **Async order fulfillment:** move webhook/order creation and inventory writes behind a **queue (SQS)** + worker so traffic spikes don't block checkout; payments already verify idempotently, so retries are safe.
- **CDN everything:** precompute and cache product/listing HTML at the edge; CloudFront already serves assets.
- **Resilience:** move to interface VPC endpoints (S3/Secrets), add WAF/rate-limiting on `/payment`, and alarm on 5XX/p95 latency.

Net: the architecture is already cloud-native and stateless; the scale work is operational (ASG Multi-AZ, RDS Proxy + replica, Redis, search service, queue) rather than a rewrite.

---

## 7. Security & Compliance

- **No secrets in code** — `.env.example` holds placeholders; real values live in Secrets Manager / Parameter Store / GitHub secrets.
- **Payments:** Razorpay signature verified on every `/payment/verify` and `/payment/webhook`; keys required (503 otherwise).
- **Auth:** Cognito JWKS, `custom:role` admin check, PKCE for the dashboard.
- **Transport:** ALB HTTPS:443 (ACM), HTTP→HTTPS redirect; CloudFront TLS; RDS encryption at rest + TLS.
- **Least privilege:** scoped IAM instance role; SG egress restricted; S3 Block Public Access + OAC.

---

## 8. CI/CD

- **`ci.yml`** — lint (`ruff`), format (`black --check`), **pytest**, and **`safety check`** (security gate).
- **`deploy-backend.yml`** — build Docker image → ECR (`sha-<commit>`) → new launch-template version → ASG instance refresh.
- **`deploy-frontend.yml` / `deploy-admin.yml`** — `aws s3 sync` + CloudFront invalidation.
- **OIDC** assume of a GitHub Actions role (no static AWS keys).

---

## 9. Cost (illustrative, AWS)

~**$163/month** at steady state (1× t3.medium EC2, db.t3.medium RDS single-AZ, ALB, NAT, S3+CloudFront, Secrets/Parameter Store, CloudWatch). Deferred adds: WAF, GuardDuty, interface endpoints, Multi-AZ RDS (+~$50). AWS Budgets alert at $150 forecast.

---

## 10. Roadmap / Gaps (honest)

Built-for but not yet implemented, in priority order:
1. **Customer accounts** (dedicated `Customer` model, addresses, order history).
2. **Subscriptions, bundles, promotions, loyalty, reviews.**
3. **Search upgrade** to OpenSearch/Algolia.
4. **Personalized / AI experiences** (recommendations, Ritual Concierge — Case Study 3 territory).
5. **Multi-region / Multi-AZ hardening** for the scale scenario.

---

## 11. AI Assistance Disclosure (per Case Study guidance)

Modern AI tooling was used to **accelerate scaffolding, generate boilerplate, and propose architecture options**. All generated code was **reviewed, tested, and corrected by a human** — notably the payment integration was reworked from a Stripe-based hosted-checkout design to a Razorpay signature-verify flow after identifying that the original approach did not match Razorpay's Checkout.js return-signature model, and tests were rewritten to assert real order/idempotency behavior rather than accept the AI's first (incorrect) test that reused an order id across cases.

---

## 12. Getting Started (quick)

```bash
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head && python cli.py seed
python -m uvicorn backend.main:app --port 8001   # terminal 1
python cli.py serve 8000                          # terminal 2 -> http://localhost:8000
python -m pytest                                 # tests
```

Full architecture diagram: `architecture.svg`. Generated report: `ARCHITECTURE_REPORT.md`.
