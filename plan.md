# Maison Hygia AWS Prototype - Implementation Plan

## Executive Summary

**Project**: Maison Hygia --- Ayurvedic E-commerce Prototype\
**Target**: AWS Deployment for Case Study Submission\
**Domain**: `maisonhygia.adityanair.tech` (subdomain of
`adityanair.tech`)\
**Approach**: Manual AWS Console First → Terraform Later\
**Timeline**: 6--8 weeks part-time\
**Budget**: \~\$80--150/mo after free tier (first 12 months heavily
discounted)

------------------------------------------------------------------------

## 1. Architecture Overview (2026 Patterns)

    ┌─────────────────────────────────────────────────────────────────────────────┐
    │                        MAISON HYGIA — AWS ARCHITECTURE                      │
    ├─────────────────────────────────────────────────────────────────────────────┤
    │                                                                             │
    │  INTERNET                                                                   │
    │       │                                                                     │
    │       ▼                                                                     │
    │  ┌─────────────────────────────────────────────────────────────────────┐   │
    │  │                    ROUTE 53 (Hosted Zone: adityanair.tech)         │   │
    │  │  maisonhygia.adityanair.tech     → CloudFront (Frontend)           │   │
    │  │  api.maisonhygia.adityanair.tech   → ALB (Backend API)             │   │
    │  │  auth.maisonhygia.adityanair.tech  → Cognito Hosted UI             │   │
    │  │  assets.maisonhygia.adityanair.tech → CloudFront (S3 Assets)       │   │
    │  └─────────────────────────────────────────────────────────────────────┘   │
    │       │                                                                     │
    │       ▼                                                                     │
    │  ┌─────────────────────────────────────────────────────────────────────┐   │
    │  │                        VPC (10.0.0.0/16)                            │   │
    │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
    │  │  │ Public Subnet│  │ Public Subnet│  │ Public Subnet│  (2 AZs)     │   │
    │  │  │    (AZ A)    │  │    (AZ B)    │  │    (AZ C)    │              │   │
    │  │  │  ALB + NAT   │  │     ALB      │  │     ALB      │              │   │
    │  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
    │  │         │                 │                 │                       │   │
    │  │  ┌──────▼─────────────────▼─────────────────▼───────┐              │   │
    │  │  │           Private App Subnets (EC2 ASG)          │              │   │
    │  │  │  ┌─────────────┐              ┌─────────────┐    │              │   │
    │  │  │  │ EC2 Instance │              │ EC2 Instance │    │              │   │
    │  │  │  │ (Golden AMI) │              │ (Golden AMI) │    │              │   │
    │  │  │  │  Port 8001   │              │  Port 8001   │    │              │   │
    │  │  │  └─────────────┘              └─────────────┘    │              │   │
    │  │  └──────────────────────────────────────────────────┘              │   │
    │  │         │                                                     │     │   │
    │  │  ┌──────▼─────────────────────────────────────────────────┐   │     │   │
    │  │  │            Private Data Subnets (RDS)                  │   │     │   │
    │  │  │  ┌─────────────────────┐                                │   │     │   │
    │  │  │  │ RDS PostgreSQL      │  Single-AZ db.t3.medium        │   │     │   │
    │  │  │  │ (Automated Backups) │  100 GB GP3, 3K IOPS           │   │     │   │
    │  │  │  └─────────────────────┘                                │   │     │   │
    │  │  └─────────────────────────────────────────────────────────┘   │     │   │
    │  └─────────────────────────────────────────────────────────────────┘   │
    │                                                                         │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │
    │  │   COGNITO       │  │   S3 + CF       │  │   MONITORING        │    │
    │  │   User Pool     │  │   Assets Bucket │  │   CloudWatch        │    │
    │  │   + Groups      │  │   Web Bucket    │  │   Dashboards        │    │
    │  │   (admin,       │  │   Distributions │  │   Alarms + SNS      │    │
    │  │    editor)      │  │   (OAC)         │  │   JSON Logs         │    │
    │  └─────────────────┘  └─────────────────┘  └─────────────────────┘    │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────────┘

------------------------------------------------------------------------

