# TabShare

A real-time collaborative bill splitting application with receipt scanning powered by AWS Textract.

## Overview

TabShare allows a payer to upload a receipt, automatically extract line items, and share a link with friends to claim their items. Everyone sees updates in real-time via WebSocket connections.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (React)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ HomePage │  │UploadPage│  │ BillPage │  │ PayerDashboardPage   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
         ┌──────────────────┐   ┌──────────────────┐
         │   REST API       │   │   WebSocket API  │
         │   (Port 3001)    │   │   (Port 3002)    │
         └──────────────────┘   └──────────────────┘
                    │                    │
                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Backend (Express/Lambda)                        cd│
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │
│  │ Bill CRUD  │  │   Claims   │  │Participants│  │ Receipt Upload │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   AWS Textract   │
                    │ (Receipt OCR)    │
                    └──────────────────┘
```

## Features

- **Receipt Scanning** - Upload or photograph receipts, AWS Textract extracts line items automatically
- **Real-time Updates** - WebSocket connections push claim changes to all participants instantly
- **Optimistic UI** - Claims appear immediately with rollback on failure
- **Bill Sharing** - Generate shareable links or QR codes for participants
- **Claim Management** - Claim full items or split percentages with others
- **Payer Dashboard** - Track who claimed what and see running totals
- **Tax/Tip Distribution** - Automatically distributes tax, tip, and fees proportionally

## Project Structure

```
├── packages/
│   ├── frontend/           # React + TypeScript + Vite
│   │   ├── src/
│   │   │   ├── components/ # UI components
│   │   │   ├── pages/      # Route pages
│   │   │   ├── hooks/      # Custom hooks (useWebSocket)
│   │   │   └── utils/      # Utilities
│   │   └── ...
│   ├── backend/            # Express server + Lambda handlers
│   │   ├── local-server.ts # Local development server
│   │   └── src/
│   │       ├── handlers/   # API route handlers
│   │       ├── services/   # Textract service
│   │       └── utils/      # Validation, sanitization
│   └── infrastructure/     # AWS CDK stack
├── DEPLOYMENT.md           # AWS deployment guide
└── LOCAL_DEVELOPMENT.md    # Local setup guide
```

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- AWS credentials (optional, for Textract)

### Setup

```bash
# Install all dependencies
npm install

# Start backend server
cd packages/backend
npm run dev

# In another terminal, start frontend
cd packages/frontend
npm run dev
```

Frontend runs on `http://localhost:3000`, backend on `http://localhost:3001`, WebSocket on `ws://localhost:3002`.

### Environment Variables

**Backend** (`packages/backend/.env`):
```bash
AWS_ACCESS_KEY_ID=your_key        # Optional - enables real Textract
AWS_SECRET_ACCESS_KEY=your_secret # Optional - enables real Textract
AWS_REGION=us-east-1
```

**Frontend** (`packages/frontend/.env.local`):
```bash
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3002
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bills` | Create a new bill |
| POST | `/api/bills/upload` | Upload receipt and create bill |
| GET | `/api/bills/:id` | Get bill with claims |
| PUT | `/api/bills/:id/amounts` | Update tax/tip/fees |
| PUT | `/api/bills/:id/items` | Update line items |
| POST | `/api/participants` | Join a bill |
| POST | `/api/claims` | Create a claim |
| PUT | `/api/claims/:id` | Update claim percentage |
| DELETE | `/api/claims/:id` | Remove a claim |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `CLAIM_CREATED` | Server → Client | New claim added |
| `CLAIM_UPDATED` | Server → Client | Claim percentage changed |
| `CLAIM_DELETED` | Server → Client | Claim removed |
| `BILL_UPDATED` | Server → Client | Bill details changed |
| `PARTICIPANT_JOINED` | Server → Client | New participant joined |

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- React Router (navigation)

**Backend:**
- Express.js (local server)
- AWS Lambda (production)
- AWS Textract (OCR)
- WebSocket (real-time)

**Infrastructure (AWS):**
- API Gateway (REST + WebSocket)
- Lambda Functions
- DynamoDB (data storage)
- S3 (receipt images)
- CloudFront (CDN)
- CDK (infrastructure as code)

## User Flow

1. **Payer uploads receipt** → Textract extracts items → Bill created
2. **Payer shares link** → Participants join with their name
3. **Participants claim items** → Select percentage (25%, 50%, 100%, etc.)
4. **Real-time sync** → All users see claims update instantly
5. **Payer reviews** → Dashboard shows who owes what

## License

MIT
