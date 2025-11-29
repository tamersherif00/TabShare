# Deployment Guide

Quick guide for deploying the TabShare application.

---

## 🚀 Deploy Infrastructure

```bash
# 1. Build backend
cd packages/backend
npm run build

# 2. Build and deploy infrastructure
cd ../infrastructure
npm run build
cdk deploy
```

**Confirm deployment when prompted.**

---

## 🌐 Deploy Frontend

```bash
# Build frontend
cd packages/frontend
npm run build

# Deploy (uses deploy.ps1 script)
cd ../..
.\deploy.ps1
```

---

## ✅ Verify Deployment

### 1. Check S3 Security
```bash
aws s3api get-public-access-block --bucket <receipts-bucket-name>
```

Should show all blocks enabled.

### 2. Test Upload
- Go to CloudFront URL
- Upload a receipt
- Verify items are extracted

### 3. Check Logs
```bash
aws logs tail /aws/lambda/TabShare-ProcessReceiptHandler --follow
```

---

## 🔧 Configuration

### Backend Environment
Set in Lambda environment variables (auto-configured by CDK):
- `BILLS_TABLE`
- `RECEIPTS_BUCKET`
- `CONNECTIONS_TABLE`

### Frontend Environment
Create `packages/frontend/.env`:
```bash
VITE_API_URL=<rest-api-url-from-cdk-output>
VITE_WS_URL=<websocket-url-from-cdk-output>
VITE_DEBUG_MODE=true  # Set to false for production
```

---

## 🆘 Rollback

```bash
cd packages/infrastructure
cdk deploy --previous-version
```

---

## 📊 Key Features Deployed

- ✅ S3 bucket security (blockPublicAccess, encryption)
- ✅ File size limit (5MB)
- ✅ SHA-256 checksum validation
- ✅ Image compression
- ✅ Textract integration with error handling
- ✅ Debug logging (toggle with VITE_DEBUG_MODE)

---

For detailed information, see:
- `PRE_DEPLOYMENT_CHECKLIST.md` - Complete deployment steps
- `DEBUG_LOGGING_GUIDE.md` - Debug logging features
- `LOCAL_DEVELOPMENT.md` - Local development setup