## 2. Final Decisions Register

  --------------------------------------------------------------------------------------
  \#     Decision               Choice                          Rationale
  ------ ---------------------- ------------------------------- ------------------------
  1      Deployment Strategy    **ASG Instance Refresh**        Native, free, rolling
                                                                updates, simpler than
                                                                CodeDeploy

  2      Instance Provisioning  **User Data → Test → Golden     Fast iteration early,
                                AMI**                           immutable reliability
                                                                later

  3      Spot Strategy          **Mixed Instances (50% Spot)**  40% savings, no
                                                                commitment, ASG handles
                                                                interruptions

  4      Database               **Single-AZ db.t3.medium**      Prototype-appropriate,
                                                                upgradeable to Multi-AZ
                                                                in 5 min

  5      Auth                   **Fresh Cognito (No Supabase)** Clean slate, no
                                                                migration complexity

  6      Admin Dashboard        **P0+P1 Scope**                 Products, Orders, Users,
                                                                Inventory, Settings,
                                                                Email Templates

  7      Domain                 **Subdomain:                    Professional, free,
                                maisonhygia.adityanair.tech**   isolated cookies/CSP

  8      Account Structure      **Single Account + Terraform    Solo dev appropriate,
                                Workspaces**                    shared ECR

  9      Secrets                **Secrets Manager + Parameter   Rotation, audit, least
                                Store**                         privilege

  10     Monitoring             **Dashboard + Alarms + JSON     Essential observability,
                                Logs**                          X-Ray later

  11     Budget Alerts          **Staging \$75 / Prod \$200     Guardrails with reaction
                                forecast**                      time

  A      Cognito Hosted UI      **Custom subdomain**            Brandable, professional

  B      Staging                **Minimal (1 t3.small, shared   Saves \~\$150/mo
                                RDS)**                          

  C      Email                  **SendGrid**                    Reliable delivery,
                                                                Cognito integration,
                                                                free tier

  D      Admin Auth             **Same Pool, `admin` Group**    Simpler user management

  E      Image Upload           **Direct S3 Presigned URL**     Scalable, no API
                                                                bandwidth

  F      Backups                **Automated 7-day + Pre-deploy  Point-in-time recovery +
                                Snapshot**                      deploy safety

  G      Disaster Recovery      **None (Documented)**           Prototype scope, future
                                                                work
  --------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 3. Email Decision: SendGrid over Gmail SMTP

  -----------------------------------------------------------------------------
  Factor               **SendGrid**               **Gmail SMTP**
  -------------------- -------------------------- -----------------------------
  **Cognito            Native (verified domain)   Not supported for Cognito
  Integration**                                   emails

  **Deliverability**   99%+ (dedicated IPs        Poor for transactional (spam
                       available)                 folder risk)

  **Free Tier**        100 emails/day forever     500/day but unreliable for
                                                  auth

  **API/Logs**         Full dashboard, webhook    None
                       events                     

  **Setup**            Domain verification (DNS   App password, less secure
                       TXT)                       

  **Cognito            ✅ Verified identity for   ❌ Not accepted by Cognito
  Compatibility**      `no-reply@`                
  -----------------------------------------------------------------------------

**Setup**: 1. Verify `adityanair.tech` in SendGrid 2. Create sender
identity: `no-reply@maisonhygia.adityanair.tech` 3. Add SendGrid SMTP
credentials to Cognito Email Configuration 4. Cost: Free tier sufficient
for prototype (\<100 emails/day)

------------------------------------------------------------------------

## 4. Phase-by-Phase Implementation Plan

### Phase 0: Prerequisites (Week 0 --- 2--4 hours)

  -------------------------------------------------------------------------
  Task         Manual Console Steps                       Output
  ------------ ------------------------------------------ -----------------
  0.1          Create AWS Account (if needed), enable     Account ready
               MFA, set billing alerts                    

  0.2          Register `adityanair.tech` (or confirm     Domain in Route
               ownership)                                 53 or external

  0.3          Create Hosted Zone for `adityanair.tech`   NS records for
               in Route 53                                delegation

  0.4          Request ACM Certificate for                Certificate ARN
               `*.maisonhygia.adityanair.tech` in         
               **us-east-1**                              

  0.5          Create SendGrid account, verify            SendGrid API key
               `adityanair.tech`, note SMTP credentials   

  0.6          Create Stripe account (test mode), note    Stripe test keys
               keys                                       

  0.7          Install AWS CLI v2, configure profile      `aws configure`
  -------------------------------------------------------------------------

**Validation**: `aws sts get-caller-identity` works, certificate shows
"Issued", domain resolves.

------------------------------------------------------------------------

### Phase 1: Network Foundation (Week 1 --- 4--6 hours)

  ------------------------------------------------------------------------
  Resource           Console Path               Key Settings
  ------------------ -------------------------- --------------------------
  **VPC**            VPC → Create VPC           Name: `maison-hygia-vpc`,
                                                CIDR: `10.0.0.0/16`, DNS
                                                hostnames: ON

  **Subnets (6)**    VPC → Subnets              2 AZs × 3 tiers: Public
                                                (/20), App (/20), Data
                                                (/20)

  **Internet         VPC → IGW                  Attach to VPC
  Gateway**                                     

  **NAT Gateway      VPC → NAT Gateways         AZ A Public Subnet,
  (1)**                                         Elastic IP

  **Route Tables**   VPC → Route Tables         Public: 0.0.0.0/0 → IGW;
                                                App/Data: 0.0.0.0/0 → NAT

  **VPC Endpoints**  VPC → Endpoints            S3 (Gateway),
                                                ECR/Logs/SecretsManager
                                                (Interface, 2 AZs)

  **Security Groups  EC2 → Security Groups      ALB (443/80), EC2 (8001
  (4)**                                         from ALB), RDS (5432 from
                                                EC2), NAT (all from
                                                private)
  ------------------------------------------------------------------------

**Validation**: Flow logs → CloudWatch, test connectivity from test
instance.

------------------------------------------------------------------------

