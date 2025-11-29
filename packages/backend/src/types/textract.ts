import { z } from 'zod';

// Extracted Line Item from Textract
export const ExtractedLineItemSchema = z.object({
  name: z.string(),
  price: z.number().positive(),
  confidence: z.number().min(0).max(100),
});

export type ExtractedLineItem = z.infer<typeof ExtractedLineItemSchema>;

// Receipt Analysis Result
export const ReceiptAnalysisSchema = z.object({
  lineItems: z.array(ExtractedLineItemSchema),
  tax: z.number().nonnegative(),
  tip: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
  serviceCharge: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(100),
  // Additional metadata fields
  vendorName: z.string().optional(),
  receiptDate: z.string().optional(),
  receiptTime: z.string().optional(),
  numberOfGuests: z.number().optional(),
});

export type ReceiptAnalysis = z.infer<typeof ReceiptAnalysisSchema>;

// Analysis Status
export const AnalysisStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'SUCCEEDED', 'FAILED']),
  result: ReceiptAnalysisSchema.optional(),
  error: z.string().optional(),
});

export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

// Textract Job Status for DynamoDB
export const TextractJobSchema = z.object({
  jobId: z.string(),
  billId: z.string(),
  s3Key: z.string(),
  status: z.enum(['IN_PROGRESS', 'SUCCEEDED', 'FAILED']),
  attempts: z.number().int().min(0).max(3),
  result: ReceiptAnalysisSchema.optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TextractJob = z.infer<typeof TextractJobSchema>;
