/**
 * TPASS Fare Calculator Tests
 * 跨區 TPASS 票價計算測試 (TDD)
 */

import { describe, it, expect } from 'vitest';
import {
  findBoundaryStations,
  calculateCrossRegionOptions,
  getBestFareOption,
  type FareOption,
  type CrossRegionFareResult,
} from '../../src/lib/tpass-fare.js';

// ============================================================
// Boundary Station Detection Tests
// ============================================================
describe('Boundary Station Detection', () => {
  describe('findBoundaryStations', () => {
    it('should find boundary stations for 基北北桃 going south', () => {
      const boundaries = findBoundaryStations('kpnt', '1150'); // 內壢 is in region, 新竹 (1150) is outside

      // Should return stations at the edge of the region
      expect(boundaries.length).toBeGreaterThan(0);
      // 桃園 (1080), 內壢 (1100) should be potential boundaries
      expect(boundaries.some(b => b.stationId === '1100')).toBe(true); // 內壢
    });

    it('should find boundary stations for 桃竹竹苗 going south', () => {
      const boundaries = findBoundaryStations('tzms', '3360'); // 台中 is outside

      expect(boundaries.length).toBeGreaterThan(0);
      // 三義 (3190) or nearby stations should be boundaries
    });

    it('should return empty for destination within same region', () => {
      const boundaries = findBoundaryStations('kpnt', '1000'); // 台北 is in 基北北桃

      expect(boundaries).toEqual([]);
    });

    it('should handle unknown region gracefully', () => {
      const boundaries = findBoundaryStations('unknown', '1000');

      expect(boundaries).toEqual([]);
    });
  });
});

// ============================================================
// Cross-Region Fare Calculation Tests
// ============================================================
describe('Cross-Region Fare Calculation', () => {
  describe('calculateCrossRegionOptions', () => {
    it('should calculate fare options for 台北 → 新竹', async () => {
      // Mock fare lookup function
      const mockGetFare = async (from: string, to: string): Promise<number> => {
        const fares: Record<string, number> = {
          '1000-1150': 160, // 台北 → 新竹 (直達)
          '1100-1150': 52,  // 內壢 → 新竹
          '1080-1150': 68,  // 桃園 → 新竹
        };
        return fares[`${from}-${to}`] || 100;
      };

      const result = await calculateCrossRegionOptions(
        '1000', // 台北
        '1150', // 新竹
        'kpnt', // 基北北桃
        mockGetFare
      );

      expect(result.crossRegion).toBe(true);
      expect(result.directFare).toBe(160);
      expect(result.options.length).toBeGreaterThan(0);

      // Should have a TPASS partial option
      const tpassOption = result.options.find(o => o.type === 'tpass_partial');
      expect(tpassOption).toBeDefined();
    });

    it('should mark best option as recommended', async () => {
      const mockGetFare = async (from: string, to: string): Promise<number> => {
        const fares: Record<string, number> = {
          '1000-1150': 160,
          '1100-1150': 52,
          '1080-1150': 68,
        };
        return fares[`${from}-${to}`] || 100;
      };

      const result = await calculateCrossRegionOptions(
        '1000',
        '1150',
        'kpnt',
        mockGetFare
      );

      const recommendedOptions = result.options.filter(o => o.recommended);
      expect(recommendedOptions.length).toBe(1);
      expect(recommendedOptions[0].totalFare).toBeLessThanOrEqual(
        Math.min(...result.options.map(o => o.totalFare))
      );
    });

    it('should calculate savings correctly', async () => {
      const mockGetFare = async (from: string, to: string): Promise<number> => {
        const fares: Record<string, number> = {
          '1000-1150': 160,
          '1100-1150': 52,
        };
        return fares[`${from}-${to}`] || 100;
      };

      const result = await calculateCrossRegionOptions(
        '1000',
        '1150',
        'kpnt',
        mockGetFare
      );

      const tpassOption = result.options.find(
        o => o.type === 'tpass_partial' && o.transferStation === '1100'
      );

      if (tpassOption) {
        expect(tpassOption.savings).toBe(160 - 52); // 108
      }
    });

    it('should handle same-region destination', async () => {
      const mockGetFare = async (): Promise<number> => 50;

      const result = await calculateCrossRegionOptions(
        '1000', // 台北
        '1020', // 板橋 (same region)
        'kpnt',
        mockGetFare
      );

      expect(result.crossRegion).toBe(false);
      expect(result.options.length).toBe(1);
      expect(result.options[0].type).toBe('tpass_free');
    });
  });

  describe('getBestFareOption', () => {
    it('should return the option with lowest total fare', () => {
      const options: FareOption[] = [
        { type: 'direct', description: '直接購票', totalFare: 160, savings: 0 },
        { type: 'tpass_partial', description: 'TPASS 到中壢', transferStation: '1100', totalFare: 52, savings: 108 },
        { type: 'tpass_partial', description: 'TPASS 到桃園', transferStation: '1080', totalFare: 68, savings: 92 },
      ];

      const best = getBestFareOption(options);

      expect(best.totalFare).toBe(52);
      expect(best.transferStation).toBe('1100');
    });

    it('should prefer TPASS option when fare is same', () => {
      const options: FareOption[] = [
        { type: 'direct', description: '直接購票', totalFare: 50, savings: 0 },
        { type: 'tpass_partial', description: 'TPASS', transferStation: '1100', totalFare: 50, savings: 0 },
      ];

      const best = getBestFareOption(options);

      expect(best.type).toBe('tpass_partial');
    });
  });
});

// ============================================================
// Edge Cases
// ============================================================
describe('Edge Cases', () => {
  it('should handle destination not in any region', async () => {
    const mockGetFare = async (): Promise<number> => 500;

    // 假設某站不在任何生活圈
    const result = await calculateCrossRegionOptions(
      '1000',
      '9999', // 不存在的站
      'kpnt',
      mockGetFare
    );

    // Should still return direct fare option
    expect(result.options.length).toBeGreaterThanOrEqual(1);
    expect(result.options.some(o => o.type === 'direct')).toBe(true);
  });

  it('should handle multiple boundary stations', async () => {
    const fareQueries: string[] = [];
    const mockGetFare = async (from: string, to: string): Promise<number> => {
      fareQueries.push(`${from}-${to}`);
      return 100;
    };

    await calculateCrossRegionOptions(
      '1000',
      '3360', // 台中 (far from 基北北桃)
      'kpnt',
      mockGetFare
    );

    // Should query multiple boundary stations
    expect(fareQueries.length).toBeGreaterThan(1);
  });
});

// ============================================================
// Integration with Station Names
// ============================================================
describe('Station Name Integration', () => {
  it('should include station names in result', async () => {
    const mockGetFare = async (): Promise<number> => 100;

    const result = await calculateCrossRegionOptions(
      '1000', // 台北
      '1150', // 新竹
      'kpnt',
      mockGetFare
    );

    expect(result.fromStation).toBeDefined();
    expect(result.toStation).toBeDefined();
    expect(result.regionName).toBe('基北北桃');
  });
});
