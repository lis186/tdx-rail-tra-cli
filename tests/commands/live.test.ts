import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TrainLiveBoard, TrainDelay } from '../../src/types/api.js';

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

describe('Live Command', () => {
  let apiClient: TDXApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new TDXApiClient('test-id', 'test-secret');
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

    const mockResponse = {
      UpdateTime: '2025-01-15T08:30:00+08:00',
      TrainLiveBoards: [mockLiveBoard],
    };

    it('should fetch live train position', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getTrainLiveBoard('123');

      expect(result).toEqual(mockLiveBoard);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/TrainLiveBoard/TrainNo/123'),
        expect.any(Object)
      );
    });

    it('should return null when train not found', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce({ TrainLiveBoards: [] });

      const result = await apiClient.getTrainLiveBoard('999999');

      expect(result).toBeNull();
    });

    it('should not cache live data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getTrainLiveBoard('123');

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).not.toHaveBeenCalled();
    });

    it('should return delay time', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getTrainLiveBoard('123');

      expect(result?.DelayTime).toBe(5);
    });

    it('should return current station', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getTrainLiveBoard('123');

      expect(result?.StationName.Zh_tw).toBe('臺北');
    });
  });

  describe('getTrainDelays', () => {
    // Mock data matching real TDX API response structure
    const mockDelays: TrainDelay[] = [
      {
        TrainNo: '123',
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        DelayTime: 5,
        SrcUpdateTime: '2025-01-15T08:29:00+08:00',
        UpdateTime: '2025-01-15T08:30:00+08:00',
      },
      {
        TrainNo: '456',
        StationID: '1020',
        StationName: { Zh_tw: '板橋', En: 'Banqiao' },
        DelayTime: 10,
        SrcUpdateTime: '2025-01-15T08:29:00+08:00',
        UpdateTime: '2025-01-15T08:30:00+08:00',
      },
      {
        TrainNo: '789',
        StationID: '3360',
        StationName: { Zh_tw: '臺中', En: 'Taichung' },
        DelayTime: 0,
        SrcUpdateTime: '2025-01-15T08:29:00+08:00',
        UpdateTime: '2025-01-15T08:30:00+08:00',
      },
    ];

    it('should fetch delays for multiple trains', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockDelays);

      const result = await apiClient.getTrainDelays(['123', '456', '789']);

      expect(result).toEqual(mockDelays);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/Rail/TRA/LiveTrainDelay'),
        expect.objectContaining({
          query: expect.objectContaining({
            $filter: "TrainNo eq '123' or TrainNo eq '456' or TrainNo eq '789'",
          }),
        })
      );
    });

    it('should return empty array when no trains specified', async () => {
      const result = await apiClient.getTrainDelays([]);

      expect(result).toEqual([]);
      expect(ofetch).not.toHaveBeenCalled();
    });

    it('should fetch delay for single train', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce([mockDelays[0]]);

      const result = await apiClient.getTrainDelays(['123']);

      expect(result.length).toBe(1);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/Rail/TRA/LiveTrainDelay'),
        expect.objectContaining({
          query: expect.objectContaining({
            $filter: "TrainNo eq '123'",
          }),
        })
      );
    });

    it('should not cache delay data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockDelays);

      await apiClient.getTrainDelays(['123', '456']);

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).not.toHaveBeenCalled();
    });
  });
});
