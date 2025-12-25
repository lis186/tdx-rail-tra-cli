import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DailyStationTimetable } from '../../src/types/api.js';

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

describe('Timetable Station Command', () => {
  let apiClient: TDXApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new TDXApiClient('test-id', 'test-secret');
  });

  describe('getStationTimetable', () => {
    const mockTimetables: DailyStationTimetable[] = [
      {
        TrainDate: '2025-01-15',
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        Direction: 0,
        TimeTables: [
          {
            TrainNo: '123',
            TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
            EndingStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
            ArrivalTime: '08:28',
            DepartureTime: '08:30',
          },
          {
            TrainNo: '125',
            TrainTypeName: { Zh_tw: '區間', En: 'Local' },
            EndingStationName: { Zh_tw: '桃園', En: 'Taoyuan' },
            DepartureTime: '08:45',
          },
        ],
      },
      {
        TrainDate: '2025-01-15',
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        Direction: 1,
        TimeTables: [
          {
            TrainNo: '456',
            TrainTypeName: { Zh_tw: '普悠瑪', En: 'Puyuma' },
            EndingStationName: { Zh_tw: '花蓮', En: 'Hualien' },
            ArrivalTime: '09:00',
            DepartureTime: '09:02',
          },
        ],
      },
    ];

    const mockResponse = {
      UpdateTime: '2025-01-15T00:00:00+08:00',
      StationTimetables: mockTimetables,
    };

    it('should fetch station timetable', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getStationTimetable('1000', '2025-01-15');

      expect(result).toEqual(mockTimetables);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/DailyStationTimetable/Station/1000/2025-01-15'),
        expect.any(Object)
      );
    });

    it('should filter by direction when specified', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getStationTimetable('1000', '2025-01-15', 0);

      expect(ofetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          query: expect.objectContaining({
            $filter: 'Direction eq 0',
          }),
        })
      );
    });

    it('should cache timetable data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getStationTimetable('1000', '2025-01-15');

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).toHaveBeenCalledWith(
        'timetable/station-1000-2025-01-15',
        mockTimetables,
        expect.any(Number)
      );
    });

    it('should use different cache key for direction filter', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getStationTimetable('1000', '2025-01-15', 1);

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).toHaveBeenCalledWith(
        'timetable/station-1000-2025-01-15-1',
        mockTimetables,
        expect.any(Number)
      );
    });

    it('should use cache when available', async () => {
      const client = new TDXApiClient('test-id', 'test-secret');
      const cacheInstance = (client as unknown as { cache: { get: ReturnType<typeof vi.fn> } }).cache;
      cacheInstance.get.mockReturnValue(mockTimetables);

      const result = await client.getStationTimetable('1000', '2025-01-15');

      expect(result).toEqual(mockTimetables);
      expect(ofetch).not.toHaveBeenCalled();
    });

    it('should return empty array when no timetables', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce({ StationTimetables: [] });

      const result = await apiClient.getStationTimetable('9999', '2025-01-15');

      expect(result).toEqual([]);
    });
  });
});
