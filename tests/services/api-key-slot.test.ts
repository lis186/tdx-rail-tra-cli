/**
 * ApiKeySlot Tests
 * 封裝單一 API Key 的獨立 Auth + RateLimiter
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiKeySlot } from '../../src/services/api-key-slot.js';
import { ApiKeySlotStatus } from '../../src/types/api-key.js';

describe('ApiKeySlot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with credential', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      expect(slot).toBeInstanceOf(ApiKeySlot);
      expect(slot.id).toBeDefined();
      expect(slot.label).toContain('Key-');
    });

    it('should use provided id and label', () => {
      const slot = new ApiKeySlot({
        id: 'custom-id',
        clientId: 'test-id',
        clientSecret: 'test-secret',
        label: 'Primary Key',
      });

      expect(slot.id).toBe('custom-id');
      expect(slot.label).toBe('Primary Key');
    });

    it('should start with ACTIVE status', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      const metrics = slot.getMetrics();
      expect(metrics.status).toBe(ApiKeySlotStatus.ACTIVE);
    });
  });

  describe('isAvailable', () => {
    it('should return true when ACTIVE', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      expect(slot.isAvailable()).toBe(true);
    });

    it('should return false when DISABLED and not past cooldown', () => {
      const slot = new ApiKeySlot(
        { clientId: 'test-id', clientSecret: 'test-secret' },
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // Trigger failure to disable
      slot.recordFailure(new Error('Test error'));

      expect(slot.isAvailable()).toBe(false);
    });

    it('should return true when DISABLED but past cooldown', () => {
      const slot = new ApiKeySlot(
        { clientId: 'test-id', clientSecret: 'test-secret' },
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      slot.recordFailure(new Error('Test error'));
      expect(slot.isAvailable()).toBe(false);

      // Advance past cooldown
      vi.advanceTimersByTime(35000);
      expect(slot.isAvailable()).toBe(true);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return max tokens initially', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      expect(slot.getAvailableTokens()).toBe(5); // Default maxTokens
    });

    it('should decrease after tryAcquire', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      slot.getRateLimiter().tryAcquire();
      expect(slot.getAvailableTokens()).toBe(4);
    });
  });

  describe('recordSuccess', () => {
    it('should increment success count', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      slot.recordSuccess();
      slot.recordSuccess();

      const metrics = slot.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(2);
      expect(metrics.failedRequests).toBe(0);
    });

    it('should update lastUsed timestamp', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      const before = Date.now();
      slot.recordSuccess();
      const metrics = slot.getMetrics();

      expect(metrics.lastUsed).toBeGreaterThanOrEqual(before);
    });

    it('should reset failure count on success', () => {
      const slot = new ApiKeySlot(
        { clientId: 'test-id', clientSecret: 'test-secret' },
        { failureThreshold: 3, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // 2 failures (not enough to disable)
      slot.recordFailure(new Error('Error 1'));
      slot.recordFailure(new Error('Error 2'));

      // 1 success resets counter
      slot.recordSuccess();

      // 1 more failure should not disable (counter was reset)
      slot.recordFailure(new Error('Error 3'));
      expect(slot.isAvailable()).toBe(true);
    });

    it('should transition from COOLDOWN to ACTIVE on success', () => {
      const slot = new ApiKeySlot(
        { clientId: 'test-id', clientSecret: 'test-secret' },
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // Disable the slot
      slot.recordFailure(new Error('Test error'));
      expect(slot.getMetrics().status).toBe(ApiKeySlotStatus.DISABLED);

      // Advance past cooldown to enter COOLDOWN state
      vi.advanceTimersByTime(35000);
      slot.isAvailable(); // This triggers state check

      // Record success in COOLDOWN state
      slot.recordSuccess();

      expect(slot.getMetrics().status).toBe(ApiKeySlotStatus.ACTIVE);
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      slot.recordFailure(new Error('Test error'));

      const metrics = slot.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.lastError).toBe('Test error');
    });

    it('should disable slot after reaching failure threshold', () => {
      const slot = new ApiKeySlot(
        { clientId: 'test-id', clientSecret: 'test-secret' },
        { failureThreshold: 3, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      slot.recordFailure(new Error('Error 1'));
      expect(slot.getMetrics().status).toBe(ApiKeySlotStatus.ACTIVE);

      slot.recordFailure(new Error('Error 2'));
      expect(slot.getMetrics().status).toBe(ApiKeySlotStatus.ACTIVE);

      slot.recordFailure(new Error('Error 3'));
      expect(slot.getMetrics().status).toBe(ApiKeySlotStatus.DISABLED);
    });

    it('should set disabledUntil timestamp', () => {
      const slot = new ApiKeySlot(
        { clientId: 'test-id', clientSecret: 'test-secret' },
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      const now = Date.now();
      slot.recordFailure(new Error('Test error'));

      const metrics = slot.getMetrics();
      expect(metrics.disabledUntil).toBeGreaterThanOrEqual(now + 30000);
    });

    it('should extend disable period on failure during COOLDOWN', () => {
      const slot = new ApiKeySlot(
        { clientId: 'test-id', clientSecret: 'test-secret' },
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // Disable the slot
      slot.recordFailure(new Error('Test error'));

      // Advance past cooldown
      vi.advanceTimersByTime(35000);
      slot.isAvailable(); // Enter COOLDOWN state

      // Fail again during COOLDOWN
      const beforeSecondFailure = Date.now();
      slot.recordFailure(new Error('Another error'));

      const metrics = slot.getMetrics();
      expect(metrics.status).toBe(ApiKeySlotStatus.DISABLED);
      expect(metrics.disabledUntil).toBeGreaterThanOrEqual(beforeSecondFailure + 30000);
    });
  });

  describe('getMetrics', () => {
    it('should return complete metrics', () => {
      const slot = new ApiKeySlot({
        id: 'test-slot',
        clientId: 'test-id',
        clientSecret: 'test-secret',
        label: 'Test Slot',
      });

      slot.recordSuccess();
      slot.recordFailure(new Error('Test error'));

      const metrics = slot.getMetrics();

      expect(metrics).toEqual({
        id: 'test-slot',
        label: 'Test Slot',
        status: ApiKeySlotStatus.ACTIVE,
        availableTokens: expect.any(Number),
        totalRequests: 2,
        successfulRequests: 1,
        failedRequests: 1,
        lastUsed: expect.any(Number),
        lastError: 'Test error',
        disabledUntil: null,
      });
    });
  });

  describe('reset', () => {
    it('should reset all counters and status', () => {
      const slot = new ApiKeySlot(
        { clientId: 'test-id', clientSecret: 'test-secret' },
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // Add some history
      slot.recordSuccess();
      slot.recordFailure(new Error('Test error'));
      expect(slot.getMetrics().status).toBe(ApiKeySlotStatus.DISABLED);

      // Reset
      slot.reset();

      const metrics = slot.getMetrics();
      expect(metrics.status).toBe(ApiKeySlotStatus.ACTIVE);
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.lastError).toBeNull();
      expect(metrics.disabledUntil).toBeNull();
    });
  });

  describe('getAuthService', () => {
    it('should return AuthService instance', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      const auth = slot.getAuthService();
      expect(auth).toBeDefined();
      expect(typeof auth.getToken).toBe('function');
    });
  });

  describe('getRateLimiter', () => {
    it('should return RateLimiter instance', () => {
      const slot = new ApiKeySlot({
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });

      const limiter = slot.getRateLimiter();
      expect(limiter).toBeDefined();
      expect(typeof limiter.tryAcquire).toBe('function');
    });
  });
});
