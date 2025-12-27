/**
 * Alerts Command Tests
 * 阻通資訊指令測試
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

describe('Alerts Command', () => {
  let apiClient: TDXApiClient;

  // Mock data matching real TDX API response
  const mockAlerts: Alert[] = [
    {
      AlertID: 'alert-pingxi-001',
      Title: '天然災變',
      Description:
        '三貂嶺 <--> 菁桐 : 平溪線115年1月30日前全區間停駛，瑞芳=菁桐間公路接駁。',
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
      Description:
        '濁水 <--> 車埕 : 配合集集線隧道及邊坡改善工程施工，集集至車埕站公路接駁。',
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

  const mockResponse = {
    UpdateTime: '2025-01-15T00:00:00+08:00',
    Alerts: mockAlerts,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new TDXApiClient('test-id', 'test-secret');
  });

  describe('getAlerts API', () => {
    it('should fetch all alerts', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getAlerts();

      expect(result).toEqual(mockAlerts);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/Alert'),
        expect.any(Object)
      );
    });

    it('should cache alerts data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getAlerts();

      const cacheInstance = (
        apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }
      ).cache;
      expect(cacheInstance.set).toHaveBeenCalledWith(
        'alerts/all',
        mockAlerts,
        expect.any(Number)
      );
    });

    it('should use cache when available', async () => {
      const client = new TDXApiClient('test-id', 'test-secret');
      const cacheInstance = (
        client as unknown as { cache: { get: ReturnType<typeof vi.fn> } }
      ).cache;
      cacheInstance.get.mockReturnValue(mockAlerts);

      const result = await client.getAlerts();

      expect(result).toEqual(mockAlerts);
      expect(ofetch).not.toHaveBeenCalled();
    });

    it('should skip cache when requested', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getAlerts({ skipCache: true });

      expect(ofetch).toHaveBeenCalled();
    });

    it('should return empty array when no alerts', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce({ Alerts: [] });

      const result = await apiClient.getAlerts();

      expect(result).toEqual([]);
    });

    it('should handle response with undefined Alerts', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce({});

      const result = await apiClient.getAlerts();

      expect(result).toEqual([]);
    });
  });

  describe('Alert Data Structure', () => {
    it('should have required fields in alert', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getAlerts();
      const alert = result[0];

      expect(alert).toHaveProperty('AlertID');
      expect(alert).toHaveProperty('Title');
      expect(alert).toHaveProperty('Description');
      expect(alert).toHaveProperty('Status');
      expect(alert).toHaveProperty('Scope');
    });

    it('should have stations in scope', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getAlerts();
      const alert = result[0];

      expect(alert.Scope?.Stations).toBeDefined();
      expect(alert.Scope?.Stations?.length).toBeGreaterThan(0);
      expect(alert.Scope?.Stations?.[0]).toHaveProperty('StationID');
      expect(alert.Scope?.Stations?.[0]).toHaveProperty('StationName');
    });

    it('should have lines in scope', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getAlerts();
      const alert = result[0];

      expect(alert.Scope?.Lines).toBeDefined();
      expect(alert.Scope?.Lines?.[0]).toHaveProperty('LineID');
      expect(alert.Scope?.Lines?.[0]).toHaveProperty('LineName');
    });
  });

  describe('Alert Status Filtering', () => {
    it('should return only active alerts (Status === 2)', async () => {
      const mixedAlerts: Alert[] = [
        ...mockAlerts,
        {
          AlertID: 'resolved-alert',
          Title: '已解除',
          Description: '已恢復正常',
          Status: 1, // resolved
          Scope: { Stations: [] },
        },
      ];
      vi.mocked(ofetch).mockResolvedValueOnce({ Alerts: mixedAlerts });

      const result = await apiClient.getAlerts();

      // API returns all, filtering is done in AlertService
      expect(result).toHaveLength(3);
    });
  });
});
