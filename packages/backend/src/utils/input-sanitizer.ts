/**
 * Input sanitization utilities for security hardening
 */

/**
 * Sanitize string input by removing potentially dangerous characters
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Trim whitespace
  let sanitized = input.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Sanitize HTML by escaping special characters
 */
export function escapeHtml(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return input.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Sanitize filename by removing path traversal attempts and dangerous characters
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') {
    return 'file';
  }

  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\./g, '');
  sanitized = sanitized.replace(/[\/\\]/g, '');

  // Remove dangerous characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Ensure filename is not empty
  if (sanitized.length === 0) {
    sanitized = 'file';
  }

  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, 255 - ext.length);
    sanitized = name + ext;
  }

  return sanitized;
}

/**
 * Validate and sanitize email address
 */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== 'string') {
    return null;
  }

  const sanitized = email.trim().toLowerCase();

  // Basic email validation regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(sanitized)) {
    return null;
  }

  // Additional length check
  if (sanitized.length > 254) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(
  input: any,
  min?: number,
  max?: number
): number | null {
  const num = Number(input);

  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  if (min !== undefined && num < min) {
    return null;
  }

  if (max !== undefined && num > max) {
    return null;
  }

  return num;
}

/**
 * Sanitize boolean input
 */
export function sanitizeBoolean(input: any): boolean {
  if (typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'string') {
    const lower = input.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }

  if (typeof input === 'number') {
    return input !== 0;
  }

  return false;
}

/**
 * Sanitize URL by validating protocol and structure
 */
export function sanitizeUrl(url: string, allowedProtocols: string[] = ['http', 'https']): string | null {
  if (typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);

    // Check if protocol is allowed
    const protocol = parsed.protocol.replace(':', '');
    if (!allowedProtocols.includes(protocol)) {
      return null;
    }

    // Prevent javascript: and data: URLs
    if (protocol === 'javascript' || protocol === 'data') {
      return null;
    }

    return parsed.toString();
  } catch (error) {
    return null;
  }
}

/**
 * Sanitize object by applying sanitization to all string values
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  maxStringLength: number = 1000
): T {
  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value, maxStringLength);
    } else if (typeof value === 'number') {
      sanitized[key] = value;
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'string' ? sanitizeString(item, maxStringLength) : item
      );
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, maxStringLength);
    }
  }

  return sanitized as T;
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize and validate ID (alphanumeric with hyphens and underscores)
 */
export function sanitizeId(id: string, maxLength: number = 100): string | null {
  if (typeof id !== 'string') {
    return null;
  }

  const sanitized = id.trim();

  // Only allow alphanumeric, hyphens, and underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return null;
  }

  if (sanitized.length === 0 || sanitized.length > maxLength) {
    return null;
  }

  return sanitized;
}

/**
 * Remove SQL injection patterns (basic protection)
 */
export function removeSQLInjectionPatterns(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove common SQL injection patterns
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|;|\/\*|\*\/|xp_|sp_)/gi,
    /('|(\\')|(--)|(-)|(\+)|(\|\|))/gi,
  ];

  let sanitized = input;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.trim();
}

/**
 * Remove XSS patterns
 */
export function removeXSSPatterns(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove script tags and event handlers
  let sanitized = input;
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  return sanitized;
}
