/**
 * Retry Service
 * Exponential backoff with jitter for transient error handling
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs: number;
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: unknown) => boolean;
  /** Callback called on each retry */
  onRetry?: (error: unknown, attempt: number) => void;
}

export const DEFAULT_RETRY_CONFIG: Omit<RetryConfig, 'shouldRetry' | 'onRetry'> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/** HTTP status codes that should be retried */
export const RETRYABLE_STATUSES = [
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
];

/**
 * Error thrown when all retry attempts are exhausted
 */
export class RetryError extends Error {
  public readonly code = 'RETRY_EXHAUSTED';
  public readonly originalError: unknown;
  public readonly attempts: number;

  constructor(message: string, originalError: unknown, attempts: number) {
    super(message);
    this.name = 'RetryError';
    this.originalError = originalError;
    this.attempts = attempts;
  }
}

/**
 * Calculate backoff delay with jitter
 * @param attempt The current attempt number (1-based)
 * @param config Configuration with baseDelayMs and maxDelayMs
 * @returns Delay in milliseconds
 */
export function calculateBackoff(
  attempt: number,
  config: Pick<RetryConfig, 'baseDelayMs' | 'maxDelayMs'>
): number {
  if (config.baseDelayMs === 0) {
    return 0;
  }

  // Ensure attempt is at least 1
  const normalizedAttempt = Math.max(1, attempt);

  // Calculate exponential delay: baseDelay * 2^(attempt-1)
  const exponentialDelay = config.baseDelayMs * Math.pow(2, normalizedAttempt - 1);

  // Cap at maxDelayMs
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (0-10% of base delay)
  const jitter = Math.random() * config.baseDelayMs * 0.1;

  return cappedDelay + jitter;
}

/**
 * Check if an HTTP status code should be retried
 * @param status HTTP status code
 * @param retryableStatuses Optional custom list of retryable statuses
 */
export function isRetryableStatus(
  status: number,
  retryableStatuses: number[] = RETRYABLE_STATUSES
): boolean {
  return retryableStatuses.includes(status);
}

/**
 * Default function to determine if an error is retryable
 */
function defaultShouldRetry(error: unknown): boolean {
  // Check for HTTP status
  if (error && typeof error === 'object' && 'status' in error) {
    return isRetryableStatus((error as { status: number }).status);
  }

  // Check for network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    );
  }

  return false;
}

type RetryableFunction<T> = (context: { attempt: number }) => Promise<T>;

/**
 * Execute a function with retry logic
 * @param fn The async function to execute
 * @param config Retry configuration
 * @returns The result of the function
 * @throws RetryError if all retries are exhausted
 */
export async function retry<T>(
  fn: RetryableFunction<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
    shouldRetry: config.shouldRetry ?? defaultShouldRetry,
  };

  let lastError: unknown;
  let attempt = 0;
  const maxAttempts = fullConfig.maxRetries + 1; // 1 initial + maxRetries

  while (attempt < maxAttempts) {
    attempt++;

    try {
      return await fn({ attempt });
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = fullConfig.shouldRetry!(error);

      // If not retryable or this was the last allowed attempt, throw
      if (!shouldRetry || attempt >= maxAttempts) {
        // If we exhausted retries on a retryable error AND at least one retry was attempted
        // (attempt > 1 means we did at least one retry), wrap in RetryError
        if (shouldRetry && attempt >= maxAttempts && fullConfig.maxRetries > 0) {
          throw new RetryError(
            `重試 ${attempt} 次後仍失敗`,
            error,
            attempt
          );
        }
        // Otherwise throw the original error
        throw error;
      }

      // Call onRetry callback if provided
      if (fullConfig.onRetry) {
        fullConfig.onRetry(error, attempt);
      }

      // Wait before retrying
      const delay = calculateBackoff(attempt, fullConfig);
      await sleep(delay);
    }
  }

  // Should not reach here, but just in case
  throw new RetryError(
    `重試 ${attempt} 次後仍失敗`,
    lastError,
    attempt
  );
}

/**
 * Sleep for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
