# Maison Hygia — AWS Build Records & CloudFormation

This directory contains the CloudFormation template that reproduces the AWS infrastructure
that was first built manually via the AWS CLI (README §11 "Phase 5"). The manual build was
verified end-to-end on 2026-08-20 and is still live in **ap-south-1** (account `121490076448`).

## Manual build (currently live) — resource records

| Resource | Identifier / ARN |
|---|---|
| VPC | `vpc-010ad9b0090d44701` (10.0.0.0/16) |
| Subnets | public-a `subnet-07f3f0b7e3345afec`, public-b `subnet-0e83e5c8f64fae07f`<br>app-a `subnet-00aa497fa6708e015`, app-b `subnet-0e398b3596d813683`<br>data-a `subnet-002cc0a38637b161c`, data-b `subnet-06793f762dc321447` |
| Internet Gateway | `igw-0830b56a8fe07ce3a` |
| NAT Gateway / EIP | `nat-076d8c528b0331ea3` / `eipalloc-0cea31a07fa3f2b9c` |
| Route tables | public `rtb-0661c340d0588bafe`, app `rtb-082d0b864d19013f6`, data `rtb-067f8db6e6c91c8e3` |
| S3 gateway endpoint | `vpce-02701db523519c9d2` |
| Security groups | ALB `sg-054d97de3820fa2b6`, EC2 `sg-07ae505e549426e77`, RDS `sg-06727c711e8a3e2f5` |
| RDS PostgreSQL 16 | `maison-hygia-prod` — endpoint `maison-hygia-prod.c7okk4cau3rc.ap-south-1.rds.amazonaws.com:5432/maisonhygia` (db.t3.medium, 100 GB GP3, encrypted, deletion protection) |
| S3 buckets | `maison-hygia-web-prod`, `maison-hygia-admin-prod`, `maison-hygia-assets-prod` (BPA ON, versioning, SSE-S3, CORS on assets) |
| CloudFront OAC | `E1VMUZVMMXTL1P` |
| CloudFront Web | `E3I9Z4HMV6A7O8` → `https://d23fdnei99j9dt.cloudfront.net` |
| CloudFront Admin | `E2IHIFY9VSGZSC` → `https://d38t65yqtcfva.cloudfront.net` |
| CloudFront Assets | `ES6DWR3Z2JLV9` → `https://d3fjhd637k4pfz.cloudfront.net` |
| Cognito User Pool | `ap-south-1_RVeefRjjt` |
| Cognito SPA client (PKCE) | `31iq2cmvv4i8tplpj00f0pfkl2` |
| Cognito backend client (confidential) | `51u9onljo1lejl4p7ufim2d01r` |
| Cognito domain | `maison-hygia-auth` (`.auth.ap-south-1.amazoncognito.com`) |
| Cognito groups | `admin`, `editor`, `customer` |
| ECR repository | `121490076448.dkr.ecr.ap-south-1.amazonaws.com/maison-hygia/backend` (image `sha-000000000001` pushed) |
| IAM role / profile | `maison-hygia-ec2-role` / `maison-hygia-ec2-instance-profile` |
| ALB | `maison-hygia-alb` — DNS `maison-hygia-alb-240310978.ap-south-1.elb.amazonaws.com` (HTTP:80) |
| Target group | `maison-hygia-tg` (`/health`, 30s/5s, healthy 2 / unhealthy 3) |
| Launch template | `lt-0b72226135739083f` (v2 default; t3.medium, AL2023) |
| Auto Scaling group | `maison-hygia-prod-asg` (Min=1 / Desired=1 / Max=5; target-tracking CPU 60%) |
| Secrets Manager | `maison-hygia/prod/{database,razorpay,cognito,sendgrid}` |
| Parameter Store | `/maison-hygia/prod/{CORS_ORIGINS,LOG_LEVEL,S3_ASSETS_BUCKET,CF_ASSETS_DOMAIN,COGNITO_USER_POOL_ID,COGNITO_APP_CLIENT_ID,AWS_REGION}` |
| CloudWatch | log groups `/aws/ec2/maison-hygia/{app,access}`, SNS `maison-hygia-alerts`, 5 alarms, dashboard `MaisonHygia-Prod` |
| ACM (pending validation) | `arn:aws:acm:us-east-1:121490076448:certificate/21a797cb-1bb0-41b8-aed4-31e49509531d` — `*.maisonhygia.adityanair.tech` |

## Verification performed (build success)

- `GET http://<ALB>/health` → `{"status":"ok","version":"0.1.0","database":"ok"}` (HTTP 200)
- `GET https://d23fdnei99j9dt.cloudfront.net/` → serves `index.html` (HTTP 200)
- `GET https://d23fdnei99j9dt.cloudfront.net/api/v1/products/` → API proxied to ALB, returns 16 seeded products
- SPA fallback `/shop`, `/checkout/success` (web) and `/admin` (admin) → HTTP 200 `text/html`
- ASG: 1 healthy in-service instance (`i-066b57efd34c4e741`); all 3 CloudFront distributions `Deployed`

## CloudFormation template (`maison-hygia-stack.yaml`)

Reproduces the whole stack for auto-creation. Deploy with:

```bash
aws cloudformation deploy \
  --stack-name maison-hygia-prod \
  --template-file infra/cloudformation/maison-hygia-stack.yaml \
  --region ap-south-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      Environment=prod \
      ImageTag=sha-<12-hex> \
      DbMasterPassword='<your-password>' \
      AlertEmail=you@example.com
```

Notes:

- Bucket names in the template are suffixed with the account ID to stay globally unique; the manual build used unsuffixed names.
- The template ships with the ALB on **HTTP:80** and CloudFront on the default `cloudfront.net` domains, matching the current manual build. Adding the custom domains requires the `*.maisonhygia.adityanair.tech` ACM cert (us-east-1, currently PENDING_VALIDATION) plus Route 53 records — DNS was intentionally skipped in this run.
- `CognitoUserPoolDomain` uses the `maison-hygia-<env>` domain alias; the manual build used `maison-hygia-auth`.
- Secrets use placeholder values from the stack parameters (`DbMasterPassword`, `RazorpayApiKey`, `RazorpayApiSecret`, `SendGridApiKey`); replace them after deploy.

## Remaining post-build steps (documented, not executed)

1. Validate the ACM wildcard cert via DNS at the `adityanair.tech` registrar, then:
   - point Route 53 records at the CloudFront distributions / ALB / Cognito domain,
   - attach the cert to CloudFront (Web/Admin/Assets) and add an HTTPS:443 listener on the ALB.
2. Confirm the SNS subscription email and set the real Razorpay/SendGrid secrets in Secrets Manager.
3. (Optional) Wire the GitHub Actions OIDC role + repo secrets so the `deploy-*.yml` workflows run.