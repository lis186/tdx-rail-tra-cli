/**
 * Journey Command - Alert Integration Tests
 * 行程規劃指令 - 阻通資訊整合測試
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Alert } from '../../src/types/api.js';

// Mock ofetch
vi.mock('ofetch', () => ({
  ofetch: vi.fn(),
}));

// Mock AuthService
vi.mock('../../src/services/auth.js', () => ({
  AuthService: class MockAuthService {
    getToken = vi.fn().mockResolvedValue('mock-token-123');
    isTokenValid = vi.fn().mockReturnValue(true);
    clearCache = vi.fn();
  },
}));

// Mock CacheService
vi.mock('../../src/services/cache.js', () => ({
  CacheService: class MockCacheService {
    get = vi.fn().mockReturnValue(null);
    set = vi.fn();
    has = vi.fn().mockReturnValue(false);
    delete = vi.fn();
    clear = vi.fn();
    getStatus = vi.fn();
    getCacheDir = vi.fn();
  },
}));

import { ofetch } from 'ofetch';
import { TDXApiClient } from '../../src/services/api.js';
import { AlertService, NormalizedAlert } from '../../src/services/alert.js';

describe('Journey Command - Alert Integration', () => {
  let apiClient: TDXApiClient;
  let alertService: AlertService;

  // Mock alert data for suspended stations
  const mockAlerts: Alert[] = [
    {
      AlertID: 'alert-pingxi-001',
      Title: '天然災變',
      Description: '三貂嶺 <--> 菁桐 : 平溪線115年1月30日前全區間停駛，瑞芳=菁桐間公路接駁。',
      Status: 2, // active
      Scope: {
        Stations: [
          { StationID: '7330', StationName: '三貂嶺' },
          { StationID: '7331', StationName: '大華' },
          { StationID: '7332', StationName: '十分' },
          { StationID: '7333', StationName: '望古' },
          { StationID: '7334', StationName: '嶺腳' },
          { StationID: '7335', StationName: '平溪' },
          { StationID: '7336', StationName: '菁桐' },
        ],
        Lines: [{ LineID: 'PX', LineName: '平溪線' }],
      },
    },
    {
      AlertID: 'alert-jiji-001',
      Title: '天然災變',
      Description: '濁水 <--> 車埕 : 配合集集線隧道及邊坡改善工程施工，集集至車埕站公路接駁。',
      Status: 2,
      Scope: {
        Stations: [
          { StationID: '3432', StationName: '濁水' },
          { StationID: '3433', StationName: '龍泉' },
          { StationID: '3434', StationName: '集集' },
          { StationID: '3435', StationName: '水里' },
          { StationID: '3436', StationName: '車埕' },
        ],
        Lines: [{ LineID: 'JJ', LineName: '集集線' }],
      },
    },
  ];

  const mockAlertsResponse = {
    UpdateTime: '2025-01-15T00:00:00+08:00',
    Alerts: mockAlerts,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new TDXApiClient('test-id', 'test-secret');
    alertService = new AlertService(apiClient);
  });

  describe('Station Suspension Check', () => {
    it('should detect suspended station from Pingxi line', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const result = await alertService.isStationSuspended('7332'); // 十分

      expect(result).not.toBeNull();
      expect(result?.title).toBe('天然災變');
      expect(result?.affectedStationIds.has('7332')).toBe(true);
    });

    it('should return null for non-suspended station', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const result = await alertService.isStationSuspended('1000'); // 台北

      expect(result).toBeNull();
    });

    it('should detect suspended station from Jiji line', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const result = await alertService.isStationSuspended('3436'); // 車埕

      expect(result).not.toBeNull();
      expect(result?.affectedStationIds.has('3436')).toBe(true);
    });

    it('should include alternative transport info', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const result = await alertService.isStationSuspended('7335'); // 平溪

      expect(result).not.toBeNull();
      expect(result?.alternativeTransport).toBe('瑞芳=菁桐間公路接駁');
    });
  });

  describe('checkStations Method', () => {
    it('should check multiple stations at once', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const result = await alertService.checkStations(['1000', '7332', '4400']);

      expect(result.size).toBe(1);
      expect(result.has('7332')).toBe(true);
      expect(result.has('1000')).toBe(false);
      expect(result.has('4400')).toBe(false);
    });

    it('should return empty map when no stations are suspended', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const result = await alertService.checkStations(['1000', '4400']);

      expect(result.size).toBe(0);
    });

    it('should return multiple alerts for multiple suspended stations', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const result = await alertService.checkStations(['7332', '3436']); // 十分 + 車埕

      expect(result.size).toBe(2);
      expect(result.get('7332')?.description).toContain('平溪線');
      expect(result.get('3436')?.description).toContain('集集線');
    });
  });

  describe('Error Response Format', () => {
    it('should provide STATION_SUSPENDED error structure', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const alert = await alertService.isStationSuspended('7335');

      // Expected error structure for journey command
      const expectedError = {
        code: 'STATION_SUSPENDED',
        message: `平溪站目前停駛中`,
        alert: {
          id: alert?.id,
          title: alert?.title,
          description: alert?.description,
          alternativeTransport: alert?.alternativeTransport,
        },
        suggestion: '請改查詢至瑞芳站，再轉乘公路接駁',
      };

      expect(alert).not.toBeNull();
      expect(alert?.alternativeTransport).toBeDefined();
    });
  });

  describe('Journey Pre-check Flow', () => {
    it('should allow journey for non-suspended stations', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const fromAlert = await alertService.isStationSuspended('1000'); // 台北
      const toAlert = await alertService.isStationSuspended('4400'); // 高雄

      expect(fromAlert).toBeNull();
      expect(toAlert).toBeNull();
      // Journey should proceed normally
    });

    it('should block journey when from station is suspended', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const fromAlert = await alertService.isStationSuspended('7332'); // 十分

      expect(fromAlert).not.toBeNull();
      // Journey should be blocked with STATION_SUSPENDED error
    });

    it('should block journey when to station is suspended', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockAlertsResponse);

      const toAlert = await alertService.isStationSuspended('7336'); // 菁桐

      expect(toAlert).not.toBeNull();
      // Journey should be blocked with STATION_SUSPENDED error
    });
  });
});
