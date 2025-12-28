import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  retryWithExponentialBackoff,
  calculateExponentialBackoff,
  defaultShouldRetry,
  isRetryableHttpStatus,
  createApiRetryOptions,
  RETRYABLE_HTTP_STATUSES,
  DEFAULT_RETRY_OPTIONS
} from '../../src/lib/retry-strategy.js';

describe('Retry Strategy', () => {
  describe('calculateExponentialBackoff', () => {
    it('should calculate exponential backoff correctly', () => {
      const options = {
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        enableJitter: false
      };

      // 第 1 次重試: 100ms
      expect(calculateExponentialBackoff(1, options)).toBe(100);

      // 第 2 次重試: 200ms
      expect(calculateExponentialBackoff(2, options)).toBe(200);

      // 第 3 次重試: 400ms
      expect(calculateExponentialBackoff(3, options)).toBe(400);

      // 第 4 次重試: 800ms
      expect(calculateExponentialBackoff(4, options)).toBe(800);

      // 第 5 次重試: 1600ms
      expect(calculateExponentialBackoff(5, options)).toBe(1600);
    });

    it('should cap delay at maxDelayMs', () => {
      const options = {
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        enableJitter: false
      };

      // 第 4 次重試會超過 maxDelayMs，應該被限制
      const delay4 = calculateExponentialBackoff(4, options);
      const delay5 = calculateExponentialBackoff(5, options);

      expect(delay4).toBeLessThanOrEqual(1000);
      expect(delay5).toBeLessThanOrEqual(1000);
    });

    it('should add jitter when enabled', () => {
      const options = {
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        enableJitter: true,
        jitterPercentage: 0.1
      };

      const delays = Array.from({ length: 10 }, () =>
        calculateExponentialBackoff(1, options)
      );

      // 所有延遲應該在 100 到 110 毫秒之間（加上 10% 抖動）
      const min = Math.min(...delays);
      const max = Math.max(...delays);

      expect(min).toBeGreaterThanOrEqual(100);
      expect(max).toBeLessThanOrEqual(110);

      // 至少應該有一些變化（不都相等）
      const hasVariation = new Set(delays.map(d => Math.round(d))).size > 1;
      expect(hasVariation).toBe(true);
    });

    it('should not add jitter when disabled', () => {
      const options = {
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        enableJitter: false
      };

      const delays = Array.from({ length: 5 }, () =>
        calculateExponentialBackoff(1, options)
      );

      // 所有延遲應該完全相同
      expect(new Set(delays).size).toBe(1);
      expect(delays[0]).toBe(100);
    });

    it('should handle zero and negative attempt numbers', () => {
      const options = {
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        enableJitter: false
      };

      expect(calculateExponentialBackoff(0, options)).toBe(0);
      expect(calculateExponentialBackoff(-1, options)).toBe(0);
    });
  });

  describe('defaultShouldRetry', () => {
    it('should retry on network errors', () => {
      expect(defaultShouldRetry(new Error('ECONNREFUSED'))).toBe(true);
      expect(defaultShouldRetry(new Error('ETIMEDOUT'))).toBe(true);
      expect(defaultShouldRetry(new Error('Connection timeout'))).toBe(true);
    });

    it('should retry on retryable error codes', () => {
      const error1 = new Error('API Error');
      (error1 as any).code = 'ECONNREFUSED';
      expect(defaultShouldRetry(error1)).toBe(true);

      const error2 = new Error('API Error');
      (error2 as any).status = 429;
      expect(defaultShouldRetry(error2)).toBe(true);
    });

    it('should not retry on non-retryable errors', () => {
      expect(defaultShouldRetry(new Error('Invalid input'))).toBe(false);
      expect(defaultShouldRetry(new Error('Authentication failed'))).toBe(false);

      const error = new Error('API Error');
      (error as any).status = 401;
      expect(defaultShouldRetry(error)).toBe(false);
    });
  });

  describe('isRetryableHttpStatus', () => {
    it('should identify retryable HTTP statuses', () => {
      expect(isRetryableHttpStatus(408)).toBe(true);
      expect(isRetryableHttpStatus(429)).toBe(true);
      expect(isRetryableHttpStatus(500)).toBe(true);
      expect(isRetryableHttpStatus(502)).toBe(true);
      expect(isRetryableHttpStatus(503)).toBe(true);
      expect(isRetryableHttpStatus(504)).toBe(true);
    });

    it('should not identify non-retryable HTTP statuses', () => {
      expect(isRetryableHttpStatus(400)).toBe(false);
      expect(isRetryableHttpStatus(401)).toBe(false);
      expect(isRetryableHttpStatus(403)).toBe(false);
      expect(isRetryableHttpStatus(404)).toBe(false);
    });
  });

  describe('retryWithExponentialBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn(async () => 'success');
      const result = await retryWithExponentialBackoff(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('ECONNREFUSED');
          (error as any).code = 'ECONNREFUSED';
          throw error;
        }
        return 'success';
      });

      const result = await retryWithExponentialBackoff(fn, {
        maxRetries: 5,
        initialDelayMs: 10,
        enableJitter: false
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting retries', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        throw new Error('ECONNREFUSED');
      });

      await expect(
        retryWithExponentialBackoff(fn, {
          maxRetries: 2,
          initialDelayMs: 10,
          enableJitter: false
        })
      ).rejects.toThrow('ECONNREFUSED');

      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should not retry on non-retryable errors', async () => {
      const fn = vi.fn(async () => {
        throw new Error('Invalid input');
      });

      await expect(
        retryWithExponentialBackoff(fn, {
          maxRetries: 5,
          initialDelayMs: 10
        })
      ).rejects.toThrow('Invalid input');

      expect(fn).toHaveBeenCalledTimes(1); // 只嘗試一次
    });

    it('should call onRetry callback', async () => {
      let attempts = 0;
      const onRetry = vi.fn();

      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      await retryWithExponentialBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        enableJitter: false,
        onRetry
      });

      expect(onRetry).toHaveBeenCalledOnce();
      // 驗證回調的參數
      const [error, attemptNumber, nextDelayMs] = onRetry.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(attemptNumber).toBe(1);
      expect(nextDelayMs).toBe(10); // 第 2 次重試的延遲
    });

    it('should respect shouldRetry callback', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        throw new Error('PERMANENT: Invalid config');
      });

      const shouldRetry = vi.fn((error: Error) => {
        // 不重試 PERMANENT 錯誤
        return !error.message.includes('PERMANENT');
      });

      await expect(
        retryWithExponentialBackoff(fn, {
          maxRetries: 5,
          initialDelayMs: 10,
          shouldRetry
        })
      ).rejects.toThrow('PERMANENT');

      expect(fn).toHaveBeenCalledTimes(1); // 只嘗試一次
      expect(shouldRetry).toHaveBeenCalledOnce();
    });

    it('should handle custom backoff multiplier', async () => {
      let attempts = 0;
      let totalDelay = 0;
      const onRetry = vi.fn((error, attemptNumber, nextDelayMs) => {
        totalDelay += nextDelayMs;
      });

      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      await retryWithExponentialBackoff(fn, {
        maxRetries: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 3, // 3x 而不是 2x
        enableJitter: false,
        onRetry
      });

      // 第 1 次重試延遲: 100ms
      // 第 2 次重試延遲: 300ms (100 * 3)
      // 總計: 400ms
      expect(totalDelay).toBe(400);
    });

    it('should work with HTTP errors', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Service Unavailable');
          (error as any).status = 503;
          throw error;
        }
        return 'success';
      });

      const result = await retryWithExponentialBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        enableJitter: false,
        shouldRetry: (error) => {
          const status = (error as any).status;
          return status === 503 || status === 502 || status === 429;
        }
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should track retry attempts correctly', async () => {
      let currentAttempt = 0;
      const attemptNumbers: number[] = [];

      const fn = vi.fn(async () => {
        currentAttempt++;
        attemptNumbers.push(currentAttempt);

        if (currentAttempt < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      await retryWithExponentialBackoff(fn, {
        maxRetries: 5,
        initialDelayMs: 10,
        enableJitter: false
      });

      expect(attemptNumbers).toEqual([1, 2, 3]);
    });

    it('should apply jitter and introduce variation in retry delays', async () => {
      const delays: number[] = [];
      let attempts = 0;

      const onRetry = (error: Error, attemptNumber: number, nextDelayMs: number) => {
        delays.push(nextDelayMs);
      };

      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      await retryWithExponentialBackoff(fn, {
        maxRetries: 5,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        enableJitter: true,
        jitterPercentage: 0.1,
        onRetry
      });

      // 應該有 2 個延遲記錄
      expect(delays.length).toBe(2);

      // 第 1 個延遲應該在 100 到 110 之間（100 + 10% jitter）
      expect(delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[0]).toBeLessThanOrEqual(110);

      // 第 2 個延遲應該在 200 到 220 之間（200 + 10% jitter）
      expect(delays[1]).toBeGreaterThanOrEqual(200);
      expect(delays[1]).toBeLessThanOrEqual(220);
    });
  });

  describe('createApiRetryOptions', () => {
    it('should create standard API retry options', () => {
      const options = createApiRetryOptions();

      expect(options.maxRetries).toBe(3);
      expect(options.initialDelayMs).toBe(100);
      expect(options.maxDelayMs).toBe(5000);
      expect(options.backoffMultiplier).toBe(2);
    });

    it('should allow overrides', () => {
      const options = createApiRetryOptions({
        maxRetries: 5,
        initialDelayMs: 200
      });

      expect(options.maxRetries).toBe(5);
      expect(options.initialDelayMs).toBe(200);
      expect(options.maxDelayMs).toBe(5000); // 保留預設
    });

    it('should retry on retryable HTTP statuses', async () => {
      const options = createApiRetryOptions();
      let attempts = 0;

      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Service Unavailable');
          (error as any).status = 503;
          throw error;
        }
        return 'success';
      });

      const result = await retryWithExponentialBackoff(fn, options);
      expect(result).toBe('success');
    });
  });

  describe('RETRYABLE_HTTP_STATUSES', () => {
    it('should contain expected status codes', () => {
      expect(RETRYABLE_HTTP_STATUSES.REQUEST_TIMEOUT).toBe(408);
      expect(RETRYABLE_HTTP_STATUSES.TOO_MANY_REQUESTS).toBe(429);
      expect(RETRYABLE_HTTP_STATUSES.INTERNAL_SERVER_ERROR).toBe(500);
      expect(RETRYABLE_HTTP_STATUSES.BAD_GATEWAY).toBe(502);
      expect(RETRYABLE_HTTP_STATUSES.SERVICE_UNAVAILABLE).toBe(503);
      expect(RETRYABLE_HTTP_STATUSES.GATEWAY_TIMEOUT).toBe(504);
    });
  });

  describe('DEFAULT_RETRY_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_OPTIONS.initialDelayMs).toBe(100);
      expect(DEFAULT_RETRY_OPTIONS.maxDelayMs).toBe(5000);
      expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_OPTIONS.enableJitter).toBe(true);
      expect(DEFAULT_RETRY_OPTIONS.jitterPercentage).toBe(0.1);
    });
  });
});
