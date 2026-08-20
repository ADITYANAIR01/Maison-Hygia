# SECRETS — what you must provide to make the full project work

Everything below is what the code/config expects. Values already live in AWS from the
CLI build are marked **[DONE]**; blank/placeholder ones are **TODO — you must supply**.

> **Never commit real secrets to git.** This file holds names/where-to-put-them, not
> actual values. Real values live in AWS Secrets Manager / GitHub encrypted secrets / your `.env`.

---

## 1. Local development — `.env` (copy of `.env.example`)

| Variable | Status | Value / where to get it |
|---|---|---|
| `DATABASE_URL` | **TODO** | `postgresql://user:pw@host:5432/maison_hygia` (local) — or the RDS URL from Secrets Manager for prod |
| `STRIPE_SECRET_KEY` | **TODO** | Stripe dashboard → `sk_test_...` (test) / `sk_live_...` (live) |
| `STRIPE_WEBHOOK_SECRET` | **TODO** | Stripe dashboard → webhook signing secret `whsec_...` |
| `COGNITO_USER_POOL_ID` | **[DONE]** | `ap-south-1_RVeefRjjt` |
| `COGNITO_APP_CLIENT_ID` | **[DONE]** | `31iq2cmvv4i8tplpj00f0pfkl2` |
| `AWS_REGION` | **[DONE]** | `ap-south-1` |
| `S3_ASSETS_BUCKET` | **[DONE]** | `maison-hygia-assets-prod` |
| `CF_ASSETS_DOMAIN` | **[DONE]** | `assets.maisonhygia.adityanair.tech` (or the CloudFront default domain until DNS is set up) |
| `FRONTEND_URL` | **[DONE]** | `http://localhost:8000` |
| `BACKEND_URL` | **[DONE]** | `http://127.0.0.1:8001` |
| `ALLOWED_ORIGINS` | **TODO** | add `http://localhost:8002` for the admin dashboard |
| `AUTO_CREATE_SCHEMA` | **[DONE]** | `true` locally, `false` in prod |
| `LOG_LEVEL` | **[DONE]** | `INFO` |

---

## 2. AWS Secrets Manager (ap-south-1)

Created by the build with placeholder values; replace the TODO ones in the console or via CLI.

| Secret name | Keys inside | Status |
|---|---|---|
| `maison-hygia/prod/database` | `DATABASE_URL` (real RDS URL incl. password) | **[DONE]** |
| `maison-hygia/prod/cognito` | `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `COGNITO_CLIENT_ID` | **[DONE]** |
| `maison-hygia/prod/stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **TODO** — real Stripe keys |
| `maison-hygia/prod/sendgrid` | `SENDGRID_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | **TODO** — SendGrid SMTP (only needed if you switch Cognito from default email) |

Update example:

```bash
aws secretsmanager update-secret --secret-id maison-hygia/prod/stripe \
  --secret-string '{"STRIPE_SECRET_KEY":"sk_test_xxx","STRIPE_WEBHOOK_SECRET":"whsec_xxx"}' \
  --region ap-south-1
```

---

## 3. AWS Systems Manager Parameter Store (ap-south-1) — all **[DONE]**

| Parameter | Value |
|---|---|
| `/maison-hygia/prod/CORS_ORIGINS` | `https://admin.maisonhygia.adityanair.tech,https://maisonhygia.adityanair.tech` |
| `/maison-hygia/prod/LOG_LEVEL` | `INFO` |
| `/maison-hygia/prod/S3_ASSETS_BUCKET` | `maison-hygia-assets-prod` |
| `/maison-hygia/prod/CF_ASSETS_DOMAIN` | `assets.maisonhygia.adityanair.tech` |
| `/maison-hygia/prod/COGNITO_USER_POOL_ID` | `ap-south-1_RVeefRjjt` |
| `/maison-hygia/prod/COGNITO_APP_CLIENT_ID` | `31iq2cmvv4i8tplpj00f0pfkl2` |
| `/maison-hygia/prod/AWS_REGION` | `ap-south-1` |

