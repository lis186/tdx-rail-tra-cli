import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ODFare } from '../../src/types/api.js';

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

describe('Fare Command', () => {
  let apiClient: TDXApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new TDXApiClient('test-id', 'test-secret');
  });

  describe('getODFare', () => {
    // Mock data matching real TDX API response structure
    const mockFare: ODFare = {
      OriginStationID: '1000',
      OriginStationName: { Zh_tw: '臺北', En: 'Taipei' },
      DestinationStationID: '4400',
      DestinationStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
      Direction: 1,
      TrainType: 7,
      Fares: [
        { TicketType: 1, FareClass: 1, CabinClass: 1, Price: 843 },
        { TicketType: 1, FareClass: 3, CabinClass: 1, Price: 422 },
        { TicketType: 3, FareClass: 1, CabinClass: 1, Price: 738 },
      ],
      TravelDistance: 371400,
    };

    const mockResponse = {
      UpdateTime: '2025-01-15T00:00:00+08:00',
      ODFares: [mockFare],
    };

    it('should fetch fare for OD pair', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getODFare('1000', '4400');

      expect(result).toEqual(mockFare);
      expect(ofetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/Rail/TRA/ODFare/1000/to/4400'),
        expect.any(Object)
      );
    });

    it('should return null when fare not found', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce({ ODFares: [] });

      const result = await apiClient.getODFare('9999', '8888');

      expect(result).toBeNull();
    });

    it('should cache fare data', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      await apiClient.getODFare('1000', '4400');

      const cacheInstance = (apiClient as unknown as { cache: { set: ReturnType<typeof vi.fn> } }).cache;
      expect(cacheInstance.set).toHaveBeenCalledWith(
        'fare/od-1000-4400',
        mockFare,
        expect.any(Number)
      );
    });

    it('should use cache when available', async () => {
      const client = new TDXApiClient('test-id', 'test-secret');
      const cacheInstance = (client as unknown as { cache: { get: ReturnType<typeof vi.fn> } }).cache;
      cacheInstance.get.mockReturnValue(mockFare);

      const result = await client.getODFare('1000', '4400');

      expect(result).toEqual(mockFare);
      expect(ofetch).not.toHaveBeenCalled();
    });

    it('should return fare with multiple ticket types', async () => {
      vi.mocked(ofetch).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getODFare('1000', '4400');

      expect(result?.Fares.length).toBe(3);
      expect(result?.Fares[0].TicketType).toBe(1);
      expect(result?.Fares[2].TicketType).toBe(3);
    });
  });
});
