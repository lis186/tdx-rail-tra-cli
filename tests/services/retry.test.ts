/**
 * Retry Service Tests
 * Exponential backoff with jitter for transient error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retry,
  calculateBackoff,
  isRetryableStatus,
  RetryError,
  type RetryConfig,
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_STATUSES,
} from '../../src/services/retry.js';

describe('calculateBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should calculate exponential backoff for attempt 1', () => {
    // First attempt: baseDelay * 2^0 = 1000ms
    const delay = calculateBackoff(1, { baseDelayMs: 1000, maxDelayMs: 10000 });
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(1100); // +10% jitter max
  });

  it('should calculate exponential backoff for attempt 2', () => {
    // Second attempt: baseDelay * 2^1 = 2000ms
    const delay = calculateBackoff(2, { baseDelayMs: 1000, maxDelayMs: 10000 });
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(2200); // +10% jitter max
  });

  it('should calculate exponential backoff for attempt 3', () => {
    // Third attempt: baseDelay * 2^2 = 4000ms
    const delay = calculateBackoff(3, { baseDelayMs: 1000, maxDelayMs: 10000 });
    expect(delay).toBeGreaterThanOrEqual(4000);
    expect(delay).toBeLessThanOrEqual(4400); // +10% jitter max
  });

  it('should cap at maxDelayMs', () => {
    // Very high attempt: should be capped
    const delay = calculateBackoff(10, { baseDelayMs: 1000, maxDelayMs: 5000 });
    expect(delay).toBeLessThanOrEqual(5500); // maxDelay + jitter
  });

  it('should add jitter to delay', () => {
    // Run multiple times - should get different values
    const delays = new Set<number>();
    for (let i = 0; i < 10; i++) {
      delays.add(calculateBackoff(1, { baseDelayMs: 1000, maxDelayMs: 10000 }));
    }
    // With randomness, we should get multiple different values
    expect(delays.size).toBeGreaterThan(1);
  });

  it('should handle zero base delay', () => {
    const delay = calculateBackoff(1, { baseDelayMs: 0, maxDelayMs: 1000 });
    expect(delay).toBe(0);
  });

  it('should handle attempt 0 same as attempt 1', () => {
    const delay0 = calculateBackoff(0, { baseDelayMs: 1000, maxDelayMs: 10000 });
    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay0).toBeLessThanOrEqual(1100);
  });
});

describe('isRetryableStatus', () => {
  describe('default retryable statuses', () => {
    it.each([
      [408, 'Request Timeout'],
      [429, 'Too Many Requests'],
      [500, 'Internal Server Error'],
      [502, 'Bad Gateway'],
      [503, 'Service Unavailable'],
      [504, 'Gateway Timeout'],
    ])('should return true for %i (%s)', (status) => {
      expect(isRetryableStatus(status)).toBe(true);
    });
  });

  describe('non-retryable statuses', () => {
    it.each([
      [200, 'OK'],
      [201, 'Created'],
      [400, 'Bad Request'],
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [404, 'Not Found'],
      [405, 'Method Not Allowed'],
      [422, 'Unprocessable Entity'],
    ])('should return false for %i (%s)', (status) => {
      expect(isRetryableStatus(status)).toBe(false);
    });
  });

  describe('custom retryable statuses', () => {
    it('should use custom status list when provided', () => {
      expect(isRetryableStatus(418, [418, 451])).toBe(true);
      expect(isRetryableStatus(429, [418, 451])).toBe(false);
    });
  });
});

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = retry(fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 502 })
      .mockResolvedValue('success');

    const resultPromise = retry(fn, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 });

    // Advance through retries
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(400);

    const result = await resultPromise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });

    let caughtError: unknown = null;
    const resultPromise = retry(fn, { maxRetries: 3 }).catch((err) => {
      caughtError = err;
    });
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(caughtError).toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw RetryError after max retries', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });

    let caughtError: unknown = null;
    const resultPromise = retry(fn, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 }).catch((err) => {
      caughtError = err;
    });

    // Advance through all retries
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    await resultPromise;
    expect(caughtError).toBeInstanceOf(RetryError);
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('should include original error in RetryError', async () => {
    const originalError = { status: 503, message: 'Service down' };
    const fn = vi.fn().mockRejectedValue(originalError);

    let caughtError: RetryError | null = null;
    const resultPromise = retry(fn, { maxRetries: 2, baseDelayMs: 50, maxDelayMs: 500 }).catch((err) => {
      caughtError = err;
    });

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(500);
    }

    await resultPromise;
    expect(caughtError).toBeInstanceOf(RetryError);
    expect(caughtError!.originalError).toBe(originalError);
  });

  it('should include attempt count in RetryError', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500 });

    let caughtError: RetryError | null = null;
    const resultPromise = retry(fn, { maxRetries: 3, baseDelayMs: 50, maxDelayMs: 500 }).catch((err) => {
      caughtError = err;
    });

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(500);
    }

    await resultPromise;
    expect(caughtError).toBeInstanceOf(RetryError);
    expect(caughtError!.attempts).toBe(4);
  });

  it('should use custom shouldRetry function', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ customCode: 'TEMPORARY' })
      .mockResolvedValue('success');

    const shouldRetry = (err: unknown) => {
      return (err as { customCode?: string }).customCode === 'TEMPORARY';
    };

    const resultPromise = retry(fn, {
      maxRetries: 3,
      baseDelayMs: 50,
      maxDelayMs: 500,
      shouldRetry,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should pass attempt number to function', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = retry(fn);
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(fn).toHaveBeenCalledWith({ attempt: 1 });
  });

  it('should call onRetry callback on each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 502 })
      .mockResolvedValue('success');

    const resultPromise = retry(fn, {
      maxRetries: 3,
      baseDelayMs: 50,
      maxDelayMs: 500,
      onRetry,
    });

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(500);
    }

    await resultPromise;
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }), 1);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }), 2);
  });

  describe('with HTTP errors', () => {
    it('should retry on 429 Too Many Requests', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValue('success');

      const resultPromise = retry(fn, { maxRetries: 2, baseDelayMs: 50, maxDelayMs: 500 });
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      expect(result).toBe('success');
    });

    it('should not retry on 401 Unauthorized', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 401 });

      let caughtError: unknown = null;
      const resultPromise = retry(fn, { maxRetries: 3 }).catch((err) => {
        caughtError = err;
      });
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(caughtError).toMatchObject({ status: 401 });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 Not Found', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 404 });

      let caughtError: unknown = null;
      const resultPromise = retry(fn, { maxRetries: 3 }).catch((err) => {
        caughtError = err;
      });
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(caughtError).toMatchObject({ status: 404 });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('maxRetries edge cases', () => {
    it('should not retry when maxRetries is 0', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 503 });

      let caughtError: unknown = null;
      const resultPromise = retry(fn, { maxRetries: 0 }).catch((err) => {
        caughtError = err;
      });
      await vi.runAllTimersAsync();
      await resultPromise;

      // When maxRetries is 0, we throw the original error (no retry was attempted)
      expect(caughtError).toMatchObject({ status: 503 });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry exactly maxRetries times', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 503 });

      let caughtError: unknown = null;
      const resultPromise = retry(fn, { maxRetries: 5, baseDelayMs: 10, maxDelayMs: 100 }).catch((err) => {
        caughtError = err;
      });

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(200);
      }

      await resultPromise;
      expect(caughtError).toBeInstanceOf(RetryError);
      expect(fn).toHaveBeenCalledTimes(6); // 1 initial + 5 retries
    });
  });
});

describe('DEFAULT_RETRY_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(10000);
  });
});

describe('RETRYABLE_STATUSES', () => {
  it('should include common transient error codes', () => {
    expect(RETRYABLE_STATUSES).toContain(408);
    expect(RETRYABLE_STATUSES).toContain(429);
    expect(RETRYABLE_STATUSES).toContain(500);
    expect(RETRYABLE_STATUSES).toContain(502);
    expect(RETRYABLE_STATUSES).toContain(503);
    expect(RETRYABLE_STATUSES).toContain(504);
  });

  it('should not include client errors', () => {
    expect(RETRYABLE_STATUSES).not.toContain(400);
    expect(RETRYABLE_STATUSES).not.toContain(401);
    expect(RETRYABLE_STATUSES).not.toContain(403);
    expect(RETRYABLE_STATUSES).not.toContain(404);
  });
});

describe('RetryError', () => {
  it('should be instanceof Error', () => {
    const error = new RetryError('test', null, 3);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RetryError);
  });

  it('should have correct properties', () => {
    const originalError = new Error('Original');
    const error = new RetryError('Retry failed', originalError, 3);

    expect(error.message).toBe('Retry failed');
    expect(error.originalError).toBe(originalError);
    expect(error.attempts).toBe(3);
    expect(error.name).toBe('RetryError');
  });

  it('should have error code', () => {
    const error = new RetryError('test', null, 1);
    expect(error.code).toBe('RETRY_EXHAUSTED');
  });
});
