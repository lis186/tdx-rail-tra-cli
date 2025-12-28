/**
 * ApiKeyPool Tests
 * 管理多個 ApiKeySlot，智慧選擇最佳 Slot
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiKeyPool } from '../../src/services/api-key-pool.js';
import { NoAvailableSlotsError, ApiKeySlotStatus } from '../../src/types/api-key.js';

describe('ApiKeyPool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create pool with single credential', () => {
      const pool = new ApiKeyPool([
        { clientId: 'id1', clientSecret: 'secret1' },
      ]);

      expect(pool.getSlotCount()).toBe(1);
    });

    it('should create pool with multiple credentials', () => {
      const pool = new ApiKeyPool([
        { clientId: 'id1', clientSecret: 'secret1' },
        { clientId: 'id2', clientSecret: 'secret2' },
        { clientId: 'id3', clientSecret: 'secret3' },
      ]);

      expect(pool.getSlotCount()).toBe(3);
    });

    it('should throw if no credentials provided', () => {
      expect(() => new ApiKeyPool([])).toThrow('至少需要一組 API Key');
    });
  });

  describe('getSlot', () => {
    it('should return slot when available', () => {
      const pool = new ApiKeyPool([
        { clientId: 'id1', clientSecret: 'secret1' },
      ]);

      const slot = pool.getSlot();
      expect(slot).toBeDefined();
      expect(slot.getAvailableTokens()).toBe(5);
    });

    it('should return slot with most available tokens', () => {
      const pool = new ApiKeyPool([
        { id: 'slot1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'slot2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // Use tokens from slot1
      const slot1 = pool.getSlotById('slot1')!;
      slot1.getRateLimiter().tryAcquire();
      slot1.getRateLimiter().tryAcquire();
      slot1.getRateLimiter().tryAcquire();

      // getSlot should return slot2 (more tokens)
      const selected = pool.getSlot();
      expect(selected.id).toBe('slot2');
    });

    it('should throw NoAvailableSlotsError when all slots disabled', () => {
      const pool = new ApiKeyPool(
        [{ clientId: 'id1', clientSecret: 'secret1' }],
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // Disable the only slot
      const slot = pool.getSlot();
      slot.recordFailure(new Error('Test error'));

      expect(() => pool.getSlot()).toThrow(NoAvailableSlotsError);
    });

    it('should skip disabled slots and return available one', () => {
      const pool = new ApiKeyPool(
        [
          { id: 'slot1', clientId: 'id1', clientSecret: 'secret1' },
          { id: 'slot2', clientId: 'id2', clientSecret: 'secret2' },
        ],
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // Disable slot1
      const slot1 = pool.getSlotById('slot1')!;
      slot1.recordFailure(new Error('Test error'));

      // getSlot should return slot2
      const selected = pool.getSlot();
      expect(selected.id).toBe('slot2');
    });

    it('should return recovered slot after cooldown', () => {
      const pool = new ApiKeyPool(
        [{ id: 'slot1', clientId: 'id1', clientSecret: 'secret1' }],
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // Disable slot
      const slot = pool.getSlot();
      slot.recordFailure(new Error('Test error'));

      // Should throw now
      expect(() => pool.getSlot()).toThrow(NoAvailableSlotsError);

      // Advance past cooldown
      vi.advanceTimersByTime(35000);

      // Should be available again (in COOLDOWN state)
      const recovered = pool.getSlot();
      expect(recovered.id).toBe('slot1');
    });
  });

  describe('getSlotById', () => {
    it('should return slot by id', () => {
      const pool = new ApiKeyPool([
        { id: 'my-slot', clientId: 'id1', clientSecret: 'secret1' },
      ]);

      const slot = pool.getSlotById('my-slot');
      expect(slot).toBeDefined();
      expect(slot?.id).toBe('my-slot');
    });

    it('should return undefined for unknown id', () => {
      const pool = new ApiKeyPool([
        { clientId: 'id1', clientSecret: 'secret1' },
      ]);

      expect(pool.getSlotById('unknown')).toBeUndefined();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for all slots', () => {
      const pool = new ApiKeyPool([
        { id: 'slot1', clientId: 'id1', clientSecret: 'secret1', label: 'Primary' },
        { id: 'slot2', clientId: 'id2', clientSecret: 'secret2', label: 'Secondary' },
      ]);

      const metrics = pool.getMetrics();

      expect(metrics).toHaveLength(2);
      expect(metrics[0].id).toBe('slot1');
      expect(metrics[0].label).toBe('Primary');
      expect(metrics[1].id).toBe('slot2');
      expect(metrics[1].label).toBe('Secondary');
    });
  });

  describe('getTotalCapacity', () => {
    it('should return total capacity for single slot', () => {
      const pool = new ApiKeyPool([
        { clientId: 'id1', clientSecret: 'secret1' },
      ]);

      const capacity = pool.getTotalCapacity();
      expect(capacity.available).toBe(5);
      expect(capacity.max).toBe(5);
    });

    it('should return combined capacity for multiple slots', () => {
      const pool = new ApiKeyPool([
        { clientId: 'id1', clientSecret: 'secret1' },
        { clientId: 'id2', clientSecret: 'secret2' },
        { clientId: 'id3', clientSecret: 'secret3' },
      ]);

      const capacity = pool.getTotalCapacity();
      expect(capacity.available).toBe(15);
      expect(capacity.max).toBe(15);
    });

    it('should reflect used tokens', () => {
      const pool = new ApiKeyPool([
        { id: 'slot1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'slot2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // Use 3 tokens from slot1
      const slot1 = pool.getSlotById('slot1')!;
      slot1.getRateLimiter().tryAcquire();
      slot1.getRateLimiter().tryAcquire();
      slot1.getRateLimiter().tryAcquire();

      const capacity = pool.getTotalCapacity();
      expect(capacity.available).toBe(7); // 2 + 5
      expect(capacity.max).toBe(10);
    });
  });

  describe('getActiveSlotCount', () => {
    it('should return count of active slots', () => {
      const pool = new ApiKeyPool(
        [
          { id: 'slot1', clientId: 'id1', clientSecret: 'secret1' },
          { id: 'slot2', clientId: 'id2', clientSecret: 'secret2' },
        ],
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      expect(pool.getActiveSlotCount()).toBe(2);

      // Disable slot1
      pool.getSlotById('slot1')!.recordFailure(new Error('Test'));

      expect(pool.getActiveSlotCount()).toBe(1);
    });
  });

  describe('hasAvailableSlots', () => {
    it('should return true when slots available', () => {
      const pool = new ApiKeyPool([
        { clientId: 'id1', clientSecret: 'secret1' },
      ]);

      expect(pool.hasAvailableSlots()).toBe(true);
    });

    it('should return false when all slots disabled', () => {
      const pool = new ApiKeyPool(
        [{ clientId: 'id1', clientSecret: 'secret1' }],
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      pool.getSlot().recordFailure(new Error('Test'));

      expect(pool.hasAvailableSlots()).toBe(false);
    });
  });

  describe('resetAll', () => {
    it('should reset all slots', () => {
      const pool = new ApiKeyPool(
        [
          { id: 'slot1', clientId: 'id1', clientSecret: 'secret1' },
          { id: 'slot2', clientId: 'id2', clientSecret: 'secret2' },
        ],
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // Use tokens and create failures
      pool.getSlotById('slot1')!.getRateLimiter().tryAcquire();
      pool.getSlotById('slot2')!.recordFailure(new Error('Test'));

      // Reset all
      pool.resetAll();

      // All slots should be fresh
      const metrics = pool.getMetrics();
      expect(metrics[0].availableTokens).toBe(5);
      expect(metrics[0].status).toBe(ApiKeySlotStatus.ACTIVE);
      expect(metrics[1].availableTokens).toBe(5);
      expect(metrics[1].status).toBe(ApiKeySlotStatus.ACTIVE);
    });
  });

  describe('load balancing', () => {
    it('should distribute requests across slots', () => {
      const pool = new ApiKeyPool([
        { id: 'slot1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'slot2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // Get slots and consume tokens
      const selections: string[] = [];

      for (let i = 0; i < 10; i++) {
        const slot = pool.getSlot();
        slot.getRateLimiter().tryAcquire();
        selections.push(slot.id);
      }

      // Both slots should be used
      expect(selections.filter(id => id === 'slot1').length).toBeGreaterThan(0);
      expect(selections.filter(id => id === 'slot2').length).toBeGreaterThan(0);
    });

    it('should prefer slot with more tokens', () => {
      const pool = new ApiKeyPool([
        { id: 'slot1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'slot2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // Drain slot1 completely
      const slot1 = pool.getSlotById('slot1')!;
      for (let i = 0; i < 5; i++) {
        slot1.getRateLimiter().tryAcquire();
      }

      // Next selection should be slot2
      const selected = pool.getSlot();
      expect(selected.id).toBe('slot2');
    });
  });
});
