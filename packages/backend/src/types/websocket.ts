import { z } from 'zod';
import { ClaimSchema } from './index.js';

// WebSocket Message Types
export type WebSocketMessageType =
  | 'CLAIM_CREATED'
  | 'CLAIM_UPDATED'
  | 'CLAIM_DELETED'
  | 'BILL_UPDATED'
  | 'PARTICIPANT_JOINED';

// WebSocket Broadcast Message Schema
export const BroadcastMessageSchema = z.object({
  type: z.enum([
    'CLAIM_CREATED',
    'CLAIM_UPDATED',
    'CLAIM_DELETED',
    'BILL_UPDATED',
    'PARTICIPANT_JOINED',
  ]),
  payload: z.any(),
  timestamp: z.string(),
});

export type BroadcastMessage = z.infer<typeof BroadcastMessageSchema>;

// Specific message payload schemas
export const ClaimCreatedPayloadSchema = z.object({
  claim: ClaimSchema,
  itemId: z.string(),
  remainingPercentage: z.number(),
});

export type ClaimCreatedPayload = z.infer<typeof ClaimCreatedPayloadSchema>;

export const ClaimUpdatedPayloadSchema = z.object({
  claim: ClaimSchema,
  itemId: z.string(),
  remainingPercentage: z.number(),
});

export type ClaimUpdatedPayload = z.infer<typeof ClaimUpdatedPayloadSchema>;

export const ClaimDeletedPayloadSchema = z.object({
  claimId: z.string(),
  itemId: z.string(),
  participantId: z.string(),
  remainingPercentage: z.number(),
});

export type ClaimDeletedPayload = z.infer<typeof ClaimDeletedPayloadSchema>;

export const BillUpdatedPayloadSchema = z.object({
  billId: z.string(),
  updates: z.object({
    adjustedTax: z.number().optional(),
    adjustedTip: z.number().optional(),
    additionalFees: z.array(z.any()).optional(),
    sharedItems: z.array(z.any()).optional(),
  }),
});

export type BillUpdatedPayload = z.infer<typeof BillUpdatedPayloadSchema>;

export const ParticipantJoinedPayloadSchema = z.object({
  participantId: z.string(),
  participantName: z.string(),
  billId: z.string(),
});

export type ParticipantJoinedPayload = z.infer<
  typeof ParticipantJoinedPayloadSchema
>;

// WebSocket Connection Schema
export const WebSocketConnectionSchema = z.object({
  connectionId: z.string(),
  billId: z.string(),
  userId: z.string(),
  connectedAt: z.string(),
  ttl: z.number(),
});

export type WebSocketConnection = z.infer<typeof WebSocketConnectionSchema>;
