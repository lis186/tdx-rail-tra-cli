/**
 * Circuit Breaker - 故障隔離模式
 * 防止級聯故障，提供自動恢復機制
 * 三態轉換: CLOSED → OPEN → HALF_OPEN → CLOSED
 */

export enum CircuitState {
  CLOSED = 'CLOSED',           // 正常工作
  OPEN = 'OPEN',               // 故障，拒絕請求
  HALF_OPEN = 'HALF_OPEN'      // 測試恢復
}

export interface CircuitBreakerConfig {
  /** 開啟熔斷器的失敗次數閾值 */
  failureThreshold: number;
  /** HALF_OPEN 時成功次數達到此值則關閉 */
  successThreshold: number;
  /** OPEN 狀態持續時間（毫秒） */
  timeout: number;
  /** 是否應該重試的自定義判斷函數 */
  shouldRetry?: (error: Error) => boolean;
}

export interface CircuitBreakerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  stateChanges: Array<{
    timestamp: number;
    from: CircuitState;
    to: CircuitState;
  }>;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private metrics: CircuitBreakerMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rejectedRequests: 0,
    stateChanges: []
  };

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  /**
   * 執行受保護的函數
   * 如果熔斷器開啟，立即拋出錯誤（快速失敗）
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.metrics.totalRequests++;

    // 檢查是否需要轉換到 HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        console.log(
          `[CircuitBreaker ${this.name}] OPEN → HALF_OPEN (recovery attempt)`
        );
        this.transitionTo(CircuitState.HALF_OPEN);
        this.successCount = 0;
      } else {
        // 熔斷器仍在開啟狀態，拒絕請求
        this.metrics.rejectedRequests++;
        throw new CircuitBreakerOpenError(
          `Circuit breaker for ${this.name} is OPEN`,
          this.lastFailureTime + this.config.timeout - Date.now()
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (
        this.config.shouldRetry &&
        !this.config.shouldRetry(error as Error)
      ) {
        // 如果不應該重試（永久性錯誤），直接拋出
        throw error;
      }
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.metrics.successfulRequests++;
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      console.log(
        `[CircuitBreaker ${this.name}] HALF_OPEN → Success (${this.successCount}/${this.config.successThreshold})`
      );

      if (this.successCount >= this.config.successThreshold) {
        console.log(
          `[CircuitBreaker ${this.name}] HALF_OPEN → CLOSED (recovered)`
        );
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(): void {
    this.metrics.failedRequests++;
    this.lastFailureTime = Date.now();
    this.failureCount++;

    console.log(
      `[CircuitBreaker ${this.name}] Failure (${this.failureCount}/${this.config.failureThreshold})`
    );

    if (this.failureCount >= this.config.failureThreshold) {
      console.log(
        `[CircuitBreaker ${this.name}] CLOSED → OPEN (circuit breaker triggered)`
      );
      this.transitionTo(CircuitState.OPEN);
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // HALF_OPEN 中失敗，重新開啟
      console.log(
        `[CircuitBreaker ${this.name}] HALF_OPEN → OPEN (recovery failed)`
      );
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    this.metrics.stateChanges.push({
      timestamp: Date.now(),
      from: this.state,
      to: newState
    });
    this.state = newState;
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      stateChanges: []
    };
  }
}

export class CircuitBreakerOpenError extends Error {
  public readonly code = 'CIRCUIT_BREAKER_OPEN';

  constructor(
    message: string,
    public readonly retryAfterMs: number
  ) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