---

## 4. Admin dashboard meta tags — `admin-dashboard/index.html`

| Meta tag | Current / needed | Status |
|---|---|---|
| `cognito-domain` | must be `maison-hygia-auth.auth.ap-south-1.amazoncognito.com` | **TODO** — currently `auth.maisonhygia.adityanair.tech` (won't resolve) |
| `cognito-client-id` | `31iq2cmvv4i8tplpj00f0pfkl2` | **[DONE]** |
| `api-base-url` | your API endpoint (ALB DNS or CloudFront web domain) | **TODO** |

**Code change required:** `admin-dashboard/js/auth.js` uses `/admin#callback` as the OAuth
redirect URI. Cognito rejects URL fragments, so the callback URL was registered without the
fragment. The dashboard must read the `code` from the query string instead of `location.hash`.

---

## 5. AWS Certificate Manager + DNS (blocks custom domains)

| Item | Value | Status |
|---|---|---|
| Wildcard cert `*.maisonhygia.adityanair.tech` | ARN `arn:aws:acm:us-east-1:121490076448:certificate/21a797cb-1bb0-41b8-aed4-31e49509531d` | **TODO** — PENDING_VALIDATION; add the CNAME at your `adityanair.tech` registrar |
| Route 53 hosted zone `adityanair.tech` | does not exist — create it + point the registrar's NS records | **TODO** |
| Route 53 records | web/admin/api/auth/assets → CloudFront/ALB/Cognito | **TODO** |
| ALB HTTPS:443 listener | needs the issued cert | **TODO** (ALB is HTTP:80 until then) |

---

## 6. GitHub Actions secrets (CI/CD deploy)

All values are in `infra/cloudformation/STACK_RECORDS.md`. Create the OIDC role first (trust policy in README §10.2).

| Secret | Value / where from |
|---|---|
| `AWS_ACCOUNT_ID` | `121490076448` |
| `AWS_ROLE_ARN` | **TODO** — create GitHub Actions OIDC role, set its ARN |
| `ECR_REPOSITORY` | `121490076448.dkr.ecr.ap-south-1.amazonaws.com/maison-hygia/backend` |
| `LAUNCH_TEMPLATE_ID` | `lt-0b72226135739083f` |
| `ASG_NAME` | `maison-hygia-prod-asg` |
| `WEB_BUCKET` | `maison-hygia-web-prod` |
| `ADMIN_BUCKET` | `maison-hygia-admin-prod` |
| `ASSETS_BUCKET` | `maison-hygia-assets-prod` |
| `CLOUDFRONT_WEB_DIST_ID` | `E3I9Z4HMV6A7O8` |
| `CLOUDFRONT_ADMIN_DIST_ID` | `E2IHIFY9VSGZSC` |
| `CLOUDFRONT_ASSETS_DIST_ID` | `ES6DWR3Z2JLV9` |

---

## 7. Notifications

| Item | Value | Status |
|---|---|---|
| SNS topic `maison-hygia-alerts` email | `maison-hygia-alerts@example.com` | **TODO** — replace with your real email and confirm the subscription |
| Stripe webhook URL | `https://api.maisonhygia.adityanair.tech/payment/webhook` (event: `checkout.session.completed`) | **TODO** — configure in Stripe dashboard once DNS exists |

---

## Priority order to get the project fully working

1. **Local:** real `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` in `.env`; set `ALLOWED_ORIGINS` for the admin port.
2. **AWS:** real Stripe values in Secrets Manager `maison-hygia/prod/stripe`.
3. **Admin dashboard:** fix meta tags + `auth.js` callback parsing.
4. **DNS:** validate the ACM cert, create Route 53 zone + records, add ALB HTTPS listener.
5. **CI/CD:** create the OIDC role + set the 11 GitHub secrets.
6. **Ops:** confirm the SNS email; set the Stripe webhook URL.