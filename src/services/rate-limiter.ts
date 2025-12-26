/**
 * Rate Limiter Service
 * Token Bucket algorithm for TDX API rate limiting (50 req/s)
 */

export interface RateLimiterConfig {
  /** Maximum number of tokens in the bucket (default: 50) */
  maxTokens: number;
  /** Tokens added per second (default: 50) */
  refillRate: number;
  /** Delay between retry attempts when waiting for tokens (default: 100ms) */
  retryAfterMs: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 50,
  refillRate: 50,
  retryAfterMs: 100,
  maxRetries: 3,
};

/**
 * Error thrown when rate limit is exceeded and max retries exhausted
 */
export class RateLimitError extends Error {
  public readonly code = 'RATE_LIMIT_EXCEEDED';
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Token Bucket Rate Limiter
 *
 * Implements the token bucket algorithm to enforce rate limits.
 * - Tokens are consumed on each request
 * - Tokens are refilled at a fixed rate over time
 * - When bucket is empty, requests must wait
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private tokens: number;
  private lastRefillTime: number;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokens = this.config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Try to acquire a token without waiting
   * @returns true if token was acquired, false if no tokens available
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Acquire a token, waiting if necessary
   * @throws RateLimitError if max retries exceeded
   */
  async acquire(): Promise<void> {
    let attempts = 0;

    while (attempts <= this.config.maxRetries) {
      if (this.tryAcquire()) {
        return;
      }

      attempts++;

      if (attempts > this.config.maxRetries) {
        throw new RateLimitError(
          'API 請求過於頻繁，請稍後再試',
          this.config.retryAfterMs
        );
      }

      await this.sleep(this.config.retryAfterMs);
    }
  }

  /**
   * Reset the bucket to full capacity
   */
  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Get the current number of available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const elapsedSeconds = elapsedMs / 1000;

    // Calculate tokens to add
    const tokensToAdd = elapsedSeconds * this.config.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(
        this.config.maxTokens,
        this.tokens + tokensToAdd
      );
      this.lastRefillTime = now;
    }
  }

  /**
   * Sleep for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance with default TDX config
export const rateLimiter = new RateLimiter();
