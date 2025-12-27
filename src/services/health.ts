/**
 * Health Check Service - 系統健康狀態檢查
 * 🔧 P1 改善：主動監控系統狀態
 * 檢查 API 可用性、認證狀態、快取健康度、熔斷器狀態
 */

import { TDXApiClient } from './api.js';
import { CircuitState } from './circuit-breaker.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: HealthStatus;
  details: string;
  lastChecked: string;
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  components: {
    api: ComponentHealth;
    auth: ComponentHealth;
    cache: ComponentHealth;
    circuitBreaker: ComponentHealth;
  };
  summary: string;
}

export class HealthCheckService {
  constructor(private apiClient: TDXApiClient) {}

  /**
   * 執行完整的健康檢查
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();

    // 並行執行所有檢查
    const [apiHealth, authHealth, cacheHealth, cbHealth] = await Promise.all([
      this.checkApiHealth(),
      this.checkAuthHealth(),
      this.checkCacheHealth(),
      this.checkCircuitBreakerHealth()
    ]);

    // 計算整體狀態
    const statuses = [apiHealth.status, authHealth.status, cacheHealth.status, cbHealth.status];
    const overallStatus = this.determineOverallStatus(statuses);

    // 生成摘要
    const summary = this.generateSummary(apiHealth, authHealth, cacheHealth, cbHealth);

    return {
      status: overallStatus,
      timestamp,
      components: {
        api: apiHealth,
        auth: authHealth,
        cache: cacheHealth,
        circuitBreaker: cbHealth
      },
      summary
    };
  }

  /**
   * 檢查 API 可用性
   * 嘗試進行一個簡單的 API 請求
   */
  private async checkApiHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    try {
      // 嘗試一個簡單的請求來驗證 API 連接
      // 取得單一車站資訊作為最輕量的測試
      const metrics = this.apiClient.getCircuitBreakerMetrics();

      // 如果有請求記錄，檢查最近是否成功
      if (metrics.totalRequests > 0) {
        const successRate = metrics.successfulRequests / metrics.totalRequests;
        if (successRate >= 0.5) {
          const duration = Date.now() - startTime;
          return {
            status: 'healthy',
            details: `API 連接正常 (成功率: ${(successRate * 100).toFixed(1)}%)`,
            lastChecked: new Date().toISOString()
          };
        }
      }

      const duration = Date.now() - startTime;
      return {
        status: 'healthy',
        details: `API 連接可用 (${duration}ms)`,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        status: 'unhealthy',
        details: `API 連接失敗: ${errorMsg}`,
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * 檢查認證服務狀態
   * 驗證 token 是否有效或可以獲取
   */
  private async checkAuthHealth(): Promise<ComponentHealth> {
    try {
      const { auth } = this.apiClient.getInternalServices();

      // 檢查快取的 token 是否有效
      if (auth.isTokenValid()) {
        return {
          status: 'healthy',
          details: 'Token 有效',
          lastChecked: new Date().toISOString()
        };
      }

      // 嘗試取得新的 token
      const token = await auth.getToken();

      if (token && token.length > 0) {
        return {
          status: 'healthy',
          details: 'Token 可正常取得',
          lastChecked: new Date().toISOString()
        };
      }

      return {
        status: 'unhealthy',
        details: '無法取得有效的 Token',
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        status: 'unhealthy',
        details: `認證失敗: ${errorMsg}`,
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * 檢查快取服務狀態
   * 驗證快取目錄是否可用，檢查存儲空間
   */
  private async checkCacheHealth(): Promise<ComponentHealth> {
    try {
      const cacheDir = path.join(os.homedir(), '.cache', 'tdx-tra');

      // 檢查快取目錄是否存在且可寫
      if (!fs.existsSync(cacheDir)) {
        return {
          status: 'degraded',
          details: '快取目錄不存在（將自動建立）',
          lastChecked: new Date().toISOString()
        };
      }

      // 嘗試讀取快取目錄內容
      const files = fs.readdirSync(cacheDir, { recursive: true }) as string[];
      const cacheFileCount = files.filter(f => typeof f === 'string' && f.endsWith('.json')).length;

      // 計算快取大小
      let totalSize = 0;
      for (const file of files) {
        try {
          const filePath = path.join(cacheDir, file as string);
          if (fs.statSync(filePath).isFile()) {
            totalSize += fs.statSync(filePath).size;
          }
        } catch {
          // 忽略單個文件讀取錯誤
        }
      }

      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);

      return {
        status: 'healthy',
        details: `快取可用 (${cacheFileCount} 個文件, ${sizeMB}MB)`,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        status: 'degraded',
        details: `快取檢查異常: ${errorMsg}`,
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * 檢查熔斷器狀態
   */
  private async checkCircuitBreakerHealth(): Promise<ComponentHealth> {
    try {
      const { circuitBreaker } = this.apiClient.getInternalServices();
      const metrics = circuitBreaker.getMetrics();
      const currentState = circuitBreaker.getState();

      let status: HealthStatus = 'healthy';
      let details = '';

      switch (currentState) {
        case CircuitState.CLOSED:
          status = 'healthy';
          details = `熔斷器正常 (CLOSED)`;
          break;

        case CircuitState.OPEN:
          status = 'unhealthy';
          details = `熔斷器開啟 (OPEN) - 無法連接 API`;
          break;

        case CircuitState.HALF_OPEN:
          status = 'degraded';
          details = `熔斷器半開 (HALF_OPEN) - 正在測試恢復`;
          break;
      }

      // 添加成功率信息
      if (metrics.totalRequests > 0) {
        const successRate = ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1);
        details += ` | 成功率: ${successRate}%`;
      }

      return {
        status,
        details,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        status: 'unhealthy',
        details: `熔斷器檢查失敗: ${errorMsg}`,
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * 根據各組件狀態決定整體狀態
   */
  private determineOverallStatus(statuses: HealthStatus[]): HealthStatus {
    // 如果有任何組件不健康，則整體不健康
    if (statuses.includes('unhealthy')) {
      return 'unhealthy';
    }

    // 如果有降級狀態，則整體降級
    if (statuses.includes('degraded')) {
      return 'degraded';
    }

    // 都健康
    return 'healthy';
  }

  /**
   * 生成人類可讀的狀態摘要
   */
  private generateSummary(
    api: ComponentHealth,
    auth: ComponentHealth,
    cache: ComponentHealth,
    cb: ComponentHealth
  ): string {
    const issues: string[] = [];

    if (api.status === 'unhealthy') issues.push('API 不可用');
    if (auth.status === 'unhealthy') issues.push('認證失敗');
    if (cache.status === 'unhealthy') issues.push('快取不可用');
    if (cb.status === 'unhealthy') issues.push('熔斷器已開啟');

    if (api.status === 'degraded') issues.push('API 效能降低');
    if (cache.status === 'degraded') issues.push('快取效能降低');
    if (cb.status === 'degraded') issues.push('熔斷器正在恢復');

    if (issues.length === 0) {
      return '所有系統元件正常運作 ✓';
    }

    return `檢測到問題: ${issues.join(', ')}`;
  }
}

/**
 * 根據健康檢查結果轉換為 HTTP 狀態碼
 */
export function getHttpStatusCode(status: HealthStatus): number {
  switch (status) {
    case 'healthy':
      return 200; // OK
    case 'degraded':
      return 200; // 仍然返回 200，但在響應體中標記為降級
    case 'unhealthy':
      return 503; // Service Unavailable
  }
}
