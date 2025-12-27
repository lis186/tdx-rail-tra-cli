/**
 * Retry Strategy - 指數退避重試策略
 * 🔧 P1 改善：增強版本，提供更直觀的 API 和完整的統計信息
 * 特性：
 *   - 指數退避 (100ms → 200ms → 400ms)
 *   - 隨機抖動（避免雷鳴羊群效應）
 *   - 自定義重試判斷
 *   - 詳細的重試日誌和統計
 */

export interface RetryOptions {
  /** 最大重試次數 (default: 3) */
  maxRetries: number;
  /** 初始延遲（毫秒，default: 100） */
  initialDelayMs: number;
  /** 最大延遲（毫秒，default: 5000） */
  maxDelayMs: number;
  /** 退避倍數（default: 2，即指數級） */
  backoffMultiplier: number;
  /** 是否應該重試的判斷函數 */
  shouldRetry?: (error: Error, attemptNumber: number) => boolean;
  /** 重試前的回調（用於日誌記錄） */
  onRetry?: (error: Error, attemptNumber: number, nextDelayMs: number) => void;
  /** 是否啟用隨機抖動（default: true） */
  enableJitter?: boolean;
  /** 隨機抖動的範圍百分比（default: 0.1 即 10%） */
  jitterPercentage?: number;
}

export interface RetryStatistics {
  /** 初始嘗試 + 重試次數 */
  totalAttempts: number;
  /** 失敗的嘗試次數 */
  failedAttempts: number;
  /** 成功的嘗試次數（通常為 1） */
  successfulAttempts: number;
  /** 總延遲時間（毫秒） */
  totalDelayMs: number;
  /** 最後一次錯誤 */
  lastError: Error | null;
}

/**
 * 預設的重試配置
 */
export const DEFAULT_RETRY_OPTIONS: Omit<RetryOptions, 'shouldRetry' | 'onRetry'> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  enableJitter: true,
  jitterPercentage: 0.1
};

/**
 * 預設的重試判斷函數
 * 只重試暫時性錯誤
 */
export function defaultShouldRetry(error: Error): boolean {
  const code = (error as any).code || (error as any).status;
  const message = (error?.message || '').toLowerCase();

  // 重試暫時性錯誤代碼
  const retryableCodes = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EHOSTUNREACH',
    429,  // Too Many Requests
    502,  // Bad Gateway
    503,  // Service Unavailable
    504   // Gateway Timeout
  ];

  if (code && retryableCodes.includes(code)) {
    return true;
  }

  // 檢查錯誤消息中的關鍵詞
  const retryablePatterns = [
    'econnrefused',
    'etimedout',
    'enotfound',
    'network',
    'timeout',
    'connection',
    'econnreset',
    'socket hang up'
  ];

  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * 計算指數退避延遲，附加隨機抖動
 * @param attemptNumber 嘗試次數（1-based）
 * @param options 重試選項
 * @returns 延遲時間（毫秒）
 */
export function calculateExponentialBackoff(
  attemptNumber: number,
  options: Pick<RetryOptions, 'initialDelayMs' | 'maxDelayMs' | 'backoffMultiplier' | 'enableJitter' | 'jitterPercentage'>
): number {
  if (attemptNumber <= 0) {
    return 0;
  }

  // 計算指數級延遲: initialDelay * (backoffMultiplier ^ (attemptNumber - 1))
  const exponentialDelay = options.initialDelayMs * Math.pow(
    options.backoffMultiplier,
    attemptNumber - 1
  );

  // 限制最大延遲
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

  // 添加隨機抖動（避免雷鳴羊群效應）
  if (options.enableJitter) {
    const jitterRange = cappedDelay * (options.jitterPercentage || 0.1);
    const jitter = Math.random() * jitterRange;
    return cappedDelay + jitter;
  }

  return cappedDelay;
}

/**
 * 使用指數退避重試非同步函數
 * @param fn 要執行的非同步函數
 * @param options 重試選項
 * @returns 函數的返回值
 * @throws 如果所有重試都失敗，拋出最後一個錯誤
 */
export async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const fullOptions: RetryOptions = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
    shouldRetry: options.shouldRetry || defaultShouldRetry
  } as RetryOptions;

  const statistics: RetryStatistics = {
    totalAttempts: 0,
    failedAttempts: 0,
    successfulAttempts: 0,
    totalDelayMs: 0,
    lastError: null
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= fullOptions.maxRetries + 1; attempt++) {
    statistics.totalAttempts = attempt;

    try {
      const result = await fn();
      statistics.successfulAttempts++;
      return result;
    } catch (error) {
      lastError = error as Error;
      statistics.lastError = lastError;
      statistics.failedAttempts++;

      // 檢查是否應該重試
      const shouldRetry = fullOptions.shouldRetry!(lastError, attempt);

      // 如果不應該重試，或者已經是最後一次嘗試，立即拋出
      if (!shouldRetry || attempt >= fullOptions.maxRetries + 1) {
        throw lastError;
      }

      // 計算延遲時間
      const delayMs = calculateExponentialBackoff(attempt, fullOptions);
      statistics.totalDelayMs += delayMs;

      // 調用重試回調（用於日誌記錄）
      if (fullOptions.onRetry) {
        fullOptions.onRetry(lastError, attempt, delayMs);
      }

      // 等待後重試
      await sleep(delayMs);
    }
  }

  // 不應該到達此處，但作為備用
  throw lastError || new Error('Unknown error in retry logic');
}

/**
 * 取得重試統計信息
 * （可用於監控和分析）
 */
export function getRetryStatistics(): RetryStatistics | null {
  // 注意：此實現不追蹤全局統計
  // 要使用統計信息，請使用帶有回調的自定義實現
  return null;
}

/**
 * 睡眠函數
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 常見的可重試 HTTP 狀態碼
 */
export const RETRYABLE_HTTP_STATUSES = {
  REQUEST_TIMEOUT: 408,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

/**
 * 檢查 HTTP 狀態碼是否應該重試
 */
export function isRetryableHttpStatus(statusCode: number): boolean {
  return Object.values(RETRYABLE_HTTP_STATUSES).includes(statusCode);
}

/**
 * 創建一個用於 API 請求的標準重試配置
 * 使用於 TDX API 等 REST API
 */
export function createApiRetryOptions(overrides?: Partial<RetryOptions>): RetryOptions {
  return {
    ...DEFAULT_RETRY_OPTIONS,
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    shouldRetry: (error: Error) => {
      // 檢查 HTTP 狀態碼
      const status = (error as any).statusCode || (error as any).status;
      if (status && isRetryableHttpStatus(status)) {
        return true;
      }

      // 檢查網路錯誤
      return defaultShouldRetry(error);
    },
    ...overrides
  };
}
