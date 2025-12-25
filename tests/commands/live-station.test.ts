import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StationLiveBoard } from '../../src/types/api.js';

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

describe('Live Station Command', () => {
  let apiClient: TDXApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new TDXApiClient('test-id', 'test-secret');
  });

  describe('getStationLiveBoard', () => {
    const mockLiveBoards: StationLiveBoard[] = [
      {
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        TrainNo: '123',
        TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
        EndingStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
        Direction: 0,
        ScheduledDepartureTime: '08:30',
        ScheduledArrivalTime: '08:28',
        DelayTime: 0,
        Platform: '1A',
        UpdateTime: '2025-01-15T08:25:00+08:00',
      },
      {
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        TrainNo: '456',
        TrainTypeName: { Zh_tw: '區間', En: 'Local' },
        EndingStationName: { Zh_tw: '基隆', En: 'Keelung' },
        Direction: 1,
        ScheduledDepartureTime: '08:35',
        ScheduledArrivalTime: '08:33',
        DelayTime: 5,
        UpdateTime: '2025-01-15T08:25:00+08:00',
      },
    ];

    const mockResponse = {
      UpdateTime: '2025-01-15T08:25:00+08:00',
      StationLiveBoards: mockLiveBoards,
    };

    it('should fetch station liveboard', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getStationLiveBoard('1000');

      expect(result).toEqual(mockLiveBoards);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/StationLiveBoard/Station/1000'),
        expect.any(Object)
      );
    });

    it('should return empty array when no trains', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce({ StationLiveBoards: [] });

      const result = await apiClient.getStationLiveBoard('1000');

      expect(result).toEqual([]);
    });

    it('should not cache live data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getStationLiveBoard('1000');

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).not.toHaveBeenCalled();
    });

    it('should return trains with delay info', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getStationLiveBoard('1000');

      expect(result[0].DelayTime).toBe(0);
      expect(result[1].DelayTime).toBe(5);
    });

    it('should return trains with direction info', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getStationLiveBoard('1000');

      expect(result[0].Direction).toBe(0); // 順行
      expect(result[1].Direction).toBe(1); // 逆行
    });

    it('should return trains with platform info', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getStationLiveBoard('1000');

      expect(result[0].Platform).toBe('1A');
      expect(result[1].Platform).toBeUndefined();
    });
  });
});
