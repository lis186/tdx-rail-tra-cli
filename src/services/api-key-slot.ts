/**
 * API Key Slot Service
 * 封裝單一 API Key，包含獨立的 AuthService 和 RateLimiter
 */

import { AuthService } from './auth.js';
import { RateLimiter } from './rate-limiter.js';
import type {
  ApiKeyCredential,
  ApiKeySlotMetrics,
  ApiKeyPoolConfig,
} from '../types/api-key.js';
import { ApiKeySlotStatus } from '../types/api-key.js';

const DEFAULT_CONFIG: Required<ApiKeyPoolConfig> = {
  failureCooldownMs: 30000,
  failureThreshold: 3,
  recoveryTimeMs: 60000,
};

/**
 * API Key Slot
 * 封裝單一 API Key 的獨立認證與限流
 */
export class ApiKeySlot {
  readonly id: string;
  readonly label: string;

  private auth: AuthService;
  private rateLimiter: RateLimiter;
  private config: Required<ApiKeyPoolConfig>;

  private status: ApiKeySlotStatus = ApiKeySlotStatus.ACTIVE;
  private consecutiveFailures: number = 0;
  private lastError: string | null = null;
  private disabledUntil: number | null = null;

  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private lastUsed: number | null = null;

  constructor(
    credential: ApiKeyCredential,
    config: Partial<ApiKeyPoolConfig> = {}
  ) {
    this.id = credential.id || this.generateId();
    this.label = credential.label || `Key-${this.id.slice(0, 8)}`;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.auth = new AuthService(credential.clientId, credential.clientSecret);
    this.rateLimiter = new RateLimiter();
  }

  /**
   * 檢查 Slot 是否可用
   * ACTIVE 或過了冷卻期的 DISABLED 都可用
   */
  isAvailable(): boolean {
    this.checkCooldown();
    return this.status !== ApiKeySlotStatus.DISABLED;
  }

  /**
   * 取得可用 Token 數量
   */
  getAvailableTokens(): number {
    return this.rateLimiter.getAvailableTokens();
  }

  /**
   * 取得 AuthService 實例
   */
  getAuthService(): AuthService {
    return this.auth;
  }

  /**
   * 取得 RateLimiter 實例
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * 記錄成功請求
   */
  recordSuccess(): void {
    this.totalRequests++;
    this.successfulRequests++;
    this.lastUsed = Date.now();
    this.consecutiveFailures = 0;

    // COOLDOWN 狀態下成功，轉為 ACTIVE
    if (this.status === ApiKeySlotStatus.COOLDOWN) {
      this.status = ApiKeySlotStatus.ACTIVE;
      this.disabledUntil = null;
    }
  }

  /**
   * 記錄失敗請求
   */
  recordFailure(error: Error): void {
    this.totalRequests++;
    this.failedRequests++;
    this.lastUsed = Date.now();
    this.lastError = error.message;
    this.consecutiveFailures++;

    // 達到失敗閾值，停用 Slot
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.status = ApiKeySlotStatus.DISABLED;
      this.disabledUntil = Date.now() + this.config.failureCooldownMs;
    }
  }

  /**
   * 取得 Slot 指標
   */
  getMetrics(): ApiKeySlotMetrics {
    this.checkCooldown();
    return {
      id: this.id,
      label: this.label,
      status: this.status,
      availableTokens: this.getAvailableTokens(),
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      lastUsed: this.lastUsed,
      lastError: this.lastError,
      disabledUntil: this.disabledUntil,
    };
  }

  /**
   * 重置 Slot 狀態
   */
  reset(): void {
    this.status = ApiKeySlotStatus.ACTIVE;
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.disabledUntil = null;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.lastUsed = null;
    this.rateLimiter.reset();
  }

  /**
   * 檢查冷卻期狀態
   */
  private checkCooldown(): void {
    if (
      this.status === ApiKeySlotStatus.DISABLED &&
      this.disabledUntil !== null &&
      Date.now() >= this.disabledUntil
    ) {
      // 冷卻期結束，進入測試狀態
      this.status = ApiKeySlotStatus.COOLDOWN;
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
