# Simple CDK Deployment Script for TabShare
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TabShare CDK Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if credentials are set
Write-Host "Checking AWS credentials..." -ForegroundColor Yellow
try {
    $identity = aws sts get-caller-identity 2>&1 | ConvertFrom-Json
    if ($identity.Account) {
        Write-Host "[OK] Credentials valid" -ForegroundColor Green
        Write-Host "    Account: $($identity.Account)" -ForegroundColor White
        Write-Host "    User: $($identity.Arn)" -ForegroundColor White
    } else {
        throw "No credentials"
    }
} catch {
    Write-Host "[ERROR] No valid AWS credentials found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set your AWS credentials first:" -ForegroundColor Yellow
    Write-Host '  $Env:AWS_ACCESS_KEY_ID="..."' -ForegroundColor White
    Write-Host '  $Env:AWS_SECRET_ACCESS_KEY="..."' -ForegroundColor White
    Write-Host '  $Env:AWS_SESSION_TOKEN="..."' -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host ""

# Build backend first
Write-Host "Building backend..." -ForegroundColor Yellow
Set-Location packages/backend
npm install
npm run build
Set-Location ../..

# Navigate to infrastructure
Set-Location packages/infrastructure

# Clean install to ensure all types are present
Write-Host "Installing infrastructure dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force node_modules
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force package-lock.json
}
npm install

# Verify @types/node is installed
if (-not (Test-Path "node_modules/@types/node")) {
    Write-Host "[WARNING] @types/node not found, installing explicitly..." -ForegroundColor Yellow
    npm install --save-dev @types/node
}

# Build
Write-Host "Building infrastructure TypeScript..." -ForegroundColor Yellow
npm run build

# Get account and region
$awsAccount = $identity.Account
$awsRegion = "us-west-1"

# Set environment variables
$env:CDK_DEFAULT_ACCOUNT = $awsAccount
$env:CDK_DEFAULT_REGION = $awsRegion
$env:ENVIRONMENT = "dev"

Write-Host ""
Write-Host "Deployment target:" -ForegroundColor Cyan
Write-Host "  Account: $awsAccount" -ForegroundColor White
Write-Host "  Region: $awsRegion" -ForegroundColor White
Write-Host ""

# Try to bootstrap (will skip if already done)
Write-Host "Checking CDK bootstrap..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
$bootstrapCheck = aws ssm get-parameter --name "/cdk-bootstrap/hnb659fds/version" --region $awsRegion 2>$null
$bootstrapExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = "Stop"

if (-not $bootstrapExists) {
    Write-Host "[WARNING] CDK bootstrap not fully complete" -ForegroundColor Yellow
    Write-Host "Will attempt deployment anyway..." -ForegroundColor Yellow
} else {
    Write-Host "[OK] CDK already bootstrapped" -ForegroundColor Green
}

Write-Host ""
Write-Host "Deploying stack..." -ForegroundColor Yellow
Write-Host "Note: Skipping bootstrap check, attempting direct deployment" -ForegroundColor Gray
npx cdk deploy TabShare-dev --require-approval never --no-previous-parameters

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Deployment failed" -ForegroundColor Red
    Set-Location ../..
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Infrastructure Deployed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Extract outputs
Write-Host ""
Write-Host "Extracting deployment outputs..." -ForegroundColor Yellow

# Get stack outputs using AWS CLI
$stackOutputs = aws cloudformation describe-stacks --stack-name TabShare-dev --region $awsRegion --query "Stacks[0].Outputs" | ConvertFrom-Json

$restApiUrl = ($stackOutputs | Where-Object { $_.OutputKey -eq "RestApiUrl" }).OutputValue
$wsUrl = ($stackOutputs | Where-Object { $_.OutputKey -eq "WebSocketUrl" }).OutputValue
$frontendBucket = ($stackOutputs | Where-Object { $_.OutputKey -eq "FrontendBucketName" }).OutputValue
$cloudFrontUrl = ($stackOutputs | Where-Object { $_.OutputKey -eq "CloudFrontUrl" }).OutputValue

Write-Host "[OK] Outputs extracted" -ForegroundColor Green
Write-Host "  REST API: $restApiUrl" -ForegroundColor Gray
Write-Host "  WebSocket: $wsUrl" -ForegroundColor Gray
Write-Host "  Frontend Bucket: $frontendBucket" -ForegroundColor Gray
Write-Host "  CloudFront: $cloudFrontUrl" -ForegroundColor Gray

Set-Location ../..

# Build and deploy frontend
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building Frontend" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location packages/frontend

# Create production environment file
$envContent = @"
VITE_API_URL=$restApiUrl
VITE_WS_URL=$wsUrl
VITE_AWS_REGION=$awsRegion
"@

$envContent | Out-File -FilePath ".env.production" -Encoding UTF8
Write-Host "[OK] Environment variables configured" -ForegroundColor Green

# Install and build
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Building frontend..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend build failed" -ForegroundColor Red
    Set-Location ../..
    exit 1
}

Write-Host "[OK] Frontend built" -ForegroundColor Green

# Upload to S3
Write-Host ""
Write-Host "Uploading frontend to S3..." -ForegroundColor Yellow
aws s3 sync dist/ s3://$frontendBucket/ --delete --cache-control "public,max-age=31536000,immutable" --exclude "index.html"
aws s3 cp dist/index.html s3://$frontendBucket/index.html --cache-control "public,max-age=0,must-revalidate"

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Frontend uploaded" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Frontend upload failed" -ForegroundColor Red
    Set-Location ../..
    exit 1
}

# Get CloudFront distribution ID
Write-Host ""
Write-Host "Finding CloudFront distribution..." -ForegroundColor Yellow
$distributionId = aws cloudfront list-distributions --query "DistributionList.Items[?contains(Origins.Items[0].DomainName, '$frontendBucket')].Id | [0]" --output text

if ($distributionId -and $distributionId -ne "None") {
    Write-Host "[OK] Distribution found: $distributionId" -ForegroundColor Green
    Write-Host "Creating CloudFront invalidation..." -ForegroundColor Yellow
    $invalidationId = aws cloudfront create-invalidation --distribution-id $distributionId --paths "/*" --query "Invalidation.Id" --output text
    Write-Host "[OK] Invalidation created: $invalidationId" -ForegroundColor Green
    Write-Host "Note: Cache invalidation may take 1-2 minutes to complete" -ForegroundColor Gray
} else {
    Write-Host "[WARNING] Could not find CloudFront distribution ID" -ForegroundColor Yellow
    Write-Host "You may need to manually invalidate the cache" -ForegroundColor Yellow
}

Set-Location ../..

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your application is live at:" -ForegroundColor Cyan
Write-Host "  $cloudFrontUrl" -ForegroundColor White
Write-Host ""
Write-Host "API Endpoints:" -ForegroundColor Cyan
Write-Host "  REST API: $restApiUrl" -ForegroundColor White
Write-Host "  WebSocket: $wsUrl" -ForegroundColor White
Write-Host ""
