# Local Development Guide

## Overview

This application runs entirely locally with an Express backend and React frontend. No cloud deployment required!

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  React Frontend │ ◄─────► │  Express Backend │
│  (Port 3000)    │         │  (Port 3001)     │
└─────────────────┘         └──────────────────┘
         │                           │
         │                           │
         └───────────────┬───────────┘
                         │
                    WebSocket
                   (Port 3002)
                         │
                         ▼
                  ┌─────────────┐
                  │ AWS Textract│
                  │  (Optional) │
                  └─────────────┘
```

## Setup

### 1. Install Dependencies

```bash
# Install all dependencies
npm install
```

### 2. Configure Environment

Create `.env` in the root directory:

```env
# AWS Configuration (optional - for Textract)
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
```

**Without AWS credentials**: The app uses mock data for testing.

### 3. Start Backend

```bash
cd packages/backend
npm run local
```

You should see:
```
🔧 AWS credentials detected - will use real Textract service
🚀 Local Mock Server Started!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 REST API:       http://localhost:3001
🔌 WebSocket:      ws://localhost:3002
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 4. Start Frontend

In a new terminal:

```bash
cd packages/frontend
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

### 5. Open Application

Navigate to http://localhost:3000

## Data Storage

The local server uses **in-memory storage**:
- Bills, claims, and participants are stored in JavaScript Maps
- Data is lost when the server restarts
- Perfect for development and testing

## WebSocket Communication

Real-time updates use WebSocket:
- Connection established automatically when viewing a bill
- Updates broadcast to all connected clients
- Automatic reconnection on disconnect

## Testing Textract

### Option 1: Use Test Page

1. Open `test-textract.html` in your browser
2. Upload a receipt image
3. View extracted data

### Option 2: Use Main App

1. Go to http://localhost:3000
2. Click "Upload Receipt"
3. Select an image
4. Wait for Textract analysis

### Option 3: Generate Test Receipt

1. Open `generate-test-receipt.html`
2. Click "Download Receipt Image"
3. Use the downloaded image for testing

## Development Workflow

### Making Frontend Changes

1. Edit files in `packages/frontend/src/`
2. Vite will hot-reload automatically
3. Check browser console for errors

### Making Backend Changes

1. Edit files in `packages/backend/`
2. Server will restart automatically (tsx watch mode)
3. Check terminal for errors

### Adding New Features

1. **Frontend Component**: Add to `packages/frontend/src/components/`
2. **Backend Endpoint**: Add to `packages/backend/local-server.ts`
3. **Types**: Update `packages/frontend/src/types/` or `packages/backend/src/types/`

## Common Tasks

### Clear Browser Cache

```bash
# Chrome/Edge
Ctrl+Shift+Delete

# Or use incognito mode
Ctrl+Shift+N
```

### Restart Servers

```bash
# Backend
cd packages/backend
npm run local

# Frontend
cd packages/frontend
npm run dev
```

### Check Ports

```bash
# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :3001
netstat -ano | findstr :3002

# Kill process
npx kill-port 3000
npx kill-port 3001
npx kill-port 3002
```

## Debugging

### Frontend Debugging

1. Open Chrome DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for API calls
4. Use React DevTools extension

### Backend Debugging

1. Check terminal output
2. Add `console.log()` statements
3. Use VS Code debugger:
   - Set breakpoints
   - Press F5 to start debugging

### WebSocket Debugging

1. Open Chrome DevTools → Network → WS
2. View WebSocket messages
3. Check connection status

## File Structure

```
packages/
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── BillView.tsx
│   │   │   ├── PayerDashboard.tsx
│   │   │   └── ...
│   │   ├── pages/          # Page components
│   │   │   ├── HomePage.tsx
│   │   │   ├── BillPage.tsx
│   │   │   └── ...
│   │   ├── hooks/          # Custom hooks
│   │   │   └── useWebSocket.ts
│   │   ├── utils/          # Utilities
│   │   │   └── api-client.ts
│   │   └── types/          # TypeScript types
│   │       └── bill.ts
│   └── package.json
│
└── backend/
    ├── src/
    │   ├── services/       # Services
    │   │   └── textract.service.ts
    │   ├── types/          # TypeScript types
    │   │   └── textract.ts
    │   └── utils/          # Utilities
    │       ├── input-sanitizer.ts
    │       └── validation.ts
    ├── local-server.ts     # Main server
    └── package.json
```

## Tips

1. **Use Mock Data**: Develop without AWS credentials first
2. **Hot Reload**: Both frontend and backend support hot reload
3. **Browser DevTools**: Essential for debugging
4. **Console Logs**: Add liberally during development
5. **TypeScript**: Let the compiler catch errors early

## Next Steps

- Read `TEXTRACT_TESTING_GUIDE.md` for Textract testing
- Check `README.md` for API documentation
- Explore the codebase and make it your own!

Happy coding! 🚀
