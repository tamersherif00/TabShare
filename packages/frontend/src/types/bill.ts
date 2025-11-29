export interface LineItem {
  id: string;
  name: string;
  price: number;
  isShared: boolean;
  sharedAmongCount?: number;
  // For combined items - stores original items for uncombining
  combinedFrom?: { id: string; name: string; price: number }[];
}

export interface Claim {
  id: string;
  billId: string;
  participantId: string;
  participantName: string;
  itemId: string;
  percentage: number;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Fee {
  id: string;
  description: string;
  amount: number;
}

export interface Bill {
  id: string;
  payerId: string;
  receiptImageUrl: string;
  lineItems: LineItem[];
  extractedTax: number;
  extractedTip: number;
  adjustedTax?: number;
  adjustedTip?: number;
  additionalFees: Fee[];
  createdAt: string;
  expiresAt: string;
  shareUrl: string;
  status: 'processing' | 'ready' | 'error';
  // Metadata from receipt
  vendorName?: string;
  receiptDate?: string;
  receiptTime?: string;
  numberOfGuests?: number;
  // Payment info
  venmoUsername?: string;
}

export interface ClaimInfo {
  participantId: string;
  participantName: string;
  percentage: number;
  amount: number;
}

export interface LineItemDisplay extends LineItem {
  claims: ClaimInfo[];
  remainingPercentage: number;
  claimStatus: 'unclaimed' | 'partial' | 'full' | 'over-claimed';
}
