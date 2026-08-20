# Deploy the Maison Hygia stack via CloudFormation (auto-creation)
# Usage:  powershell -File deploy-stack.ps1 [-Environment prod] [-ImageTag sha-000000000001] [-Region ap-south-1]
param(
  [string]$Environment = "prod",
  [string]$ImageTag = "sha-000000000001",
  [string]$Region = "ap-south-1",
  [string]$DbMasterPassword = "ChangeMe_Placeholder_123",
  [string]$AlertEmail = "maison-hygia-alerts@example.com"
)

$ErrorActionPreference = "Stop"
$aws = "C:\Users\adity\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe"
$stack = "maison-hygia-$Environment"
$template = Join-Path $PSScriptRoot "maison-hygia-stack.yaml"

if (-not (Test-Path $template)) { throw "Template not found: $template" }

& $aws cloudformation deploy `
  --stack-name $stack `
  --template-file $template `
  --region $Region `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides `
    "Environment=$Environment" `
    "ImageTag=$ImageTag" `
    "DbMasterPassword=$DbMasterPassword" `
    "AlertEmail=$AlertEmail"

if ($LASTEXITCODE -ne 0) { throw "CloudFormation deploy failed" }

Write-Host "Stack deployed: $stack"
& $aws cloudformation describe-stacks --stack-name $stack --region $Region --query "Stacks[0].Outputs" --output table