### Phase 2: Database & Storage (Week 1--2 --- 3--4 hours)

  ----------------------------------------------------------------------------------------------
  Resource           Console Path               Key Settings
  ------------------ -------------------------- ------------------------------------------------
  **RDS PostgreSQL** RDS → Create Database      Standard Create, PostgreSQL 16, Free Tier
                                                eligible: **No** (use db.t3.medium), Single-AZ,
                                                100 GB GP3, 3K IOPS, encrypted, deletion
                                                protection, backup retention 7 days, maintenance
                                                window Sun 03:00--04:00

  **DB Subnet        RDS → Subnet Groups        Include both Private Data subnets
  Group**                                       

  **Parameter        RDS → Parameter Groups     Family: postgres16,
  Group**                                       `shared_preload_libraries=pg_stat_statements`,
                                                `log_min_duration_statement=1000`

  **S3 Buckets (2)** S3 → Create Bucket         `maison-hygia-assets-prod`,
                                                `maison-hygia-web-prod` --- Block Public Access
                                                ON, Versioning ON, SSE-S3, CORS for assets
                                                bucket

  **CloudFront (3    CloudFront → Create        **Web**: S3 Website endpoint origin, 403/404 →
  Distributions)**   Distribution               `/index.html`, PriceClass_100, ACM cert;
                                                **Assets**: S3 REST origin + OAC, cache policy
                                                optimized; **API**: ALB origin (later), cache
                                                disabled
  ----------------------------------------------------------------------------------------------

**Validation**: `psql -h <rds-endpoint> -U postgres`, S3
upload/download, CloudFront URLs serve content.

------------------------------------------------------------------------

### Phase 3: Authentication --- Cognito (Week 2 --- 3--4 hours)

  -----------------------------------------------------------------------------------------------
  Resource           Console Path               Key Settings
  ------------------ -------------------------- -------------------------------------------------
  **User Pool**      Cognito → Create User Pool Email auth, required attributes: email,
                                                custom:role (String), MFA: Optional, Password
                                                policy: 8 chars + complexity

  **App Client       User Pool → App            Public client, Auth flows: USER_SRP_AUTH,
  (SPA)**            Integration                REFRESH_TOKEN_AUTH, OAuth: Code grant, scopes:
                                                openid/email/profile, Callback:
                                                `https://maisonhygia.adityanair.tech/callback`,
                                                Logout: `https://maisonhygia.adityanair.tech/`

  **App Client       User Pool → App            Confidential client, Generate secret, Auth flows:
  (Backend)**        Integration                ADMIN_USER_PASSWORD_AUTH

  **User Pool        User Pool → Branding       Custom domain:
  Domain**                                      `auth.maisonhygia.adityanair.tech`, ACM cert from
                                                Phase 0

  **Groups**         Users → Groups             Create: `admin`, `editor`, `customer`

  **Pre-token        Lambda → Create Function   Python 3.12, reads `custom:role`, adds to
  Lambda**                                      `cognito:groups` claim, attach to User Pool
                                                triggers

  **Email            User Pool → Messaging      SendGrid SMTP: `smtp.sendgrid.net:587`,
  Configuration**                               credentials from Phase 0, FROM:
                                                `no-reply@maisonhygia.adityanair.tech`
  -----------------------------------------------------------------------------------------------

**Validation**: Hosted UI loads at custom domain, sign-up → email
received → sign-in → JWT decoded has `cognito:groups`.

------------------------------------------------------------------------

### Phase 4: Compute --- EC2 ASG (Week 2--3 --- 6--8 hours)

  ------------------------------------------------------------------------------------
  Step               Action                   Details
  ------------------ ------------------------ ----------------------------------------
  **4.1**            Launch Test Instance     EC2 → Launch Instance: Amazon Linux
                                              2023, t3.medium, App Subnet AZ A,
                                              Security Group: EC2, IAM Role:
                                              `EC2InstanceProfile` (create: ECR Read,
                                              Secrets Read, SSM, CloudWatch Logs),
                                              User Data: Phase 4.2 script

  **4.2**            Iterate User Data Script SSH via Session Manager, test: Docker
                                              install, ECR pull, app start, health
                                              check, CloudWatch agent, SSM agent.
                                              Refine until 100% reliable.

  **4.3**            Create Golden AMI        EC2 → Instances → Actions → Image and
                                              Templates → Create Image. Name:
                                              `maison-hygia-golden-v1`. Wait for
                                              `available`.

  **4.4**            Create Launch Template   EC2 → Launch Templates → Create: AMI =
                                              Golden AMI, Instance Type: t3.medium,
                                              IAM Profile, Security Group, User Data:
                                              minimal (just
                                              `systemctl start maison-hygia`), Tag
                                              specifications.

  **4.5**            Create Target Group      EC2 → Target Groups → Create: HTTP:8001,
                                              Health Check: `/health`, 30s interval,
                                              5s timeout, Healthy: 2, Unhealthy: 3,
                                              Deregistration Delay: 30s.

  **4.6**            Create ALB               EC2 → Load Balancers → Application:
                                              Internet-facing, HTTPS:443 (ACM cert),
                                              HTTP:80 → Redirect 443, Subnets: Both
                                              Public, Security Group: ALB, Default
                                              Action: Forward to Target Group.

  **4.7**            Create Auto Scaling      EC2 → Auto Scaling Groups → Create:
                     Group                    Launch Template (latest), VPC: App
                                              Subnets (both AZs), Target Group:
                                              Attach, Capacity: Min=2, Desired=2,
                                              Max=10, Mixed Instances: Base=1 OD, 50%
                                              Spot above base, Capacity Optimized.

  **4.8**            Configure Scaling        ASG → Automatic Scaling → Target
                     Policies                 Tracking: CPU 60%, RPS 1000/min.
                                              Scheduled: Night 02:00 UTC Min=1, Day
                                              06:00 UTC Min=2.

  **4.9**            Secrets Manager Secrets  Secrets Manager → Store:
                                              `maison-hygia/prod/database`
                                              (DATABASE_URL),
                                              `maison-hygia/prod/stripe`
                                              (STRIPE_SECRET_KEY,
                                              STRIPE_WEBHOOK_SECRET),
                                              `maison-hygia/prod/cognito`
                                              (COGNITO_CLIENT_SECRET,
                                              COGNITO_USER_POOL_ID,
                                              COGNITO_APP_CLIENT_ID),
                                              `maison-hygia/prod/app` (JWT_SECRET,
                                              ENCRYPTION_KEY).

  **4.10**           Parameter Store          Systems Manager → Parameter Store:
                     Parameters               `/maison-hygia/prod/CORS_ORIGINS`,
                                              `/maison-hygia/prod/LOG_LEVEL`,
                                              `/maison-hygia/prod/S3_ASSETS_BUCKET`,
                                              `/maison-hygia/prod/CF_ASSETS_DOMAIN`.
  ------------------------------------------------------------------------------------

