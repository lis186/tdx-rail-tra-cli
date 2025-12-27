/**
 * AlertService Tests
 * 阻通資訊服務測試 (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertService, NormalizedAlert } from '../../src/services/alert.js';
import type { Alert } from '../../src/types/api.js';

// Mock TDX API 回應
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

// Mock API Client
const createMockApiClient = (alerts: Alert[] = mockAlerts) => ({
  getAlerts: vi.fn().mockResolvedValue(alerts),
});

describe('AlertService', () => {
  let alertService: AlertService;
  let mockApiClient: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    mockApiClient = createMockApiClient();
    alertService = new AlertService(mockApiClient as any);
  });

  describe('getActiveAlerts', () => {
    it('should return all active alerts', async () => {
      const alerts = await alertService.getActiveAlerts();

      expect(alerts).toHaveLength(2);
      expect(mockApiClient.getAlerts).toHaveBeenCalled();
    });

    it('should normalize alert data', async () => {
      const alerts = await alertService.getActiveAlerts();

      const pingxiAlert = alerts.find((a) => a.id === 'alert-pingxi-001');
      expect(pingxiAlert).toBeDefined();
      expect(pingxiAlert!.description).toContain('平溪線');
      expect(pingxiAlert!.affectedStationIds).toContain('7332'); // 十分
      expect(pingxiAlert!.affectedLineIds).toContain('PX');
    });

    it('should filter out inactive alerts', async () => {
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
      mockApiClient = createMockApiClient(mixedAlerts);
      alertService = new AlertService(mockApiClient as any);

      const alerts = await alertService.getActiveAlerts();

      expect(alerts).toHaveLength(2); // 只有 2 個 active
      expect(alerts.find((a) => a.id === 'resolved-alert')).toBeUndefined();
    });
  });

  describe('isStationSuspended', () => {
    it('should return alert for suspended station', async () => {
      const alert = await alertService.isStationSuspended('7332'); // 十分

      expect(alert).not.toBeNull();
      expect(alert!.affectedLineIds).toContain('PX');
    });

    it('should return null for normal station', async () => {
      const alert = await alertService.isStationSuspended('1000'); // 台北

      expect(alert).toBeNull();
    });

    it('should check multiple stations', async () => {
      const alerts = await alertService.checkStations(['1000', '7332', '3434']);

      expect(alerts).toHaveLength(2); // 十分 and 集集
    });
  });

  describe('isLineSuspended', () => {
    it('should return alert for suspended line', async () => {
      const alert = await alertService.isLineSuspended('PX'); // 平溪線

      expect(alert).not.toBeNull();
      expect(alert!.description).toContain('平溪線');
    });

    it('should return null for normal line', async () => {
      const alert = await alertService.isLineSuspended('WL'); // 西部幹線

      expect(alert).toBeNull();
    });
  });

  describe('parseAlternativeTransport', () => {
    it('should extract alternative transport info from description', async () => {
      const alerts = await alertService.getActiveAlerts();
      const pingxiAlert = alerts.find((a) => a.id === 'alert-pingxi-001');

      expect(pingxiAlert!.alternativeTransport).toContain('公路接駁');
    });
  });

  describe('caching', () => {
    it('should cache alerts and not call API again', async () => {
      await alertService.getActiveAlerts();
      await alertService.getActiveAlerts();
      await alertService.isStationSuspended('7332');

      // API should only be called once due to caching
      expect(mockApiClient.getAlerts).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache when forceRefresh is true', async () => {
      await alertService.getActiveAlerts();
      await alertService.getActiveAlerts({ forceRefresh: true });

      expect(mockApiClient.getAlerts).toHaveBeenCalledTimes(2);
    });
  });
});
