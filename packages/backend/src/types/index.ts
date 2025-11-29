import { z } from 'zod';

// Line Item Schema
export const LineItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
  isShared: z.boolean().default(false),
  sharedAmongCount: z.number().int().positive().optional(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

// Fee Schema
export const FeeSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number().positive(),
});

export type Fee = z.infer<typeof FeeSchema>;

// Bill Schema
export const BillSchema = z.object({
  id: z.string(),
  payerId: z.string(),
  receiptImageUrl: z.string(),
  lineItems: z.array(LineItemSchema),
  extractedTax: z.number().nonnegative(),
  extractedTip: z.number().nonnegative(),
  adjustedTax: z.number().nonnegative().optional(),
  adjustedTip: z.number().nonnegative().optional(),
  additionalFees: z.array(FeeSchema).default([]),
  createdAt: z.string(),
  expiresAt: z.string(),
  shareUrl: z.string(),
  status: z.enum(['processing', 'ready', 'error']),
});

export type Bill = z.infer<typeof BillSchema>;

// Claim Schema
export const ClaimSchema = z.object({
  id: z.string(),
  billId: z.string(),
  participantId: z.string(),
  participantName: z.string(),
  itemId: z.string(),
  percentage: z.number().min(0).max(100),
  amount: z.number().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Claim = z.infer<typeof ClaimSchema>;

// Participant Schema
export const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export type Participant = z.infer<typeof ParticipantSchema>;

// Re-export Textract types
export * from './textract.js';

// Re-export WebSocket types
export * from './websocket.js';
