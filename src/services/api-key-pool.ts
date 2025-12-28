/**
 * API Key Pool Service
 * 管理多個 ApiKeySlot，智慧選擇最佳 Slot
 */

import { ApiKeySlot } from './api-key-slot.js';
import type {
  ApiKeyCredential,
  ApiKeyPoolConfig,
  ApiKeySlotMetrics,
} from '../types/api-key.js';
import { NoAvailableSlotsError } from '../types/api-key.js';

const DEFAULT_CONFIG: Required<ApiKeyPoolConfig> = {
  failureCooldownMs: 30000,
  failureThreshold: 3,
  recoveryTimeMs: 60000,
};

/**
 * API Key Pool
 * 管理多個 API Key Slot，提供智慧選擇和故障隔離
 */
export class ApiKeyPool {
  private slots: ApiKeySlot[] = [];
  private config: Required<ApiKeyPoolConfig>;

  constructor(
    credentials: ApiKeyCredential[],
    config: Partial<ApiKeyPoolConfig> = {}
  ) {
    if (credentials.length === 0) {
      throw new Error('至少需要一組 API Key');
    }

    this.config = { ...DEFAULT_CONFIG, ...config };

    // 建立每個 Slot
    for (const credential of credentials) {
      this.slots.push(new ApiKeySlot(credential, this.config));
    }
  }

  /**
   * 取得最佳可用 Slot（Token 最多）
   * @throws NoAvailableSlotsError 所有 Slot 都不可用
   */
  getSlot(): ApiKeySlot {
    // 過濾可用 Slots
    const available = this.slots.filter((slot) => slot.isAvailable());

    if (available.length === 0) {
      throw new NoAvailableSlotsError('所有 API Key 都已停用');
    }

    // 按可用 Token 排序（降序）
    available.sort(
      (a, b) => b.getAvailableTokens() - a.getAvailableTokens()
    );

    // 返回 Token 最多的 Slot
    return available[0];
  }

  /**
   * 依 ID 取得特定 Slot
   */
  getSlotById(id: string): ApiKeySlot | undefined {
    return this.slots.find((slot) => slot.id === id);
  }

  /**
   * 取得所有 Slot 的指標
   */
  getMetrics(): ApiKeySlotMetrics[] {
    return this.slots.map((slot) => slot.getMetrics());
  }

  /**
   * 取得總容量（可用 + 最大）
   * 只計算可用的 Slot
   */
  getTotalCapacity(): { available: number; max: number } {
    let available = 0;
    let max = 0;

    for (const slot of this.slots) {
      if (slot.isAvailable()) {
        available += slot.getAvailableTokens();
        max += 5; // 每個 Slot 的 maxTokens
      }
    }

    return { available, max };
  }

  /**
   * 取得即時容量（別名）
   */
  getCapacity(): { available: number; max: number } {
    return this.getTotalCapacity();
  }

  /**
   * 取得可用 Slot 數量
   */
  getActiveSlotCount(): number {
    return this.slots.filter((slot) => slot.isAvailable()).length;
  }

  /**
   * 取得總 Slot 數量
   */
  getSlotCount(): number {
    return this.slots.length;
  }

  /**
   * 檢查是否有可用 Slot
   */
  hasAvailableSlots(): boolean {
    return this.slots.some((slot) => slot.isAvailable());
  }

  /**
   * 重置所有 Slot
   */
  resetAll(): void {
    for (const slot of this.slots) {
      slot.reset();
    }
  }
}
