/**
 * Prometheus 指標收集
 * 🔧 P2 改善：實時效能監控
 * 追蹤 API、認證、快取、熔斷器、重試等各項指標
 */

import {
  register,
  Counter,
  Gauge,
  Histogram,
  CollectFunction,
  MetricConfiguration
} from 'prom-client';

/**
 * API 指標
 */
export const apiRequestsTotal = new Counter({
  name: 'api_requests_total',
  help: 'API 請求總數',
  labelNames: ['method', 'endpoint', 'status']
});

export const apiRequestDurationSeconds = new Histogram({
  name: 'api_request_duration_seconds',
  help: 'API 請求延遲（秒）',
  labelNames: ['method', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0]
});

export const apiErrorsTotal = new Counter({
  name: 'api_errors_total',
  help: 'API 錯誤總數',
  labelNames: ['error_type', 'endpoint']
});

export const apiResponseSizeBytes = new Histogram({
  name: 'api_response_size_bytes',
  help: 'API 回應大小（位元組）',
  labelNames: ['endpoint'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000]
});

/**
 * 認證服務指標
 */
export const authTokenRequestsTotal = new Counter({
  name: 'auth_token_requests_total',
  help: '認證 Token 請求總數',
  labelNames: ['status'] // 'success' | 'failed'
});

export const authCacheHitsTotal = new Counter({
  name: 'auth_cache_hits_total',
  help: '認證快取命中次數'
});

export const authCacheMissesTotal = new Counter({
  name: 'auth_cache_misses_total',
  help: '認證快取未命中次數'
});

export const authFailuresTotal = new Counter({
  name: 'auth_failures_total',
  help: '認證失敗總數',
  labelNames: ['reason']
});

/**
 * 快取服務指標
 */
export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: '快取命中次數',
  labelNames: ['cache_key_pattern']
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: '快取未命中次數',
  labelNames: ['cache_key_pattern']
});

export const cacheSizeBytes = new Gauge({
  name: 'cache_size_bytes',
  help: '快取大小（位元組）'
});

export const cacheEntriesCount = new Gauge({
  name: 'cache_entries_count',
  help: '快取項目數量'
});

export const cacheExpirations = new Counter({
  name: 'cache_expirations_total',
  help: '快取過期次數'
});

/**
 * 熔斷器指標
 */
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: '熔斷器狀態 (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
  labelNames: ['circuit_name']
});

export const circuitBreakerStateChanges = new Counter({
  name: 'circuit_breaker_state_changes_total',
  help: '熔斷器狀態變化次數',
  labelNames: ['circuit_name', 'from_state', 'to_state']
});

export const circuitBreakerRequestsTotal = new Counter({
  name: 'circuit_breaker_requests_total',
  help: '經過熔斷器的請求總數',
  labelNames: ['circuit_name', 'status'] // 'success' | 'failed' | 'rejected'
});

export const circuitBreakerSuccessRate = new Gauge({
  name: 'circuit_breaker_success_rate',
  help: '熔斷器成功率（0-100%）',
  labelNames: ['circuit_name']
});

/**
 * 重試機制指標
 */
export const retryAttemptsTotal = new Counter({
  name: 'retry_attempts_total',
  help: '重試嘗試次數',
  labelNames: ['operation', 'attempt_number']
});

export const retryBackoffTotalMs = new Histogram({
  name: 'retry_backoff_total_ms',
  help: '重試累計退避延遲（毫秒）',
  labelNames: ['operation'],
  buckets: [0, 100, 500, 1000, 5000, 10000, 30000, 60000]
});

export const retrySuccessesTotal = new Counter({
  name: 'retry_successes_total',
  help: '重試成功次數',
  labelNames: ['operation']
});

export const retryFailuresTotal = new Counter({
  name: 'retry_failures_total',
  help: '重試失敗次數',
  labelNames: ['operation', 'error_type']
});

export const retrySuccessRate = new Gauge({
  name: 'retry_success_rate',
  help: '重試成功率（0-100%）',
  labelNames: ['operation']
});

/**
 * 系統指標
 */
export const uptime = new Counter({
  name: 'uptime_seconds_total',
  help: '應用程式運行時間（秒）'
});

export const commandExecutions = new Counter({
  name: 'command_executions_total',
  help: '命令執行總數',
  labelNames: ['command', 'status'] // 'success' | 'failed'
});

export const commandDurationSeconds = new Histogram({
  name: 'command_duration_seconds',
  help: '命令執行時間（秒）',
  labelNames: ['command'],
  buckets: [0.01, 0.1, 0.5, 1.0, 5.0, 10.0]
});

/**
 * 指標統計輔助函數
 */
export interface MetricsSnapshot {
  timestamp: string;
  uptime_seconds: number;
  api: {
    requests_total: number;
    errors_total: number;
    avg_duration_ms: number;
  };
  auth: {
    token_requests_total: number;
    cache_hit_rate: string;
    failures_total: number;
  };
  cache: {
    hit_rate: string;
    size_mb: string;
    entries_count: number;
  };
  circuit_breaker: {
    state: string;
    state_changes_total: number;
    success_rate: string;
  };
  retry: {
    attempts_total: number;
    success_rate: string;
  };
}