**Validation**: ALB DNS → `/health` returns 200, ASG scales on load
test, secrets inject into container.

------------------------------------------------------------------------

### Phase 5: Backend Code Changes (Week 3 --- 4--6 hours)

  ------------------------------------------------------------------------------
  Change                File                  Description
  --------------------- --------------------- ----------------------------------
  **Health Endpoint**   `backend/main.py`     `GET /health` → checks DB, returns
                                              JSON

  **Graceful Shutdown** `backend/main.py`     SIGTERM handler, drains
                                              connections, 30s timeout

  **Cognito Auth**      `backend/auth.py`     Replace Supabase JWKS → Cognito
                                              JWKS, validate `cognito:groups`
                                              for admin

  **Config Management** `backend/config.py`   Pydantic Settings loading from
                        (new)                 `.env` (populated from SSM/Secrets
                                              at boot)

  **Structured          `backend/main.py`     JSON formatter, stdout, include
  Logging**                                   trace_id

  **Admin Extensions**  `backend/routes.py`   Add: `/analytics/*`, `/users`,
                                              `/upload-url` (presigned S3), bulk
                                              inventory

  **S3 Integration**    `backend/routes.py`   Replace local file save →
                                              presigned URL generation, store S3
                                              key in `Product.image_url`
  ------------------------------------------------------------------------------

**Validation**: Local Docker test with Cognito JWT, health check passes,
admin endpoints work.

------------------------------------------------------------------------

### Phase 6: Frontend & Admin Dashboard (Week 3--5 --- 20--30 hours)

  ------------------------------------------------------------------------
  Component                Stack           Key Features
  ------------------------ --------------- -------------------------------
  **Customer Frontend**    Existing Vite + Deploy `dist/` to S3 Web
                           Vanilla JS      Bucket, CloudFront invalidation

  **Admin Dashboard        React 18 +      Separate repo or
  (New)**                  Vite +          `/admin-dashboard` folder
                           TypeScript +    
                           Tailwind        

  **Admin Pages**                          

  • Login                  Cognito Hosted  PKCE flow, JWT storage in
                           UI redirect     memory

  • Dashboard              KPI cards,      Revenue, orders, users,
                           Recharts        conversion

  • Products               TanStack        CRUD, variants inline, image
                           Table + React   upload (presigned),
                           Hook Form       search/filter/paginate

  • Orders                 Table + Detail  Status dropdown, Stripe refund
                           Modal           button, timeline

  • Users                  Cognito         Role badge
                           ListUsers API   (admin/editor/customer), assign
                                           role, disable

  • Inventory              Table + Bulk    Checkbox grid, low-stock badge,
                           Edit            save all

  • Settings               Key-Value       Site config (JSON), Email
                           Editor          Templates (React Email preview)

  **State/Api**            TanStack        Optimistic updates, auth
                           Query + Axios   interceptor, 401 → redirect to
                                           Hosted UI

  **Responsive**           Tailwind + CSS  Mobile-first, sidebar collapse,
                           Grid            table→cards \<768px

  **Accessibility**        ARIA, Focus     Keyboard nav, screen reader
                           Management      labels, contrast
  ------------------------------------------------------------------------

**Build & Deploy**: `npm run build` → `dist/` → S3 Web Bucket (separate
prefix or bucket) → CloudFront Invalidation.

------------------------------------------------------------------------

### Phase 6.5: Image Upload Flow (Admin Dashboard)

    Admin UI (React)
         │
         ▼
    GET /api/v1/admin/upload-url?filename=x.png&folder=products
         │
         ▼
    Returns: { "url": "https://s3.amazonaws.com/...", "key": "products/uuid_x.png", "public_url": "https://assets.maisonhygia.adityanair.tech/products/uuid_x.png" }
         │
         ▼
    PUT directly to presigned URL (browser → S3)
         │
         ▼
    On success: PATCH /api/v1/admin/products/{id} { "image_url": "products/uuid_x.png" }
         │
         ▼
    CloudFront serves at https://assets.maisonhygia.adityanair.tech/products/uuid_x.png

------------------------------------------------------------------------

