import { describe, it, expect, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOpenError
} from '../../src/services/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100
    });
  });

  describe('Normal Operation', () => {
    it('should execute function successfully when CLOSED', async () => {
      const fn = () => Promise.resolve('success');
      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return CLOSED state metrics', async () => {
      await breaker.execute(() => Promise.resolve('ok'));

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
    });

    it('should track multiple successful requests', async () => {
      for (let i = 0; i < 5; i++) {
        await breaker.execute(() => Promise.resolve(`result-${i}`));
      }

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(5);
      expect(metrics.successfulRequests).toBe(5);
      expect(metrics.failedRequests).toBe(0);
    });
  });

  describe('Failure Handling', () => {
    it('should transition to OPEN after consecutive failures', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Expected to fail
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should fast-fail when circuit is OPEN', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      // First, trigger the circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Now OPEN circuit should reject immediately
      await expect(
        breaker.execute(() => Promise.resolve('ok'))
      ).rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should count rejections separately', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      // Trigger OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      // Try executing while OPEN (should be rejected)
      try {
        await breaker.execute(() => Promise.resolve('ok'));
      } catch {
        // Ignore
      }

      const metrics = breaker.getMetrics();
      expect(metrics.rejectedRequests).toBe(1);
      expect(metrics.failedRequests).toBe(3); // Only the original 3 failures
    });

    it('should respect shouldRetry callback', async () => {
      const breaker2 = new CircuitBreaker('test-retry', {
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 100,
        shouldRetry: (error: Error) => {
          // Don't retry "PERMANENT" errors
          return !error.message.includes('PERMANENT');
        }
      });

      const permanentError = new Error('PERMANENT: Invalid input');

      // Should not trigger circuit breaker for permanent errors
      await expect(
        breaker2.execute(() => Promise.reject(permanentError))
      ).rejects.toThrow('PERMANENT');

      expect(breaker2.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Recovery Mechanism', () => {
    it('should transition to HALF_OPEN after timeout', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      // Trigger OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next execution should attempt HALF_OPEN
      // (may fail, but should try)
      try {
        await breaker.execute(() => Promise.resolve('success'));
      } catch {
        // Ignore
      }

      // Should be HALF_OPEN or CLOSED (depending on success)
      const state = breaker.getState();
      expect([CircuitState.HALF_OPEN, CircuitState.CLOSED]).toContain(state);
    });

    it('should close circuit after successful recovery', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      // Trigger OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Successful execution
      const successFn = () => Promise.resolve('success');
      await breaker.execute(successFn);

      // Should be in HALF_OPEN
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // One more success to close
      await breaker.execute(successFn);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen if failure occurs during HALF_OPEN', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      // Trigger OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Try to recover, but fail
      try {
        await breaker.execute(failingFn);
      } catch {
        // Ignore
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Metrics Collection', () => {
    it('should track request statistics correctly', async () => {
      const successFn = () => Promise.resolve('ok');
      const failFn = () => Promise.reject(new Error('fail'));

      await breaker.execute(successFn);
      try {
        await breaker.execute(failFn);
      } catch {
        // Ignore
      }

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.rejectedRequests).toBe(0);
    });

    it('should record state transitions', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      const metrics = breaker.getMetrics();
      const closedToOpen = metrics.stateChanges.find(
        sc => sc.from === CircuitState.CLOSED && sc.to === CircuitState.OPEN
      );

      expect(closedToOpen).toBeDefined();
    });

    it('should record all state transitions with timestamps', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));
      const successFn = () => Promise.resolve('ok');

      // CLOSED → OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // OPEN → HALF_OPEN
      try {
        await breaker.execute(successFn);
      } catch {
        // Ignore
      }

      // HALF_OPEN → CLOSED
      await breaker.execute(successFn);

      const metrics = breaker.getMetrics();
      expect(metrics.stateChanges.length).toBeGreaterThanOrEqual(2);

      // All transitions should have timestamps
      for (const transition of metrics.stateChanges) {
        expect(transition.timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe('Reset Functionality', () => {
    it('should reset to initial state', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      // Trigger OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
    });
  });

  describe('Error Information', () => {
    it('should provide retry-after information', async () => {
      const failingFn = () => Promise.reject(new Error('Test error'));

      // Trigger OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Ignore
        }
      }

      try {
        await breaker.execute(() => Promise.resolve('ok'));
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        const cbError = error as CircuitBreakerOpenError;
        expect(cbError.code).toBe('CIRCUIT_BREAKER_OPEN');
        expect(cbError.retryAfterMs).toBeGreaterThan(0);
      }
    });
  });
});