/**
 * 收集所有指標的 Prometheus 格式
 */
export async function getMetricsSnapshot(): Promise<string> {
  return register.metrics();
}

/**
 * 取得指標內容類型
 */
export function getMetricsContentType(): string {
  return register.contentType;
}

/**
 * 重置所有指標（用於測試）
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

/**
 * 初始化指標（可選的初始值設定）
 */
export function initializeMetrics(): void {
  // 初始化上線時間計數器
  uptime.inc(0);

  // 初始化熔斷器狀態
  circuitBreakerState.set({ circuit_name: 'TDX-API' }, 0); // CLOSED
}

/**
 * 更新 API 請求指標
 */
export function recordApiRequest(
  method: string,
  endpoint: string,
  statusCode: number,
  durationMs: number,
  responseSize: number = 0
): void {
  // 記錄請求計數
  apiRequestsTotal.inc({
    method,
    endpoint,
    status: String(statusCode)
  });

  // 記錄請求延遲
  apiRequestDurationSeconds.observe(
    { method, endpoint },
    durationMs / 1000
  );

  // 如果有回應大小資訊，記錄
  if (responseSize > 0) {
    apiResponseSizeBytes.observe(
      { endpoint },
      responseSize
    );
  }

  // 如果是錯誤，記錄錯誤計數
  if (statusCode >= 400) {
    apiErrorsTotal.inc({
      error_type: `HTTP_${statusCode}`,
      endpoint
    });
  }
}

/**
 * 更新認證相關指標
 */
export function recordAuthTokenRequest(success: boolean): void {
  authTokenRequestsTotal.inc({
    status: success ? 'success' : 'failed'
  });
}

export function recordAuthCacheHit(): void {
  authCacheHitsTotal.inc();
}

export function recordAuthCacheMiss(): void {
  authCacheMissesTotal.inc();
}

export function recordAuthFailure(reason: string): void {
  authFailuresTotal.inc({ reason });
}

/**
 * 更新快取相關指標
 */
export function recordCacheHit(pattern: string = 'default'): void {
  cacheHitsTotal.inc({ cache_key_pattern: pattern });
}

export function recordCacheMiss(pattern: string = 'default'): void {
  cacheMissesTotal.inc({ cache_key_pattern: pattern });
}

export function updateCacheSize(sizeBytes: number): void {
  cacheSizeBytes.set(sizeBytes);
}

export function updateCacheEntriesCount(count: number): void {
  cacheEntriesCount.set(count);
}

export function recordCacheExpiration(): void {
  cacheExpirations.inc();
}

/**
 * 更新熔斷器相關指標
 */
export function updateCircuitBreakerState(
  circuitName: string,
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
): void {
  const stateValue = state === 'CLOSED' ? 0 : state === 'OPEN' ? 1 : 2;
  circuitBreakerState.set({ circuit_name: circuitName }, stateValue);
}

export function recordCircuitBreakerStateChange(
  circuitName: string,
  fromState: string,
  toState: string
): void {
  circuitBreakerStateChanges.inc({
    circuit_name: circuitName,
    from_state: fromState,
    to_state: toState
  });
}

export function recordCircuitBreakerRequest(
  circuitName: string,
  status: 'success' | 'failed' | 'rejected'
): void {
  circuitBreakerRequestsTotal.inc({
    circuit_name: circuitName,
    status
  });
}

export function updateCircuitBreakerSuccessRate(
  circuitName: string,
  successRate: number
): void {
  circuitBreakerSuccessRate.set(
    { circuit_name: circuitName },
    successRate
  );
}

/**
 * 更新重試相關指標
 */
export function recordRetryAttempt(
  operation: string,
  attemptNumber: number
): void {
  retryAttemptsTotal.inc({
    operation,
    attempt_number: String(attemptNumber)
  });
}

export function recordRetryBackoff(
  operation: string,
  backoffMs: number
): void {
  retryBackoffTotalMs.observe(
    { operation },
    backoffMs
  );
}

export function recordRetrySuccess(operation: string): void {
  retrySuccessesTotal.inc({ operation });
}

export function recordRetryFailure(
  operation: string,
  errorType: string
): void {
  retryFailuresTotal.inc({
    operation,
    error_type: errorType
  });
}

export function updateRetrySuccessRate(
  operation: string,
  successRate: number
): void {
  retrySuccessRate.set(
    { operation },
    successRate
  );
}

/**
 * 更新命令執行指標
 */
export function recordCommandExecution(
  command: string,
  durationMs: number,
  success: boolean
): void {
  commandExecutions.inc({
    command,
    status: success ? 'success' : 'failed'
  });

  commandDurationSeconds.observe(
    { command },
    durationMs / 1000
  );
}
