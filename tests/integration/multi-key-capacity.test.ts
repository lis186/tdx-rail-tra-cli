/**
 * Multi-Key Capacity Integration Test
 * 驗證多組 API Key 確實能提升服務量
 *
 * 測試目標：證明 N 組 Key = N × 5 req/s 的線性擴展
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiKeyPool } from '../../src/services/api-key-pool.js';
import type { ApiKeyCredential } from '../../src/types/api-key.js';

describe('Multi-Key Capacity Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * 模擬在時間窗口內連續取得 slot 並消耗 token
   * @returns 成功取得的請求數量
   */
  function simulateBurstRequests(pool: ApiKeyPool, requestCount: number): number {
    let successCount = 0;

    for (let i = 0; i < requestCount; i++) {
      try {
        const slot = pool.getSlot();
        const acquired = slot.getRateLimiter().tryAcquire();
        if (acquired) {
          successCount++;
          slot.recordSuccess();
        }
      } catch {
        // NoAvailableSlotsError - 所有 slot 都用完了
        break;
      }
    }

    return successCount;
  }

  describe('單 Key vs 多 Key 容量對比', () => {
    it('單一 Key 應該限制在 5 req/s', () => {
      const singleKeyPool = new ApiKeyPool([
        { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
      ]);

      // 嘗試發送 10 個請求
      const successCount = simulateBurstRequests(singleKeyPool, 10);

      // 只有 5 個能成功（單 Key 容量）
      expect(successCount).toBe(5);
    });

    it('兩組 Key 應該提供 10 req/s 容量', () => {
      const dualKeyPool = new ApiKeyPool([
        { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // 嘗試發送 15 個請求
      const successCount = simulateBurstRequests(dualKeyPool, 15);

      // 10 個能成功（2 × 5 = 10）
      expect(successCount).toBe(10);
    });

    it('三組 Key 應該提供 15 req/s 容量', () => {
      const tripleKeyPool = new ApiKeyPool([
        { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
        { id: 'key-3', clientId: 'id3', clientSecret: 'secret3' },
      ]);

      // 嘗試發送 20 個請求
      const successCount = simulateBurstRequests(tripleKeyPool, 20);

      // 15 個能成功（3 × 5 = 15）
      expect(successCount).toBe(15);
    });

    it('十組 Key 應該提供 50 req/s 容量（最大配置）', () => {
      const keys: ApiKeyCredential[] = [];
      for (let i = 1; i <= 10; i++) {
        keys.push({
          id: `key-${i}`,
          clientId: `id${i}`,
          clientSecret: `secret${i}`,
        });
      }

      const maxKeyPool = new ApiKeyPool(keys);

      // 嘗試發送 60 個請求
      const successCount = simulateBurstRequests(maxKeyPool, 60);

      // 50 個能成功（10 × 5 = 50）
      expect(successCount).toBe(50);
    });
  });

  describe('Token 恢復後的持續容量', () => {
    it('單 Key 每秒恢復 5 個 token', () => {
      const pool = new ApiKeyPool([
        { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
      ]);

      // 第一輪：用完 5 個 token
      const round1 = simulateBurstRequests(pool, 10);
      expect(round1).toBe(5);

      // 等待 1 秒，token 應該恢復
      vi.advanceTimersByTime(1000);

      // 第二輪：又能使用 5 個
      const round2 = simulateBurstRequests(pool, 10);
      expect(round2).toBe(5);
    });

    it('雙 Key 每秒恢復 10 個 token', () => {
      const pool = new ApiKeyPool([
        { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // 第一輪：用完 10 個 token
      const round1 = simulateBurstRequests(pool, 15);
      expect(round1).toBe(10);

      // 等待 1 秒，token 應該恢復
      vi.advanceTimersByTime(1000);

      // 第二輪：又能使用 10 個
      const round2 = simulateBurstRequests(pool, 15);
      expect(round2).toBe(10);
    });
  });

  describe('負載均衡驗證', () => {
    it('應該優先選擇 token 較多的 slot', () => {
      const pool = new ApiKeyPool([
        { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // 記錄每個 slot 被選中的次數
      const selectionCount: Record<string, number> = { 'key-1': 0, 'key-2': 0 };

      // 連續取得 10 個 slot（應該平均分配）
      for (let i = 0; i < 10; i++) {
        const slot = pool.getSlot();
        selectionCount[slot.id]++;
        slot.getRateLimiter().tryAcquire();
      }

      // 兩個 slot 應該各被選中 5 次（平均分配）
      expect(selectionCount['key-1']).toBe(5);
      expect(selectionCount['key-2']).toBe(5);
    });

    it('當一個 slot 用完 token 時應該切換到另一個', () => {
      const pool = new ApiKeyPool([
        { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // 先用完 key-1 的 token
      const slot1 = pool.getSlotById('key-1')!;
      for (let i = 0; i < 5; i++) {
        slot1.getRateLimiter().tryAcquire();
      }

      // 接下來的請求應該都使用 key-2
      for (let i = 0; i < 5; i++) {
        const selected = pool.getSlot();
        expect(selected.id).toBe('key-2');
        selected.getRateLimiter().tryAcquire();
      }
    });
  });

  describe('故障隔離驗證', () => {
    it('一個 Key 失敗不應影響其他 Key 的服務', () => {
      const pool = new ApiKeyPool(
        [
          { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
          { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
        ],
        { failureThreshold: 2, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // 讓 key-1 連續失敗，觸發停用
      const slot1 = pool.getSlotById('key-1')!;
      slot1.recordFailure(new Error('API Error'));
      slot1.recordFailure(new Error('API Error'));

      // key-1 應該被停用
      expect(slot1.isAvailable()).toBe(false);

      // key-2 仍然可用，提供 5 req/s 容量
      const successCount = simulateBurstRequests(pool, 10);
      expect(successCount).toBe(5);

      // 所有請求都應該走 key-2
      const metrics = pool.getMetrics();
      const key2Metrics = metrics.find((m) => m.id === 'key-2');
      expect(key2Metrics?.successfulRequests).toBe(5);
    });

    it('Key 恢復後應該重新加入服務', () => {
      const pool = new ApiKeyPool(
        [
          { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
          { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
        ],
        { failureThreshold: 1, failureCooldownMs: 1000, recoveryTimeMs: 2000 }
      );

      // 讓 key-1 失敗
      const slot1 = pool.getSlotById('key-1')!;
      slot1.recordFailure(new Error('API Error'));
      expect(slot1.isAvailable()).toBe(false);

      // 只有 key-2 可用
      expect(pool.getActiveSlotCount()).toBe(1);

      // 等待 cooldown 結束，key-1 進入 COOLDOWN 狀態
      vi.advanceTimersByTime(1001);
      expect(pool.getActiveSlotCount()).toBe(2);

      // 現在應該恢復到 10 req/s 容量
      const successCount = simulateBurstRequests(pool, 15);
      expect(successCount).toBe(10);
    });
  });

  describe('Pool 容量指標', () => {
    it('getCapacity 應該返回正確的即時容量', () => {
      const pool = new ApiKeyPool([
        { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
        { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
      ]);

      // 初始容量：10 (2 × 5)
      let capacity = pool.getCapacity();
      expect(capacity.available).toBe(10);
      expect(capacity.max).toBe(10);

      // 使用 3 個 token
      for (let i = 0; i < 3; i++) {
        const slot = pool.getSlot();
        slot.getRateLimiter().tryAcquire();
      }

      // 剩餘容量應該是 7
      capacity = pool.getCapacity();
      expect(capacity.available).toBe(7);
      expect(capacity.max).toBe(10);
    });

    it('應該正確計算被停用 slot 後的容量', () => {
      const pool = new ApiKeyPool(
        [
          { id: 'key-1', clientId: 'id1', clientSecret: 'secret1' },
          { id: 'key-2', clientId: 'id2', clientSecret: 'secret2' },
        ],
        { failureThreshold: 1, failureCooldownMs: 30000, recoveryTimeMs: 60000 }
      );

      // 初始最大容量：10
      expect(pool.getCapacity().max).toBe(10);

      // 停用 key-1
      const slot1 = pool.getSlotById('key-1')!;
      slot1.recordFailure(new Error('API Error'));

      // 最大容量降為 5
      const capacity = pool.getCapacity();
      expect(capacity.max).toBe(5);
      expect(capacity.available).toBe(5);
    });
  });
});
