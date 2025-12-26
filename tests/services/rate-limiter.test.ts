/**
 * Rate Limiter Tests
 * Token Bucket algorithm for TDX API rate limiting (50 req/s)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter, RateLimitError, type RateLimiterConfig } from '../../src/services/rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const limiter = new RateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create with custom config', () => {
      const config: RateLimiterConfig = {
        maxTokens: 100,
        refillRate: 100,
        retryAfterMs: 200,
        maxRetries: 5,
      };
      const limiter = new RateLimiter(config);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('tryAcquire', () => {
    it('should return true when tokens are available', () => {
      const limiter = new RateLimiter({ maxTokens: 50, refillRate: 50 });
      expect(limiter.tryAcquire()).toBe(true);
    });

    it('should decrement available tokens on each acquire', () => {
      const limiter = new RateLimiter({ maxTokens: 3, refillRate: 1 });
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should return false when no tokens available', () => {
      const limiter = new RateLimiter({ maxTokens: 1, refillRate: 1 });
      limiter.tryAcquire(); // Use the only token
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should refill tokens over time', () => {
      const limiter = new RateLimiter({ maxTokens: 2, refillRate: 1 });

      // Use all tokens
      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.tryAcquire()).toBe(false);

      // Advance time by 1 second - should refill 1 token
      vi.advanceTimersByTime(1000);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);

      // Advance by 2 seconds - should refill 2 tokens (but capped at maxTokens)
      vi.advanceTimersByTime(2000);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should not exceed maxTokens when refilling', () => {
      const limiter = new RateLimiter({ maxTokens: 5, refillRate: 10 });

      // Wait a long time - tokens should cap at maxTokens
      vi.advanceTimersByTime(10000);

      // Should only be able to acquire maxTokens
      for (let i = 0; i < 5; i++) {
        expect(limiter.tryAcquire()).toBe(true);
      }
      expect(limiter.tryAcquire()).toBe(false);
    });
  });

  describe('acquire', () => {
    it('should resolve immediately when tokens available', async () => {
      const limiter = new RateLimiter({ maxTokens: 50, refillRate: 50 });
      await expect(limiter.acquire()).resolves.toBeUndefined();
    });

    it('should wait and resolve when tokens become available', async () => {
      const limiter = new RateLimiter({
        maxTokens: 1,
        refillRate: 1,
        retryAfterMs: 100,
        maxRetries: 20,
      });

      // Use the only token
      limiter.tryAcquire();

      // Start acquire (will need to wait)
      const acquirePromise = limiter.acquire();

      // Should not resolve immediately
      let resolved = false;
      acquirePromise.then(() => { resolved = true; });

      // Advance time in small increments
      await vi.advanceTimersByTimeAsync(500);

      // Should resolve eventually
      await vi.advanceTimersByTimeAsync(1000);
      await expect(acquirePromise).resolves.toBeUndefined();
    });

    it('should throw RateLimitError after max retries', async () => {
      const limiter = new RateLimiter({
        maxTokens: 0,  // No tokens ever available
        refillRate: 0,
        retryAfterMs: 50,
        maxRetries: 3,
      });

      // Start acquire and handle rejection immediately
      let rejected = false;
      let caughtError: RateLimitError | null = null;

      const acquirePromise = limiter.acquire().catch((err) => {
        rejected = true;
        caughtError = err;
      });

      // Advance time to trigger all retries
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await acquirePromise;
      expect(rejected).toBe(true);
      expect(caughtError).toBeInstanceOf(RateLimitError);
    });

    it('should include retryAfter in RateLimitError', async () => {
      const limiter = new RateLimiter({
        maxTokens: 0,
        refillRate: 0,
        retryAfterMs: 100,
        maxRetries: 1,
      });

      let caughtError: RateLimitError | null = null;

      const acquirePromise = limiter.acquire().catch((err) => {
        caughtError = err;
      });

      await vi.advanceTimersByTimeAsync(200);
      await acquirePromise;

      expect(caughtError).toBeInstanceOf(RateLimitError);
      expect(caughtError!.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should restore tokens to maxTokens', () => {
      const limiter = new RateLimiter({ maxTokens: 5, refillRate: 1 });

      // Use all tokens
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.tryAcquire()).toBe(false);

      // Reset
      limiter.reset();

      // Should have all tokens back
      for (let i = 0; i < 5; i++) {
        expect(limiter.tryAcquire()).toBe(true);
      }
    });
  });

  describe('getAvailableTokens', () => {
    it('should return current available tokens', () => {
      const limiter = new RateLimiter({ maxTokens: 10, refillRate: 1 });
      expect(limiter.getAvailableTokens()).toBe(10);

      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.getAvailableTokens()).toBe(8);
    });

    it('should account for refilled tokens', () => {
      const limiter = new RateLimiter({ maxTokens: 10, refillRate: 5 });

      // Use all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.getAvailableTokens()).toBe(0);

      // Advance 1 second
      vi.advanceTimersByTime(1000);
      expect(limiter.getAvailableTokens()).toBe(5);
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent tryAcquire calls', () => {
      const limiter = new RateLimiter({ maxTokens: 3, refillRate: 1 });

      const results = [
        limiter.tryAcquire(),
        limiter.tryAcquire(),
        limiter.tryAcquire(),
        limiter.tryAcquire(),
        limiter.tryAcquire(),
      ];

      expect(results).toEqual([true, true, true, false, false]);
    });

    it('should handle multiple concurrent acquire calls', async () => {
      const limiter = new RateLimiter({
        maxTokens: 2,
        refillRate: 10,
        retryAfterMs: 50,
        maxRetries: 10,
      });

      // Start 5 concurrent acquires
      const promises = [
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire(),
      ];

      // First 2 should resolve immediately
      // Rest should wait for refill

      // Advance time to allow refills
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      // All should resolve
      const results = await Promise.all(promises);
      expect(results.every(r => r === undefined)).toBe(true);
    });
  });

  describe('TDX API defaults', () => {
    it('should default to 50 req/s rate limit', () => {
      const limiter = new RateLimiter();

      // Should be able to make 50 requests
      for (let i = 0; i < 50; i++) {
        expect(limiter.tryAcquire()).toBe(true);
      }
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should refill at 50 tokens/second', () => {
      const limiter = new RateLimiter();

      // Use all 50 tokens
      for (let i = 0; i < 50; i++) {
        limiter.tryAcquire();
      }

      // After 1 second, should have 50 tokens again
      vi.advanceTimersByTime(1000);
      expect(limiter.getAvailableTokens()).toBe(50);
    });
  });

  describe('edge cases', () => {
    it('should handle fractional token refill', () => {
      const limiter = new RateLimiter({ maxTokens: 10, refillRate: 1 });

      limiter.tryAcquire();
      expect(limiter.getAvailableTokens()).toBe(9);

      // Advance 500ms - should refill 0.5 tokens (rounds down)
      vi.advanceTimersByTime(500);
      expect(limiter.getAvailableTokens()).toBe(9);

      // Advance another 500ms - now should have 10
      vi.advanceTimersByTime(500);
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('should handle zero maxTokens', () => {
      const limiter = new RateLimiter({ maxTokens: 0, refillRate: 1 });
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should handle very high refill rate', () => {
      const limiter = new RateLimiter({ maxTokens: 100, refillRate: 1000 });

      // Use all tokens
      for (let i = 0; i < 100; i++) {
        limiter.tryAcquire();
      }

      // After 100ms, should have refilled 100 tokens (capped at maxTokens)
      vi.advanceTimersByTime(100);
      expect(limiter.getAvailableTokens()).toBe(100);
    });
  });
});

describe('RateLimitError', () => {
  it('should be instanceof Error', () => {
    const error = new RateLimitError('test', 1000);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RateLimitError);
  });

  it('should have correct properties', () => {
    const error = new RateLimitError('Rate limit exceeded', 500);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.retryAfter).toBe(500);
    expect(error.name).toBe('RateLimitError');
  });

  it('should have error code', () => {
    const error = new RateLimitError('test', 1000);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
