/**
 * API client with retry logic and exponential backoff
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

interface ApiError {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
}

export class ApiClientError extends Error {
  constructor(
    public statusCode: number,
    public error: ApiError
  ) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // API errors marked as retryable
  if (error instanceof ApiClientError && error.error.retryable) {
    return true;
  }

  // 5xx server errors
  if (error instanceof ApiClientError && error.statusCode >= 500) {
    return true;
  }

  // 429 Too Many Requests
  if (error instanceof ApiClientError && error.statusCode === 429) {
    return true;
  }

  return false;
}

/**
 * Make an API request with retry logic
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
  } = retryOptions;

  const url = `${API_BASE_URL}${endpoint}`;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // Parse response body
      const data = await response.json();

      // Handle error responses
      if (!response.ok) {
        const apiError = data.error || {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
          retryable: response.status >= 500,
        };

        throw new ApiClientError(response.status, apiError);
      }

      return data as T;
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!isRetryableError(error)) {
        break;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, initialDelay, maxDelay, backoffMultiplier);
      console.log(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);

      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * GET request
 */
export async function get<T>(endpoint: string, retryOptions?: RetryOptions): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' }, retryOptions);
}

/**
 * POST request
 */
export async function post<T>(
  endpoint: string,
  body?: any,
  retryOptions?: RetryOptions
): Promise<T> {
  return apiRequest<T>(
    endpoint,
    {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    },
    retryOptions
  );
}

/**
 * PATCH request
 */
export async function patch<T>(
  endpoint: string,
  body?: any,
  retryOptions?: RetryOptions
): Promise<T> {
  return apiRequest<T>(
    endpoint,
    {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    },
    retryOptions
  );
}

/**
 * DELETE request
 */
export async function del<T>(endpoint: string, retryOptions?: RetryOptions): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' }, retryOptions);
}

/**
 * Upload file with multipart/form-data
 */
export async function uploadFile<T>(
  endpoint: string,
  formData: FormData,
  retryOptions?: RetryOptions
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
  } = retryOptions || {};

  const url = `${API_BASE_URL}${endpoint}`;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser will set it with boundary
      });

      const data = await response.json();

      if (!response.ok) {
        const apiError = data.error || {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
          retryable: response.status >= 500,
        };

        throw new ApiClientError(response.status, apiError);
      }

      return data as T;
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !isRetryableError(error)) {
        break;
      }

      const delay = calculateBackoff(attempt, initialDelay, maxDelay, backoffMultiplier);
      console.log(`Upload failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);

      await sleep(delay);
    }
  }

  throw lastError;
}
