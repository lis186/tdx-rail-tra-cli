import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DailyTrainTimetable, GeneralTrainTimetable, TrainLiveBoard, ODFare, TrainDelay } from '../../src/types/api.js';

// Mock ofetch
vi.mock('ofetch', () => ({
  ofetch: vi.fn(),
}));

// Mock AuthService - 使用工廠函數返回完整的 mock 實例
vi.mock('../../src/services/auth.js', () => ({
  AuthService: class MockAuthService {
    getToken = vi.fn().mockResolvedValue('mock-token-123');
    isTokenValid = vi.fn().mockReturnValue(true);
    clearCache = vi.fn();
  },
}));

// Mock CacheService - 使用工廠函數返回完整的 mock 實例
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
import { AuthService } from '../../src/services/auth.js';
import { CacheService } from '../../src/services/cache.js';

describe('TDXApiClient', () => {
  let apiClient: TDXApiClient;
  const mockClientId = 'test-client-id';
  const mockClientSecret = 'test-client-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new TDXApiClient(mockClientId, mockClientSecret);
  });

  describe('constructor', () => {
    it('should have auth instance', () => {
      const authInstance = (apiClient as unknown as { auth: { getToken: ReturnType<typeof vi.fn> } }).auth;
      expect(authInstance.getToken).toBeDefined();
    });

    it('should have cache instance', () => {
      const cacheInstance = (apiClient as unknown as { cache: { get: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.get).toBeDefined();
    });
  });

  describe('getDailyTimetable', () => {
    const mockTimetable: DailyTrainTimetable[] = [
      {
        TrainDate: '2025-01-15',
        DailyTrainInfo: {
          TrainNo: '123',
          Direction: 0,
          TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
          StartingStationName: { Zh_tw: '臺北', En: 'Taipei' },
          EndingStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
        },
        StopTimes: [
          {
            StopSequence: 1,
            StationID: '1000',
            StationName: { Zh_tw: '臺北', En: 'Taipei' },
            DepartureTime: '08:00',
          },
          {
            StopSequence: 2,
            StationID: '4400',
            StationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
            ArrivalTime: '12:30',
          },
        ],
      },
    ];

    it('should fetch daily timetable for OD pair', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockTimetable);

      const result = await apiClient.getDailyTimetable('1000', '4400', '2025-01-15');

      expect(result).toEqual(mockTimetable);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/4400/2025-01-15'),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer mock-token-123',
          },
        })
      );
    });

    it('should use cache when available', async () => {
      // 使用新的 client 並設定 cache mock
      const client = new TDXApiClient(mockClientId, mockClientSecret);
      // 取得 cache 實例並設定返回值
      const cacheInstance = (client as unknown as { cache: { get: ReturnType<typeof vi.fn> } }).cache;
      cacheInstance.get.mockReturnValue(mockTimetable);

      const result = await client.getDailyTimetable('1000', '4400', '2025-01-15');

      expect(result).toEqual(mockTimetable);
      expect(cacheInstance.get).toHaveBeenCalledWith('timetable/od-1000-4400-2025-01-15');
      expect(ofetch).not.toHaveBeenCalled();
    });

    it('should cache response after fetch', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockTimetable);

      await apiClient.getDailyTimetable('1000', '4400', '2025-01-15');

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).toHaveBeenCalledWith(
        'timetable/od-1000-4400-2025-01-15',
        mockTimetable,
        expect.any(Number)
      );
    });

    it('should skip cache when skipCache option is true', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockTimetable);

      await apiClient.getDailyTimetable('1000', '4400', '2025-01-15', { skipCache: true });

      const cacheInstance = (apiClient as unknown as { cache: { get: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.get).not.toHaveBeenCalled();
      expect(ofetch).toHaveBeenCalled();
    });
  });

  describe('getTrainTimetable', () => {
    const mockTimetable: GeneralTrainTimetable = {
      TrainInfo: {
        TrainNo: '123',
        Direction: 0,
        TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
        StartingStationName: { Zh_tw: '臺北', En: 'Taipei' },
        EndingStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
      },
      StopTimes: [
        {
          StopSequence: 1,
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          DepartureTime: '08:00',
        },
      ],
    };

    it('should fetch train timetable by train number', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([mockTimetable]);

      const result = await apiClient.getTrainTimetable('123');

      expect(result).toEqual(mockTimetable);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/GeneralTrainTimetable/TrainNo/123'),
        expect.any(Object)
      );
    });

    it('should return null when train not found', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([]);

      const result = await apiClient.getTrainTimetable('999999');

      expect(result).toBeNull();
    });
  });

  describe('getTrainLiveBoard', () => {
    const mockLiveBoard: TrainLiveBoard = {
      TrainNo: '123',
      TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
      StationID: '1000',
      StationName: { Zh_tw: '臺北', En: 'Taipei' },
      DelayTime: 5,
      UpdateTime: '2025-01-15T08:30:00+08:00',
    };

    it('should fetch live train position', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([mockLiveBoard]);

      const result = await apiClient.getTrainLiveBoard('123');

      expect(result).toEqual(mockLiveBoard);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/TrainLiveBoard/TrainNo/123'),
        expect.any(Object)
      );
    });

    it('should return null when train not found', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([]);

      const result = await apiClient.getTrainLiveBoard('999999');

      expect(result).toBeNull();
    });

    it('should not cache live data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([mockLiveBoard]);

      await apiClient.getTrainLiveBoard('123');

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      // Live data should not be cached
      expect(cacheInstance.set).not.toHaveBeenCalled();
    });
  });

  describe('getTrainDelays', () => {
    const mockDelays: TrainDelay[] = [
      { TrainNo: '123', DelayTime: 5, UpdateTime: '2025-01-15T08:30:00+08:00' },
      { TrainNo: '456', DelayTime: 10, UpdateTime: '2025-01-15T08:30:00+08:00' },
    ];

    it('should fetch delays for multiple trains', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockDelays);

      const result = await apiClient.getTrainDelays(['123', '456']);

      expect(result).toEqual(mockDelays);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/Rail/TRA/LiveTrainDelay'),
        expect.objectContaining({
          query: expect.objectContaining({
            $filter: "TrainNo eq '123' or TrainNo eq '456'",
          }),
        })
      );
    });

    it('should return empty array when no trains specified', async () => {
      const result = await apiClient.getTrainDelays([]);

      expect(result).toEqual([]);
      expect(ofetch).not.toHaveBeenCalled();
    });
  });

  describe('getODFare', () => {
    const mockFare: ODFare = {
      OriginStationID: '1000',
      OriginStationName: { Zh_tw: '臺北', En: 'Taipei' },
      DestinationStationID: '4400',
      DestinationStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
      Fares: [
        { TicketType: 1, FareClass: 1, Price: 843 },
        { TicketType: 1, FareClass: 2, Price: 650 },
      ],
    };

    it('should fetch fare for OD pair', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([mockFare]);

      const result = await apiClient.getODFare('1000', '4400');

      expect(result).toEqual(mockFare);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/ODFare/1000/to/4400'),
        expect.any(Object)
      );
    });

    it('should return null when fare not found', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([]);

      const result = await apiClient.getODFare('9999', '8888');

      expect(result).toBeNull();
    });

    it('should cache fare data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([mockFare]);

      await apiClient.getODFare('1000', '4400');

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).toHaveBeenCalledWith(
        'fare/od-1000-4400',
        mockFare,
        expect.any(Number)
      );
    });
  });

  describe('error handling', () => {
    it('should throw error on API failure', async () => {
      vi.mocked(ofetch).mockRejectedValueOnce(new Error('Network error'));

      await expect(apiClient.getDailyTimetable('1000', '4400', '2025-01-15'))
        .rejects.toThrow('Network error');
    });

    it('should handle 401 unauthorized', async () => {
      const error = new Error('Unauthorized') as Error & { statusCode?: number };
      error.statusCode = 401;
      vi.mocked(ofetch).mockRejectedValueOnce(error);

      await expect(apiClient.getDailyTimetable('1000', '4400', '2025-01-15'))
        .rejects.toThrow('Unauthorized');
    });
  });

  describe('clearCache', () => {
    it('should clear cache with prefix', () => {
      apiClient.clearCache('timetable');

      const cacheInstance = (apiClient as unknown as { cache: { clear: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.clear).toHaveBeenCalledWith('timetable');
    });

    it('should clear all cache when no prefix', () => {
      apiClient.clearCache();

      const cacheInstance = (apiClient as unknown as { cache: { clear: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.clear).toHaveBeenCalledWith(undefined);
    });
  });
});