### Phase 7: CI/CD Pipeline (Week 5 --- 3--4 hours)

  ------------------------------------------------------------------------
  Pipeline               Tool          Trigger             Steps
  ---------------------- ------------- ------------------- ---------------
  **Backend**            GitHub        Push to `main`      Test → Build
                         Actions                           Docker → Push
                                                           ECR (sha-tag) →
                                                           Update Launch
                                                           Template
                                                           Version → ASG
                                                           Instance
                                                           Refresh → Wait
                                                           Stable

  **Frontend**           GitHub        Push to `main`      Build Vite →
                         Actions                           Sync `dist/` to
                                                           S3 Web Bucket →
                                                           CloudFront
                                                           Invalidation

  **Admin Dashboard**    GitHub        Push to `main`      Build Vite →
                         Actions                           Sync to S3
                                                           Admin Bucket →
                                                           CloudFront
                                                           Invalidation
  ------------------------------------------------------------------------

**GitHub Secrets Required**: - `AWS_ACCOUNT_ID` - `AWS_ROLE_ARN` (OIDC
role for GitHub Actions) - `ECR_REPOSITORY` - `LAUNCH_TEMPLATE_ID` -
`ASG_NAME` - `WEB_BUCKET`, `ADMIN_BUCKET`, `ASSETS_BUCKET` -
`CLOUDFRONT_WEB_DIST_ID`, `CLOUDFRONT_ADMIN_DIST_ID`,
`CLOUDFRONT_ASSETS_DIST_ID`

**OIDC Role Trust Policy**:

``` json
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

------------------------------------------------------------------------

### Phase 8: Monitoring & Operations (Week 5--6 --- 3--4 hours)

  ----------------------------------------------------------------------------
  Component                                   Setup
  ------------------------------------------- --------------------------------
  **CloudWatch Dashboard**                    Create: `MaisonHygia-Prod` ---
                                              Widgets: EC2 CPU/Mem (ASG avg),
                                              ALB Latency/5XX/RPS, RDS
                                              CPU/Connections/Storage, Custom:
                                              Orders/min

  **Log Groups**                              `/aws/ec2/maison-hygia/app`,
                                              `/aws/ec2/maison-hygia/access`
                                              --- Retention: 30 days

  **CloudWatch Agent**                        On Golden AMI: Config for logs +
                                              metrics (CPU, Mem, Disk)

  **Critical Alarms**                         (See Section 2.11) → SNS Topic →
                                              Email Subscription

  **SNS Topic**                               `maison-hygia-alerts` → Email:
                                              your address

  **Budget Alerts**                           AWS Budgets → Create: Staging
                                              (\$75 forecast), Production
                                              (\$200 forecast) → SNS Topic
  ----------------------------------------------------------------------------

------------------------------------------------------------------------

### Phase 9: Testing & Validation (Week 6 --- 4--6 hours)

  ---------------------------------------------------------------------------------------------------------------
  Test               Method                                                  Pass Criteria
  ------------------ ------------------------------------------------------- ------------------------------------
  **Health Check**   `curl https://api.maisonhygia.adityanair.tech/health`   200, DB healthy

  **Auth Flow**      Browser: Sign up → Email → Sign in → Access admin       JWT has `cognito:groups: ["admin"]`

  **Product CRUD**   Admin UI: Create → Edit → Image Upload → Delete         DB + S3 + CloudFront consistent

  **Checkout Flow**  Customer: Add to cart → Checkout → Stripe Test →        End-to-end works
                     Webhook → Order in Admin                                

  **Auto-Scaling**   `hey -z 5m -c 50 https://api.../health`                 ASG scales out, scales in after

  **Instance         Push commit → Watch ASG refresh                         Zero downtime, health checks pass
  Refresh**                                                                  

  **Failover**       Terminate EC2 instance manually                         ASG replaces, ALB reroutes in \<60s

  **Budget Alert**   Set budget to \$1 → Trigger                             Email received
  ---------------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

### Phase 10: Production Cutover (Week 7 --- 2--3 hours)

  -----------------------------------------------------------------------
  Step                           Action
  ------------------------------ ----------------------------------------
  10.1                           Duplicate stack for Production workspace
                                 (Terraform later) or manually create
                                 prod resources with `-prod` suffix

  10.2                           Update DNS:
                                 `maisonhygia.adityanair.tech` → Prod
                                 CloudFront, `api...` → Prod ALB

  10.3                           Update Stripe Webhook URL to Production
                                 ALB

  10.4                           Update Cognito Callback URLs to
                                 Production Domain

  10.5                           Run full validation suite against
                                 Production

  10.6                           Enable Budget Alerts for Production

  10.7                           Document runbooks: Deploy, Rollback,
                                 Scale, Incident Response
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 5. Admin Dashboard Detailed Specification

### Tech Stack

-   **Framework**: React 18 + TypeScript + Vite
-   **Styling**: Tailwind CSS (JIT), Headless UI for accessible
    components
-   **State**: TanStack Query v5 (server state), Zustand (client state:
    sidebar, theme)
-   **Forms**: React Hook Form + Zod validation
-   **Tables**: TanStack Table v8 (sorting, filtering, pagination,
    column visibility)
-   **Charts**: Recharts (AreaChart for revenue, BarChart for top
    products)
-   **Icons**: Lucide React
-   **Date**: date-fns
-   **Email Preview**: React Email (render in iframe)

