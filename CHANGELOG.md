# Changelog

All notable changes to TabShare will be documented in this file.

## [1.0.0] - 2025-11-26

### 🎉 Initial MVP Release

#### Features
- **Receipt Upload & OCR**: Upload receipt images or take photos, automatic text extraction via AWS Textract
- **Bill Splitting**: Create bills with line items, tax, tip, and additional fees
- **Real-time Collaboration**: WebSocket-based live updates when participants claim items
- **Participant Management**: Join bills via shareable links, claim items by percentage
- **Payer Dashboard**: 
  - View all participants and their totals
  - Edit tax, tip, and add custom fees
  - Mark items as shared (split equally)
  - Combine/uncombine line items
  - Set Venmo username for payments
- **Payment Integration**: Venmo deep links with pre-filled amount and recipient
- **Mobile-First Design**: Responsive UI optimized for mobile devices
- **Camera Capture**: Direct camera access for receipt photos

#### Technical Stack
- Frontend: React + TypeScript + Vite + TailwindCSS
- Backend: AWS Lambda + API Gateway + DynamoDB
- Infrastructure: AWS CDK
- Real-time: WebSocket API

#### Deployment
- CloudFront distribution for frontend
- REST API + WebSocket API on API Gateway
- S3 for receipt image storage
- DynamoDB with TTL for automatic bill expiration
