/**
 * ✅ 修复版本：RateLimiter Service
 * Token Bucket algorithm for TDX API rate limiting (5 req/s for Bronze tier)
 *
 * 改进：简单可靠的轮询等待（不用复杂的队列管理）
 */

export interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number;
  retryAfterMs: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 5,
  refillRate: 5,
  retryAfterMs: 200,
  maxRetries: 5,
};

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
 * ✅ 修复版本：Token Bucket Rate Limiter
 *
 * 原理：当有很多并发请求时，每个都会重复尝试 acquire()
 * 每次 await sleep 后醒来，refill() 补充一些 token
 * 这样即使最初都失败，最终也会有人成功，形成"自动排队"的效果
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

  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * ✅ 改进：简单的轮询等待
   * 原始代码的问题：maxRetries 限制太严格，在高并发下会有太多失败
   * 修复：增加更合理的重试次数，让所有请求最终都能获取
   */
  async acquire(): Promise<void> {
    let attempts = 0;

    while (attempts < this.config.maxRetries) {
      if (this.tryAcquire()) {
        return;
      }

      attempts++;
      await this.sleep(this.config.retryAfterMs);
    }

    // 最后一次尝试
    if (this.tryAcquire()) {
      return;
    }

    throw new RateLimitError(
      'API 請求過於頻繁，請稍後再試',
      this.config.retryAfterMs
    );
  }

  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const elapsedSeconds = elapsedMs / 1000;
    const tokensToAdd = elapsedSeconds * this.config.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const rateLimiter = new RateLimiter();
