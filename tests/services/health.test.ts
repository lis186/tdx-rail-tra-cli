import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCheckService, HealthStatus } from '../../src/services/health.js';
import { CircuitState } from '../../src/services/circuit-breaker.js';
import type { TDXApiClient } from '../../src/services/api.js';

/**
 * 創建 Pool Mock（適配 Multi-Key 架構）
 */
function createMockPool(mockAuth: any) {
  return {
    getSlot: () => ({
      getAuthService: () => mockAuth
    }),
    getSlotCount: () => 1,
    getActiveSlotCount: () => 1
  };
}

describe('HealthCheckService', () => {
  let healthService: HealthCheckService;
  let mockApiClient: any;

  beforeEach(() => {
    // 創建模擬 API 客戶端
    mockApiClient = {
      getCircuitBreakerMetrics: vi.fn(),
      getCircuitBreakerState: vi.fn(),
      getInternalServices: vi.fn()
    };

    healthService = new HealthCheckService(mockApiClient as TDXApiClient);
  });

  describe('performHealthCheck', () => {
    it('應該執行完整的健康檢查並返回結果', async () => {
      // 模擬內部服務
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('summary');
      expect(result.timestamp).toBeDefined();
    });

    it('應該在所有組件健康時返回 healthy 狀態', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.status).toBe('healthy');
    });

    it('應該在有降級組件時返回 degraded 狀態', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.HALF_OPEN)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.status).toBe('degraded');
    });

    it('應該在有不健康組件時返回 unhealthy 狀態', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(false),
        getToken: vi.fn().mockRejectedValue(new Error('Auth failed'))
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.OPEN)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.status).toBe('unhealthy');
    });

    it('應該檢查 API 健康狀態', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.components.api).toBeDefined();
      expect(result.components.api.status).toBe('healthy');
      expect(result.components.api.details).toBeDefined();
    });

    it('應該檢查認證健康狀態', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.components.auth).toBeDefined();
      expect(result.components.auth.status).toBe('healthy');
    });

    it('應該在認證失敗時報告不健康', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(false),
        getToken: vi.fn().mockRejectedValue(new Error('Authentication failed'))
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.components.auth.status).toBe('unhealthy');
      expect(result.components.auth.details).toContain('認證失敗');
    });

    it('應該檢查快取健康狀態', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.components.cache).toBeDefined();
      expect(['healthy', 'degraded']).toContain(result.components.cache.status);
    });

    it('應該檢查熔斷器健康狀態', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.components.circuitBreaker).toBeDefined();
      expect(result.components.circuitBreaker.status).toBe('healthy');
      expect(result.components.circuitBreaker.details).toContain('CLOSED');
    });

    it('應該在熔斷器開啟時報告不健康', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.OPEN)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.components.circuitBreaker.status).toBe('unhealthy');
      expect(result.components.circuitBreaker.details).toContain('OPEN');
    });

    it('應該在熔斷器半開時報告降級', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.HALF_OPEN)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.components.circuitBreaker.status).toBe('degraded');
      expect(result.components.circuitBreaker.details).toContain('HALF_OPEN');
    });

    it('應該包含成功率信息在熔斷器詳情中', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 80,
          failedRequests: 20,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 80,
        failedRequests: 20,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.components.circuitBreaker.details).toContain('成功率');
      expect(result.components.circuitBreaker.details).toContain('80.0%');
    });

    it('應該生成有意義的摘要', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('應該在所有服務健康時生成積極摘要', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.summary).toContain('正常運作');
    });

    it('應該在有問題時列出所有問題在摘要中', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(false),
        getToken: vi.fn().mockRejectedValue(new Error('Auth failed'))
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.OPEN)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      expect(result.summary).toContain('檢測到問題');
      expect(result.summary).toContain('認證失敗');
      expect(result.summary).toContain('熔斷器已開啟');
    });

    it('應該包含時間戳記', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const result = await healthService.performHealthCheck();

      const timestamp = new Date(result.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('應該並行執行所有檢查', async () => {
      const mockAuth = {
        isTokenValid: vi.fn().mockReturnValue(true),
        getToken: vi.fn().mockResolvedValue('valid-token')
      };

      const mockCircuitBreaker = {
        getMetrics: vi.fn().mockReturnValue({
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          rejectedRequests: 0,
          stateChanges: []
        }),
        getState: vi.fn().mockReturnValue(CircuitState.CLOSED)
      };

      mockApiClient.getCircuitBreakerMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        rejectedRequests: 0,
        stateChanges: []
      });

      mockApiClient.getInternalServices.mockReturnValue({
        pool: createMockPool(mockAuth),
        circuitBreaker: mockCircuitBreaker
      });

      const startTime = Date.now();
      await healthService.performHealthCheck();
      const duration = Date.now() - startTime;

      // 檢查執行時間（應該相對較短，因為是並行的）
      // 如果是順序執行，應該需要更長時間
      expect(duration).toBeLessThan(1000); // 應該在 1 秒內完成
    });
  });
});