### Component Hierarchy

    App
    ├── AuthProvider (Cognito Auth Context)
    ├── QueryProvider (TanStack Query)
    ├── ThemeProvider (Dark/Light)
    ├── Router (React Router v6)
    │   ├── /login → LoginPage (redirects to Hosted UI)
    │   ├── /callback → CallbackPage (exchanges code for tokens)
    │   ├── /admin/* (ProtectedRoute → requires admin group)
    │   │   ├── Layout (Sidebar + Header + Main)
    │   │   ├── DashboardPage (KPICards + RevenueChart + RecentOrders)
    │   │   ├── ProductsPage
    │   │   │   ├── ProductsTable (TanStack Table)
    │   │   │   ├── ProductFormModal (Create/Edit)
    │   │   │   │   ├── VariantFormArray (dynamic)
    │   │   │   │   ├── ImageUploadDropzone (Presigned PUT)
    │   │   │   ├── BulkActionToolbar
    │   │   ├── OrdersPage
    │   │   │   ├── OrdersTable
    │   │   │   ├── OrderDetailModal (Items, Customer, Timeline, Refund Button)
    │   │   ├── UsersPage
    │   │   │   ├── UsersTable (Cognito ListUsers + Local Orders Join)
    │   │   │   ├── RoleAssignModal (Cognito AdminAddUserToGroup)
    │   │   ├── InventoryPage
    │   │   │   ├── InventoryTable (Low Stock Badge)
    │   │   │   ├── BulkInventoryGrid (Checkbox + Quantity Inputs)
    │   │   ├── SettingsPage
    │   │   │   ├── SiteConfigEditor (JSON Schema Form)
    │   │   │   ├── EmailTemplateEditor (React Email Preview)

### API Contract (Admin Endpoints)

  ---------------------------------------------------------------------------------------------------
  Endpoint                                 Method                Auth        Description
  ---------------------------------------- --------------------- ----------- ------------------------
  `/api/v1/admin/products`                 GET                   Admin       Paginated, search,
                                                                             filter

  `/api/v1/admin/products`                 POST                  Admin       Create product +
                                                                             variants

  `/api/v1/admin/products/{id}`            PUT                   Admin       Update product + sync
                                                                             variants

  `/api/v1/admin/products/{id}`            DELETE                Admin       Cascade delete

  `/api/v1/admin/upload-url`               POST                  Admin       Returns presigned S3 PUT
                                                                             URL

  `/api/v1/admin/orders`                   GET                   Admin       Paginated, status filter

  `/api/v1/admin/orders/{id}`              GET                   Admin       Full detail

  `/api/v1/admin/orders/{id}/status`       PUT                   Admin       Update status

  `/api/v1/admin/orders/{id}/refund`       POST                  Admin       Stripe refund

  `/api/v1/admin/users`                    GET                   Admin       Cognito users + local
                                                                             order count

  `/api/v1/admin/users/{id}/role`          PUT                   Admin       Update Cognito group

  `/api/v1/admin/inventory`                GET                   Admin       All variants with stock

  `/api/v1/admin/inventory/bulk`           PUT                   Admin       Array of {variant_id,
                                                                             quantity}

  `/api/v1/admin/analytics/revenue`        GET                   Admin       Daily revenue last 30d

  `/api/v1/admin/analytics/top-products`   GET                   Admin       Top 10 by revenue

  `/api/v1/admin/settings`                 GET/PUT               Admin       Site config key-value

  `/api/v1/admin/email-templates`          GET/POST/PUT/DELETE   Admin       CRUD for templates
  ---------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 6. Cost Breakdown (Monthly, Post-Free-Tier)

  Component             Config                              Monthly Cost
  --------------------- ----------------------------------- ----------------
  **EC2 ASG**           2× t3.medium (1 OD + 1 Spot)        \~\$35
  **RDS**               db.t3.medium Single-AZ, 100GB GP3   \~\$55
  **ALB**               1 LCU average                       \~\$18
  **NAT Gateway**       1 AZ, \~50 GB/mo                    \~\$32
  **VPC Endpoints**     4 Interface × 2 AZs                 \~\$56
  **CloudFront + S3**   Web + Assets, \~200 GB/mo           \~\$15
  **Secrets Manager**   5 secrets                           \~\$2
  **Parameter Store**   10 params (Standard)                \~\$0.50
  **CloudWatch**        Logs (5 GB), Metrics, Alarms        \~\$15
  **Cognito**           \<50K MAU                           Free
  **SendGrid**          Free Tier (100/day)                 Free
  **Route 53**          Hosted Zone + Queries               \~\$0.50
  **ACM**               Public Certificates                 Free
  **Total**                                                 **\~\$229/mo**

**With 12-Month Free Tier** (EC2 750hrs, RDS 750hrs, ALB 750hrs,
CloudFront 1TB): **\~\$80--100/mo**

**Staging (Minimal)**: 1× t3.small Spot, Shared RDS, No NAT →
**\~\$40/mo**

------------------------------------------------------------------------

## 7. Security Checklist (Manual Verification)

  -----------------------------------------------------------------------
  Control               Verification Method
  --------------------- -------------------------------------------------
  **No Public EC2**     Confirm EC2 in Private Subnets, no Public IP

  **ALB HTTPS Only**    HTTP → HTTPS redirect, TLS 1.2+

  **Security Groups     ALB: 443 from 0.0.0.0/0; EC2: 8001 from ALB SG
  Least Privilege**     only; RDS: 5432 from EC2 SG only

  **Secrets Not in      Grep repo for passwords/keys --- zero results
  Code**                

  **Cognito MFA         Test login without MFA, then enable for admin
  Optional**            user

  **IAM Roles Scoped**  EC2 Role: Only ECR Read, Secrets Read, SSM, Logs

  **S3 Buckets          Block Public Access ON, OAC for CloudFront only
  Private**             

  **RDS Encrypted**     Confirm encryption at rest + in transit (TLS)

  **CloudTrail          Management Events logged
  Enabled**             

  **GuardDuty Enabled** 30-day trial, then \~\$4/mo

  **WAF on ALB**        AWSManagedRulesCommonRuleSet + Rate Limit (2000
                        req/5min/IP)
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 8. Runbook Templates (To Create)

  ------------------------------------------------------------------------
  Runbook                Trigger                Key Steps
  ---------------------- ---------------------- --------------------------
  **Deploy Backend**     Git push main          Actions → Build → ECR →
                                                Launch Template vN → ASG
                                                Refresh → Monitor

  **Rollback Backend**   Failed deploy          Previous Launch Template
                                                version → ASG Refresh

  **Scale Up Emergency** High CPU Alarm         Console → ASG → Increase
                                                Desired Capacity

  **RDS Storage Full**   Alarm \<2GB            Console → RDS → Modify →
                                                Increase Storage

  **Stripe Webhook       5xx Alarm              Check ALB logs → Verify
  Failing**                                     webhook secret → Check EC2
                                                logs

  **Cognito Auth         User reports           Check User Pool → Events →
  Issues**                                      Verify Email Config
                                                (SendGrid)

  **Image Upload         Admin reports          Verify S3 Bucket Policy →
  Broken**                                      OAC → Presigned URL
                                                Generation

  **Database Migration** Schema change          Pre-deploy Snapshot → Run
                                                Migration → Validate →
                                                (Rollback: Restore
                                                Snapshot)
  ------------------------------------------------------------------------

------------------------------------------------------------------------

## 9. Submission Deliverables for Maison Hygia

  ------------------------------------------------------------------------------------------------
  Artifact                   Format                                        Purpose
  -------------------------- --------------------------------------------- -----------------------
  **Architecture Diagram**   PNG/SVG (draw.io or Lucidchart)               Visual summary for
                                                                           reviewers

  **Live Demo URLs**         `https://maisonhygia.adityanair.tech`         Interactive evaluation
                             (customer),                                   
                             `https://maisonhygia.adityanair.tech/admin`   
                             (admin)                                       

  **Admin Credentials**      Demo admin account                            Reviewer can test admin
                                                                           features

  **API Documentation**      OpenAPI/Swagger UI at `/docs`                 Technical evaluation

  **Cost Analysis**          One-pager with free tier timeline             Business viability

  **Security Overview**      Checklist + WAF + Encryption                  Compliance posture

  **Scaling Demo**           Video or live load test                       Architecture
                                                                           credibility

  **GitHub Repository**      Clean README, CI/CD visible                   Code quality
  ------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 10. Future Enhancements (Post-Submission)

  Priority   Enhancement                                         Effort
  ---------- --------------------------------------------------- ---------
  **P1**     Terraform All Resources                             20 hrs
  **P1**     Multi-AZ RDS + Cross-Region Snapshot                4 hrs
  **P2**     X-Ray Distributed Tracing                           4 hrs
  **P2**     Synthetic Canaries (3 Regions)                      2 hrs
  **P3**     Admin Analytics (Revenue, Funnel, Cohort)           12 hrs
  **P3**     Image Processing Lambda (Resize, WebP, Watermark)   8 hrs
  **P4**     Multi-Account (Prod/Staging Isolation)              16 hrs
  **P4**     Blue/Green CodeDeploy                               8 hrs
  **P5**     Kubernetes (EKS) Migration                          40+ hrs

------------------------------------------------------------------------

## 11. Manual AWS Creation Checklist (Phase Order)

    [ ] Phase 0: Prerequisites
        [ ] AWS Account + MFA + Billing Alerts
        [ ] Domain in Route 53 (or delegated)
        [ ] ACM Wildcard Cert: *.maisonhygia.adityanair.tech
        [ ] SendGrid Domain Verified + SMTP Creds
        [ ] Stripe Test Keys
        [ ] AWS CLI Configured

    [ ] Phase 1: Network
        [ ] VPC (10.0.0.0/16)
        [ ] 6 Subnets (2 AZs × Public/App/Data)
        [ ] IGW + 1 NAT Gateway (AZ A)
        [ ] Route Tables (Public→IGW, Private→NAT)
        [ ] VPC Endpoints (S3 Gateway, ECR/Logs/SecretsManager Interface ×2 AZ)
        [ ] 4 Security Groups (ALB, EC2, RDS, NAT)

    [ ] Phase 2: Data & Storage
        [ ] RDS PostgreSQL 16, db.t3.medium, Single-AZ, 100GB GP3
        [ ] DB Subnet Group (Private Data Subnets)
        [ ] Parameter Group (pg_stat_statements)
        [ ] S3: assets bucket + web bucket (+ admin bucket)
        [ ] CloudFront: Web Dist + Assets Dist (+ Admin Dist later)

    [ ] Phase 3: Cognito
        [ ] User Pool (Email, custom:role, MFA Optional)
        [ ] App Client SPA (Public, PKCE, OAuth Code Grant)
        [ ] App Client Backend (Confidential, Secret)
        [ ] Custom Domain: auth.maisonhygia.adityanair.tech
        [ ] Groups: admin, editor, customer
        [ ] Pre-token Lambda (custom:role → cognito:groups)
        [ ] SendGrid SMTP Configuration

    [ ] Phase 4: Compute
        [ ] IAM Role: EC2InstanceProfile (ECR, Secrets, SSM, Logs)
        [ ] Test EC2 Instance (User Data Iteration)
        [ ] Golden AMI from Test Instance
        [ ] Launch Template (Golden AMI, Minimal User Data)
        [ ] Target Group (HTTP:8001, Health Check /health)
        [ ] ALB (HTTPS:443 ACM, HTTP→HTTPS Redirect)
        [ ] ASG (Launch Template, Mixed Instances 50% Spot, Min=2/Max=10)
        [ ] Scaling Policies (CPU 60%, RPS 1000, Scheduled Night/Day)
        [ ] Secrets Manager (4 Secrets)
        [ ] Parameter Store (6 Params)

    [ ] Phase 5: Backend Code
        [ ] Health Endpoint
        [ ] Graceful Shutdown
        [ ] Cognito Auth (Replace Supabase)
        [ ] Config Management (Pydantic Settings)
        [ ] JSON Logging
        [ ] Admin Extensions (Analytics, Users, Presigned URL, Bulk Inventory)

    [ ] Phase 6: Frontend & Admin
        [ ] Customer Frontend → S3 Web Bucket → CloudFront
        [ ] Admin Dashboard (React + Vite + TS + Tailwind)
        [ ] All P0+P1 Pages Implemented
        [ ] Admin → S3 Admin Bucket → CloudFront

    [ ] Phase 7: CI/CD
        [ ] GitHub OIDC Role
        [ ] Backend Workflow (Test → ECR → LT Update → ASG Refresh)
        [ ] Frontend Workflow (Build → S3 Sync → CF Invalidate)
        [ ] Admin Workflow (Build → S3 Sync → CF Invalidate)

    [ ] Phase 8: Monitoring
        [ ] CloudWatch Dashboard
        [ ] Log Groups (30-day retention)
        [ ] CloudWatch Agent on AMI
        [ ] Critical Alarms → SNS → Email
        [ ] Budget Alerts (Staging $75, Prod $200)

    [ ] Phase 9: Testing
        [ ] Health Check
        [ ] Auth Flow (Signup → Email → Login → Admin)
        [ ] Product CRUD + Image Upload
        [ ] Checkout Flow (Cart → Stripe → Webhook → Order)
        [ ] Auto-Scaling (Load Test)
        [ ] Instance Refresh (Deploy)
        [ ] Failover (Terminate Instance)
        [ ] Budget Alert Trigger

    [ ] Phase 10: Production Cutover
        [ ] Prod Resources (or Workspace)
        [ ] DNS Switchover
        [ ] Stripe Webhook URL Update
        [ ] Cognito Callback URL Update
        [ ] Full Validation
        [ ] Runbooks Documented

------------------------------------------------------------------------

## 12. Open Questions for Claude.ai Review

When you share this with Claude, ask it to evaluate:

1.  **Spot Instance Risk**: Is 50% Spot too aggressive for a demo?
    Should we start 100% On-Demand and add Spot after stability proven?
2.  **Single-AZ RDS**: For a case study submission, does Single-AZ
    undermine "production-ready" narrative? Worth the \$55/mo for
    Multi-AZ credibility?
3.  **Golden AMI Timing**: Is Week 3 too early to create AMI? Should we
    wait until after load testing?
4.  **Admin Dashboard Scope**: Is P0+P1 (6 pages) too ambitious for 2
    weeks? Should we cut Email Templates?
5.  **SendGrid vs SES**: SES is cheaper (\$0.10/1000) but requires
    domain verification + sandbox exit. SendGrid free tier easier. Which
    for prototype?
6.  **Staging Environment**: "Minimal" = 1 t3.small Spot, shared RDS. Is
    shared RDS risky for schema migrations?
7.  **Cognito Pre-token Lambda**: Adds complexity. Can we use
    `custom:role` directly in backend via `user.get("custom:role")`
    instead of group claim?
8.  **Image Upload**: Direct S3 PUT works but no server-side validation
    (file type, size). Add Lambda@Edge or post-upload scan?
9.  **Monitoring Gaps**: No RUM, no X-Ray, no Synthetic Canaries.
    Acceptable for prototype?
10. **Terraform Later**: What's the migration path from manual →
    Terraform? `terraforming` tool or manual import?

------------------------------------------------------------------------

## 13. Next Steps for You

1.  **Execute Phase 0--1 manually** in AWS Console this week
2.  **Validate each phase** before moving to next
3.  **Document actual values** (ARNs, IDs, endpoints) in a
    `manual-deployment-notes.md`
4.  **Share this plan.md with Claude.ai** for review
5.  **Report back** with Claude's feedback + any blockers
6.  **We'll iterate** on the plan before you proceed to Phase 2+

------------------------------------------------------------------------

This plan is designed for **manual execution first, Terraform
codification later** --- giving you deep AWS console familiarity
(valuable for interviews) while building a production-grade prototype.
Each phase is independently verifiable before proceeding.
