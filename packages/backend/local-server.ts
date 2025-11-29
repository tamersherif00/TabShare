/**
 * Local development server for testing the Bill Splitter application
 * This provides mock endpoints and WebSocket support for local development
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { TextractService } from './src/services/textract.service.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../.env' });

const app = express();
const PORT = 3001;
const WS_PORT = 3002;

// Configuration
const USE_REAL_TEXTRACT = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

// Initialize Textract service if credentials are available
let textractService: TextractService | null = null;

if (USE_REAL_TEXTRACT) {
  console.log('🔧 AWS credentials detected - will use real Textract service');
  textractService = new TextractService();
} else {
  console.log('📝 No AWS credentials - using mock Textract data');
}

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads (store in memory for mock)
const upload = multer({ storage: multer.memoryStorage() });

// In-memory data store
const bills = new Map();
const claims = new Map();
const participants = new Map();
const connections = new Map();

// Helper to generate mock bill
function createMockBill(payerId: string): any {
  const billId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    id: billId,
    payerId,
    receiptImageUrl: '',
    lineItems: [
      { id: randomUUID(), name: 'Burger', price: 15.99, isShared: false },
      { id: randomUUID(), name: 'Pizza', price: 22.50, isShared: false },
      { id: randomUUID(), name: 'Fries', price: 6.99, isShared: true, sharedAmongCount: 2 },
      { id: randomUUID(), name: 'Salad', price: 12.00, isShared: false },
      { id: randomUUID(), name: 'Soda', price: 3.50, isShared: false },
    ],
    extractedTax: 6.12,
    extractedTip: 12.00,
    additionalFees: [
      { description: 'Service Fee', amount: 2.50 },
    ],
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    shareUrl: `http://localhost:3000/bill/${billId}`,
    status: 'ready',
    vendorName: 'The Local Bistro',
    receiptDate: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    receiptTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    numberOfGuests: 4,
  };
}

// REST API Endpoints

// Create a new bill
app.post('/api/bills', (req, res) => {
  const { payerId } = req.body;
  const bill = createMockBill(payerId || randomUUID());
  bills.set(bill.id, bill);

  console.log(`✅ Created bill: ${bill.id}`);
  res.json({ bill });
});

// Create bill from manual entry
app.post('/api/bills/manual', (req, res) => {
  const { payerId, lineItems, tax, tip, additionalFees } = req.body;
  const billId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const bill = {
    id: billId,
    payerId: payerId || randomUUID(),
    receiptImageUrl: '',
    lineItems: lineItems.map((item: any) => ({
      id: randomUUID(),
      ...item,
    })),
    extractedTax: tax || 0,
    extractedTip: tip || 0,
    additionalFees: additionalFees || [],
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    shareUrl: `http://localhost:3000/bill/${billId}`,
    status: 'ready',
  };

  bills.set(bill.id, bill);
  console.log(`✅ Created manual bill: ${bill.id}`);
  res.json({ bill });
});

// Upload receipt and create bill (with optional real Textract processing)
app.post('/api/bills/upload', upload.single('receipt'), async (req, res) => {
  const { payerId, payerName } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No receipt image provided' });
  }

  console.log(`📸 Received receipt upload: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);

  const billId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  try {
    let lineItems: any[] = [];
    let extractedTax = 0;
    let extractedTip = 0;
    let additionalFees: any[] = [];
    let status = 'ready';
    let vendorName: string | undefined;
    let receiptDate: string | undefined;
    let receiptTime: string | undefined;
    let numberOfGuests: number | undefined;

    if (USE_REAL_TEXTRACT && textractService) {
      console.log('🔍 Using real AWS Textract for analysis...');
      
      // Analyze with Textract using bytes (no S3 needed for local testing)
      console.log('⏳ Analyzing receipt with Textract...');
      const analysis = await textractService.analyzeReceiptFromBytes(file.buffer);
      
      console.log(`✅ Textract analysis complete (confidence: ${analysis.confidence}%)`);
      console.log(`   Found ${analysis.lineItems.length} items`);
      console.log(`   Tax: $${analysis.tax.toFixed(2)}, Tip: $${analysis.tip.toFixed(2)}`);
      console.log(`   Subtotal: $${analysis.subtotal.toFixed(2)}, Total: $${analysis.total.toFixed(2)}`);
      console.log('   Line items:', JSON.stringify(analysis.lineItems, null, 2));

      // Group duplicate items together
      const itemMap = new Map<string, { name: string; price: number; count: number }>();
      
      analysis.lineItems.forEach(item => {
        // Normalize name for comparison (case-insensitive, trim whitespace)
        const normalizedName = item.name.trim().toLowerCase();
        
        if (itemMap.has(normalizedName)) {
          const existing = itemMap.get(normalizedName)!;
          existing.count++;
          existing.price += item.price;
        } else {
          itemMap.set(normalizedName, {
            name: item.name,
            price: item.price,
            count: 1
          });
        }
      });
      
      // Convert to bill format with grouped items
      lineItems = Array.from(itemMap.values()).map(item => ({
        id: randomUUID(),
        name: item.count > 1 ? `${item.name} (x${item.count})` : item.name,
        price: item.price,
        isShared: false,
      }));
      
      console.log(`  📦 Grouped ${analysis.lineItems.length} items into ${lineItems.length} unique items`);

      extractedTax = analysis.tax;
      extractedTip = analysis.tip;
      
      // Extract metadata
      vendorName = analysis.vendorName;
      receiptDate = analysis.receiptDate;
      receiptTime = analysis.receiptTime;
      numberOfGuests = analysis.numberOfGuests;
      
      if (vendorName) console.log(`  🏪 Vendor: ${vendorName}`);
      if (receiptDate) console.log(`  📅 Date: ${receiptDate}`);
      if (receiptTime) console.log(`  🕐 Time: ${receiptTime}`);
      if (numberOfGuests) console.log(`  👥 Guests: ${numberOfGuests}`);
      
      // Add service charge as an additional fee if present
      if (analysis.serviceCharge && analysis.serviceCharge > 0) {
        additionalFees.push({
          description: 'Service Charge',
          amount: analysis.serviceCharge
        });
        console.log(`  💵 Added service charge: $${analysis.serviceCharge.toFixed(2)}`);
      }
    } else {
      console.log('📝 Using mock Textract data');
      // Use mock data
      lineItems = [
        { id: randomUUID(), name: 'Cheeseburger', price: 12.99, isShared: false },
        { id: randomUUID(), name: 'Caesar Salad', price: 8.50, isShared: false },
        { id: randomUUID(), name: 'French Fries', price: 4.99, isShared: true, sharedAmongCount: 2 },
        { id: randomUUID(), name: 'Iced Tea', price: 2.99, isShared: false },
        { id: randomUUID(), name: 'Chocolate Cake', price: 6.50, isShared: false },
      ];
      extractedTax = 3.60;
      extractedTip = 7.00;
    }

    const finalPayerId = payerId || randomUUID();
    const finalPayerName = payerName || 'Payer';
    
    const bill = {
      id: billId,
      payerId: finalPayerId,
      payerName: finalPayerName,
      receiptImageUrl: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
      lineItems,
      extractedTax,
      extractedTip,
      additionalFees,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      shareUrl: `http://localhost:3000/bill/${billId}`,
      status,
      vendorName,
      receiptDate,
      receiptTime,
      numberOfGuests,
    };

    bills.set(bill.id, bill);
    console.log(`✅ Created bill from receipt: ${bill.id}`);
    console.log(`   Payer: ${finalPayerName} (ID: ${finalPayerId})`);
    console.log(`   Extracted ${bill.lineItems.length} items`);
    
    res.json({ bill });
  } catch (error) {
    console.error('❌ Error processing receipt:', error);
    res.status(500).json({ 
      error: 'Failed to process receipt',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get a bill
app.get('/api/bills/:billId', (req, res) => {
  const { billId } = req.params;
  const bill = bills.get(billId);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  // Include claims for this bill
  const billClaims = Array.from(claims.values()).filter(
    (c: any) => c.billId === billId
  );

  console.log(`📄 Retrieved bill: ${billId} with ${billClaims.length} claims`);
  res.json({ bill: { ...bill, claims: billClaims } });
});

// Get bill summary
app.get('/api/bills/:billId/summary', (req, res) => {
  const { billId } = req.params;
  const bill = bills.get(billId);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  const billClaims = Array.from(claims.values()).filter(
    (c: any) => c.billId === billId
  );

  const summary = {
    bill,
    claims: billClaims,
    participants: Array.from(participants.values()).filter(
      (p: any) => p.billId === billId
    ),
  };

  console.log(`📊 Retrieved summary for bill: ${billId}`);
  res.json(summary);
});

// Update bill amounts
app.put('/api/bills/:billId/amounts', (req, res) => {
  const { billId } = req.params;
  const { tax, tip, additionalFees, venmoUsername } = req.body;
  const bill = bills.get(billId);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  if (tax !== undefined) bill.adjustedTax = tax;
  if (tip !== undefined) bill.adjustedTip = tip;
  if (additionalFees !== undefined) bill.additionalFees = additionalFees;
  if (venmoUsername !== undefined) bill.venmoUsername = venmoUsername;

  bills.set(billId, bill);
  console.log(`💰 Updated amounts for bill: ${billId}`);

  // Broadcast update to WebSocket clients
  broadcastToBill(billId, {
    type: 'BILL_UPDATED',
    payload: { updates: { adjustedTax: tax, adjustedTip: tip, additionalFees, venmoUsername } },
    timestamp: new Date().toISOString(),
  });

  res.json({ bill });
});

// Update bill line items
app.put('/api/bills/:billId/items', (req, res) => {
  const { billId } = req.params;
  const { lineItems } = req.body;
  const bill = bills.get(billId);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  bill.lineItems = lineItems;
  bills.set(billId, bill);
  console.log(`📝 Updated line items for bill: ${billId}`);

  // Broadcast update to WebSocket clients
  broadcastToBill(billId, {
    type: 'BILL_UPDATED',
    payload: { updates: { lineItems } },
    timestamp: new Date().toISOString(),
  });

  res.json({ bill });
});

// Create or rejoin as a participant
app.post('/api/participants', (req, res) => {
  const { billId, name } = req.body;

  console.log(`\n🔍 POST /api/participants - billId: ${billId}, name: "${name}"`);

  if (!billId || !name) {
    return res.status(400).json({ error: 'billId and name are required' });
  }

  // Get the bill to check payer name
  const bill = bills.get(billId);
  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  // Check if this name matches the payer
  if (bill.payerName && bill.payerName.toLowerCase() === name.toLowerCase()) {
    console.log(`👑 Name matches payer: ${name} - redirecting to dashboard`);
    return res.json({ 
      isPayer: true,
      payerId: bill.payerId,
      payerName: bill.payerName,
      billId
    });
  }

  // Check if participant with this name already exists for this bill
  const allParticipants = Array.from(participants.values());
  console.log(`📋 Current participants for bill ${billId}:`, 
    allParticipants
      .filter((p: any) => p.billId === billId)
      .map((p: any) => `${p.name} (${p.id})`)
  );
  
  const existingParticipant = allParticipants.find(
    (p: any) => p.billId === billId && p.name.toLowerCase() === name.toLowerCase()
  );

  if (existingParticipant) {
    // Return existing participant - allows rejoining with same identity
    console.log(`✅ Participant rejoined: ${name} (ID: ${existingParticipant.id})`);
    return res.json({ participant: existingParticipant, isReturning: true, isPayer: false });
  }

  // Create new participant
  const participantId = randomUUID();
  const participant = {
    id: participantId,
    billId,
    name,
    joinedAt: new Date().toISOString(),
  };

  participants.set(participantId, participant);
  console.log(`✨ Created NEW participant: ${name} (ID: ${participantId})`);

  // Broadcast to WebSocket
  broadcastToBill(billId, {
    type: 'PARTICIPANT_JOINED',
    payload: { participant },
    timestamp: new Date().toISOString(),
  });

  res.json({ participant, isReturning: false, isPayer: false });
});

// Create a claim
app.post('/api/claims', (req, res) => {
  const { billId, participantId, participantName, itemId, percentage } = req.body;
  const claimId = randomUUID();

  const bill = bills.get(billId);
  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  const item = bill.lineItems.find((i: any) => i.id === itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const amount = item.price * (percentage / 100);

  const claim = {
    id: claimId,
    billId,
    participantId,
    participantName,
    itemId,
    percentage,
    amount,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  claims.set(claimId, claim);
  console.log(`✅ Created claim: ${participantName} claimed ${percentage}% of ${item.name}`);

  // Broadcast to WebSocket
  broadcastToBill(billId, {
    type: 'CLAIM_CREATED',
    payload: { claim },
    timestamp: new Date().toISOString(),
  });

  res.json({ claim });
});

// Update a claim
app.put('/api/claims/:claimId', (req, res) => {
  const { claimId } = req.params;
  const { percentage } = req.body;

  const claim = claims.get(claimId);
  if (!claim) {
    return res.status(404).json({ error: 'Claim not found' });
  }

  const bill = bills.get(claim.billId);
  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  const item = bill.lineItems.find((i: any) => i.id === claim.itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const amount = item.price * (percentage / 100);

  claim.percentage = percentage;
  claim.amount = amount;
  claim.updatedAt = new Date().toISOString();

  claims.set(claimId, claim);
  console.log(`🔄 Updated claim: ${claim.participantName} now claims ${percentage}% of ${item.name}`);

  // Broadcast to WebSocket
  broadcastToBill(claim.billId, {
    type: 'CLAIM_UPDATED',
    payload: { claim },
    timestamp: new Date().toISOString(),
  });

  res.json({ claim });
});

// Delete a claim
app.delete('/api/claims/:claimId', (req, res) => {
  const { claimId } = req.params;

  const claim = claims.get(claimId);
  if (!claim) {
    return res.status(404).json({ error: 'Claim not found' });
  }

  const billId = claim.billId;
  claims.delete(claimId);
  console.log(`🗑️ Deleted claim: ${claim.participantName} unclaimed ${claim.percentage}% of item`);

  // Broadcast to WebSocket
  broadcastToBill(billId, {
    type: 'CLAIM_DELETED',
    payload: { claimId },
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true });
});

// WebSocket Server
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

function broadcastToBill(billId: string, message: any) {
  const billConnections = Array.from(connections.values()).filter(
    (conn: any) => conn.billId === billId
  );

  console.log(`📢 Broadcasting ${message.type} to ${billConnections.length} connections for bill ${billId}`);

  billConnections.forEach((conn: any) => {
    if (conn.ws.readyState === 1) {
      // OPEN
      console.log(`   → Sending to connection ${conn.connectionId} (user: ${conn.userId})`);
      conn.ws.send(JSON.stringify(message));
    } else {
      console.log(`   ⚠️ Connection ${conn.connectionId} not open (state: ${conn.ws.readyState})`);
    }
  });
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const billId = url.searchParams.get('billId');
  const userId = url.searchParams.get('userId');
  const connectionId = randomUUID();

  console.log(`🔌 WebSocket connected: ${connectionId} (bill: ${billId})`);

  connections.set(connectionId, { ws, billId, userId, connectionId });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received message:`, message);

      if (message.action === 'subscribe') {
        console.log(`📡 Subscribed to bill: ${message.billId}`);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 WebSocket disconnected: ${connectionId}`);
    connections.delete(connectionId);
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error:`, error);
  });
});

// Start servers
app.listen(PORT, () => {
  console.log(`\n🚀 Local Mock Server Started!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📡 REST API:       http://localhost:${PORT}`);
  console.log(`🔌 WebSocket:      ws://localhost:${WS_PORT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(`Available endpoints:`);
  console.log(`  POST   /api/bills              - Create bill`);
  console.log(`  POST   /api/bills/manual       - Create manual bill`);
  console.log(`  POST   /api/bills/upload       - Upload receipt (with Textract mock)`);
  console.log(`  GET    /api/bills/:id          - Get bill`);
  console.log(`  GET    /api/bills/:id/summary  - Get bill summary`);
  console.log(`  PUT    /api/bills/:id/amounts  - Update amounts`);
  console.log(`  POST   /api/participants       - Create participant`);
  console.log(`  POST   /api/claims             - Create claim`);
  console.log(`  PUT    /api/claims/:id         - Update claim`);
  console.log(`  DELETE /api/claims/:id         - Delete claim\n`);
});

httpServer.listen(WS_PORT, () => {
  console.log(`✅ WebSocket server ready\n`);
});
