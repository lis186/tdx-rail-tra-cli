/**
 * Multi-API Key Types
 * 支援多組 API Key 輪詢，線性提升服務量
 */

/**
 * 單一 API Key 憑證
 */
export interface ApiKeyCredential {
  /** 唯一識別碼（可選，未提供時自動生成） */
  id?: string;
  /** TDX Client ID */
  clientId: string;
  /** TDX Client Secret */
  clientSecret: string;
  /** 標籤（用於日誌識別） */
  label?: string;
}

/**
 * API Key Slot 狀態
 */
export enum ApiKeySlotStatus {
  /** 正常運作 */
  ACTIVE = 'ACTIVE',
  /** 暫時停用（連續失敗） */
  DISABLED = 'DISABLED',
  /** 冷卻測試中 */
  COOLDOWN = 'COOLDOWN',
}

/**
 * API Key Slot 指標
 */
export interface ApiKeySlotMetrics {
  /** Slot ID */
  id: string;
  /** 標籤 */
  label: string;
  /** 狀態 */
  status: ApiKeySlotStatus;
  /** 可用 Token 數量 */
  availableTokens: number;
  /** 總請求數 */
  totalRequests: number;
  /** 成功請求數 */
  successfulRequests: number;
  /** 失敗請求數 */
  failedRequests: number;
  /** 最後使用時間 */
  lastUsed: number | null;
  /** 最後錯誤訊息 */
  lastError: string | null;
  /** 停用到期時間 */
  disabledUntil: number | null;
}

/**
 * API Key Pool 配置
 */
export interface ApiKeyPoolConfig {
  /** 失敗冷卻時間（預設 30000ms） */
  failureCooldownMs?: number;
  /** 連續失敗停用閾值（預設 3） */
  failureThreshold?: number;
  /** 恢復測試時間（預設 60000ms） */
  recoveryTimeMs?: number;
}

/**
 * 無可用 Slot 錯誤
 */
export class NoAvailableSlotsError extends Error {
  public readonly code = 'NO_AVAILABLE_SLOTS';

  constructor(message: string = '所有 API Key 都已停用') {
    super(message);
    this.name = 'NoAvailableSlotsError';
  }
}
