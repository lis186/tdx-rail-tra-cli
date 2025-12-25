import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Line, StationOfLine } from '../../src/types/api.js';

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

describe('Lines Command', () => {
  let apiClient: TDXApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new TDXApiClient('test-id', 'test-secret');
  });

  describe('getLines', () => {
    const mockLines: Line[] = [
      {
        LineID: 'WL',
        LineName: { Zh_tw: '西部幹線', En: 'Western Line' },
        IsBranch: false,
      },
      {
        LineID: 'TL',
        LineName: { Zh_tw: '台東線', En: 'Taitung Line' },
        LineSectionName: { Zh_tw: '花東段', En: 'Hualien-Taitung Section' },
        IsBranch: false,
      },
      {
        LineID: 'PX',
        LineName: { Zh_tw: '平溪線', En: 'Pingxi Line' },
        IsBranch: true,
      },
    ];

    const mockResponse = {
      UpdateTime: '2025-01-15T00:00:00+08:00',
      Lines: mockLines,
    };

    it('should fetch all lines', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getLines();

      expect(result).toEqual(mockLines);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/Line'),
        expect.any(Object)
      );
    });

    it('should cache lines data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getLines();

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).toHaveBeenCalledWith(
        'lines/all',
        mockLines,
        expect.any(Number)
      );
    });

    it('should use cache when available', async () => {
      const client = new TDXApiClient('test-id', 'test-secret');
      const cacheInstance = (client as unknown as { cache: { get: ReturnType<typeof vi.fn> } }).cache;
      cacheInstance.get.mockReturnValue(mockLines);

      const result = await client.getLines();

      expect(result).toEqual(mockLines);
      expect(ofetch).not.toHaveBeenCalled();
    });

    it('should skip cache when requested', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getLines({ skipCache: true });

      expect(ofetch).toHaveBeenCalled();
    });

    it('should return empty array when no lines', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce({ Lines: [] });

      const result = await apiClient.getLines();

      expect(result).toEqual([]);
    });
  });

  describe('getStationsOfLine', () => {
    const mockStationOfLine: StationOfLine = {
      LineID: 'WL',
      Stations: [
        {
          Sequence: 1,
          StationID: '0900',
          StationName: { Zh_tw: '基隆', En: 'Keelung' },
          CumulativeDistance: 0,
        },
        {
          Sequence: 2,
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          CumulativeDistance: 28800,
        },
        {
          Sequence: 3,
          StationID: '1080',
          StationName: { Zh_tw: '桃園', En: 'Taoyuan' },
          CumulativeDistance: 58600,
        },
      ],
    };

    const mockResponse = {
      UpdateTime: '2025-01-15T00:00:00+08:00',
      StationOfLines: [mockStationOfLine],
    };

    it('should fetch stations of line', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getStationsOfLine('WL');

      expect(result).toEqual(mockStationOfLine);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/StationOfLine'),
        expect.objectContaining({
          query: expect.objectContaining({
            $filter: "LineID eq 'WL'",
          }),
        })
      );
    });

    it('should return null when line not found', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce({ StationOfLines: [] });

      const result = await apiClient.getStationsOfLine('UNKNOWN');

      expect(result).toBeNull();
    });

    it('should cache stations of line data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getStationsOfLine('WL');

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).toHaveBeenCalledWith(
        'lines/stations-WL',
        mockStationOfLine,
        expect.any(Number)
      );
    });

    it('should use cache when available', async () => {
      const client = new TDXApiClient('test-id', 'test-secret');
      const cacheInstance = (client as unknown as { cache: { get: ReturnType<typeof vi.fn> } }).cache;
      cacheInstance.get.mockReturnValue(mockStationOfLine);

      const result = await client.getStationsOfLine('WL');

      expect(result).toEqual(mockStationOfLine);
      expect(ofetch).not.toHaveBeenCalled();
    });

    it('should return stations with sequence info', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getStationsOfLine('WL');

      expect(result?.Stations[0].Sequence).toBe(1);
      expect(result?.Stations[1].Sequence).toBe(2);
      expect(result?.Stations[2].Sequence).toBe(3);
    });

    it('should return stations with distance info', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getStationsOfLine('WL');

      expect(result?.Stations[0].CumulativeDistance).toBe(0);
      expect(result?.Stations[1].CumulativeDistance).toBe(28800);
      expect(result?.Stations[2].CumulativeDistance).toBe(58600);
    });
  });
});
