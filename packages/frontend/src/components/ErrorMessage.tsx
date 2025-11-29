import { ApiClientError } from '../utils/api-client';

interface ErrorMessageProps {
  error: Error | ApiClientError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/**
 * Display user-friendly error messages
 */
export function ErrorMessage({ error, onRetry, onDismiss }: ErrorMessageProps) {
  if (!error) return null;

  const isApiError = error instanceof ApiClientError;
  const isNetworkError = error instanceof TypeError && error.message.includes('fetch');

  let title = 'Error';
  let message = error.message;
  let showRetry = false;

  if (isNetworkError) {
    title = 'Connection Error';
    message = 'Unable to connect to the server. Please check your internet connection.';
    showRetry = true;
  } else if (isApiError) {
    const apiError = error as ApiClientError;
    
    switch (apiError.error.code) {
      case 'BILL_NOT_FOUND':
        title = 'Bill Not Found';
        message = 'The bill you are looking for does not exist or has been deleted.';
        break;
      case 'BILL_EXPIRED':
        title = 'Bill Expired';
        message = 'This bill has expired and is no longer available.';
        break;
      case 'BILL_NOT_READY':
        title = 'Processing Receipt';
        message = 'The receipt is still being processed. Please wait a moment and try again.';
        showRetry = true;
        break;
      case 'ITEM_IS_SHARED':
        title = 'Cannot Claim Shared Item';
        message = 'This item has been marked as shared by the payer and cannot be claimed individually.';
        break;
      case 'INVALID_CLAIM_PERCENTAGE':
        title = 'Invalid Claim';
        message = 'The claim percentage must be between 0 and 100.';
        break;
      case 'ITEM_OVER_CLAIMED':
        title = 'Item Over-Claimed';
        message = 'The total claimed percentage for this item exceeds 100%.';
        break;
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
        title = 'Access Denied';
        message = 'You do not have permission to perform this action.';
        break;
      case 'TEXTRACT_FAILED':
        title = 'Receipt Processing Failed';
        message = 'We could not extract information from the receipt. Please try uploading a clearer image.';
        showRetry = true;
        break;
      default:
        title = 'Error';
        message = apiError.error.message || 'An unexpected error occurred.';
        showRetry = apiError.error.retryable;
    }
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="w-5 h-5 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">{title}</h3>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          {(showRetry || onDismiss) && (
            <div className="mt-3 flex gap-2">
              {showRetry && onRetry && (
                <button
                  onClick={onRetry}
                  className="text-sm font-medium text-red-800 hover:text-red-900 underline"
                >
                  Try Again
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="text-sm font-medium text-red-800 hover:text-red-900 underline"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
