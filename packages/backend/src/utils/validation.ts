/**
 * Server-side validation utilities with input sanitization
 */

import {
  sanitizeString,
  sanitizeNumber,
  sanitizeId,
  removeSQLInjectionPatterns,
  removeXSSPatterns,
} from './input-sanitizer.js';

export class ValidationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate claim percentage is between 0 and 100
 */
export function validateClaimPercentage(percentage: number): void {
  if (typeof percentage !== 'number' || isNaN(percentage)) {
    throw new ValidationError(
      'INVALID_CLAIM_PERCENTAGE',
      'Claim percentage must be a valid number'
    );
  }

  if (percentage < 0 || percentage > 100) {
    throw new ValidationError(
      'INVALID_CLAIM_PERCENTAGE',
      'Claim percentage must be between 0 and 100',
      { percentage }
    );
  }
}

/**
 * Validate amount is positive
 */
export function validatePositiveAmount(amount: number, fieldName: string = 'Amount'): void {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new ValidationError(
      'INVALID_AMOUNT',
      `${fieldName} must be a valid number`
    );
  }

  if (amount < 0) {
    throw new ValidationError(
      'INVALID_AMOUNT',
      `${fieldName} must be a positive number`,
      { amount, fieldName }
    );
  }
}

/**
 * Validate bill exists and is not expired
 */
export function validateBillStatus(bill: any): void {
  if (!bill) {
    throw new ValidationError(
      'BILL_NOT_FOUND',
      'Bill not found'
    );
  }

  // Check if bill is expired
  const now = new Date();
  const expiresAt = new Date(bill.expiresAt);
  
  if (now > expiresAt) {
    throw new ValidationError(
      'BILL_EXPIRED',
      'This bill has expired and is no longer available'
    );
  }
}

/**
 * Validate bill is ready for operations
 */
export function validateBillReady(bill: any): void {
  validateBillStatus(bill);

  if (bill.status !== 'ready') {
    throw new ValidationError(
      'BILL_NOT_READY',
      'Bill is still processing and not ready for operations',
      { status: bill.status }
    );
  }
}

/**
 * Validate total claimed percentage doesn't exceed 100%
 */
export function validateTotalClaimed(
  existingClaims: Array<{ percentage: number; id?: string }>,
  newPercentage: number,
  excludeClaimId?: string
): void {
  const totalClaimed = existingClaims
    .filter(claim => claim.id !== excludeClaimId)
    .reduce((sum, claim) => sum + claim.percentage, 0);

  const newTotal = totalClaimed + newPercentage;

  if (newTotal > 100) {
    throw new ValidationError(
      'ITEM_OVER_CLAIMED',
      'Total claimed percentage exceeds 100%',
      {
        totalClaimed,
        newPercentage,
        newTotal,
        exceededBy: newTotal - 100
      }
    );
  }
}

/**
 * Validate and sanitize string input
 */
export function validateAndSanitizeString(
  value: string,
  fieldName: string,
  maxLength: number = 1000
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(
      'INVALID_INPUT',
      `${fieldName} must be a non-empty string`
    );
  }

  // Sanitize the string
  let sanitized = sanitizeString(value, maxLength);
  
  // Remove SQL injection patterns
  sanitized = removeSQLInjectionPatterns(sanitized);
  
  // Remove XSS patterns
  sanitized = removeXSSPatterns(sanitized);

  if (sanitized.trim().length === 0) {
    throw new ValidationError(
      'INVALID_INPUT',
      `${fieldName} contains invalid characters`
    );
  }

  return sanitized;
}

/**
 * Validate string is not empty (legacy - use validateAndSanitizeString instead)
 */
export function validateNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(
      'INVALID_INPUT',
      `${fieldName} must be a non-empty string`
    );
  }
}

/**
 * Validate and sanitize ID
 */
export function validateAndSanitizeId(value: string, fieldName: string): string {
  const sanitized = sanitizeId(value);
  
  if (!sanitized) {
    throw new ValidationError(
      'INVALID_ID',
      `${fieldName} must be a valid ID (alphanumeric with hyphens and underscores only)`
    );
  }

  return sanitized;
}

/**
 * Validate and sanitize numeric input
 */
export function validateAndSanitizeNumber(
  value: any,
  fieldName: string,
  min?: number,
  max?: number
): number {
  const sanitized = sanitizeNumber(value, min, max);
  
  if (sanitized === null) {
    throw new ValidationError(
      'INVALID_NUMBER',
      `${fieldName} must be a valid number${min !== undefined ? ` >= ${min}` : ''}${max !== undefined ? ` <= ${max}` : ''}`
    );
  }

  return sanitized;
}

/**
 * Validate array is not empty
 */
export function validateNonEmptyArray(value: any[], fieldName: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(
      'INVALID_INPUT',
      `${fieldName} must be a non-empty array`
    );
  }
}
