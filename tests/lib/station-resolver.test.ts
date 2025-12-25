import { describe, it, expect, beforeEach } from 'vitest';
import { StationResolver } from '../../src/lib/station-resolver.js';
import type { Station } from '../../src/types/station.js';

describe('StationResolver', () => {
  let resolver: StationResolver;

  const testStations: Station[] = [
    { id: '0900', name: '基隆', lat: 25.1319, lon: 121.73837 },
    { id: '1000', name: '臺北', lat: 25.04775, lon: 121.51711 },
    { id: '1020', name: '板橋', lat: 25.01408, lon: 121.46512 },
    { id: '1080', name: '桃園', lat: 24.98967, lon: 121.31407 },
    { id: '1210', name: '新竹', lat: 24.80172, lon: 120.97164 },
    { id: '3360', name: '臺中', lat: 24.13664, lon: 120.68539 },
    { id: '4220', name: '臺南', lat: 22.99713, lon: 120.21291 },
    { id: '4400', name: '高雄', lat: 22.63944, lon: 120.30256 },
    { id: '1190', name: '瑞芳', lat: 25.10892, lon: 121.80997 },
    { id: '2260', name: '雙溪', lat: 25.03389, lon: 121.86583 },
    { id: '3430', name: '潮州', lat: 22.55028, lon: 120.53944 },
  ];

  const testNicknames: Record<string, string> = {
    '北車': '1000',
    '南車': '4220',
    '高火': '4400',
  };

  const testCorrections: Record<string, string> = {
    '瑞方': '瑞芳',
    '版橋': '板橋',
    '朝州': '潮州',
    '双溪': '雙溪',
  };

  beforeEach(() => {
    resolver = new StationResolver(testStations, testNicknames, testCorrections);
  });

  describe('resolveStation', () => {
    describe('ID lookup', () => {
      it('should return station by exact ID', () => {
        const result = resolver.resolve('1000');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('1000');
          expect(result.station.name).toBe('臺北');
          expect(result.confidence).toBe('exact');
        }
      });

      it('should return error for non-existent ID', () => {
        const result = resolver.resolve('9999');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('STATION_NOT_FOUND');
        }
      });
    });

    describe('Name lookup', () => {
      it('should return station by exact name', () => {
        const result = resolver.resolve('臺北');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('1000');
          expect(result.confidence).toBe('exact');
        }
      });

      it('should remove suffix "車站" before matching', () => {
        const result = resolver.resolve('臺北車站');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('1000');
        }
      });

      it('should remove suffix "火車站" before matching', () => {
        const result = resolver.resolve('臺北火車站');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('1000');
        }
      });

      it('should remove suffix "站" before matching', () => {
        const result = resolver.resolve('臺北站');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('1000');
        }
      });
    });

    describe('Variant character handling (台/臺)', () => {
      it('should match "台北" to "臺北"', () => {
        const result = resolver.resolve('台北');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('1000');
          expect(result.station.name).toBe('臺北');
        }
      });

      it('should match "台中" to "臺中"', () => {
        const result = resolver.resolve('台中');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('3360');
        }
      });

      it('should match "台南" to "臺南"', () => {
        const result = resolver.resolve('台南');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('4220');
        }
      });
    });

    describe('Nickname resolution', () => {
      it('should resolve "北車" to 臺北 (1000)', () => {
        const result = resolver.resolve('北車');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('1000');
          expect(result.station.name).toBe('臺北');
        }
      });

      it('should resolve "南車" to 臺南 (4220)', () => {
        const result = resolver.resolve('南車');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('4220');
        }
      });

      it('should resolve "高火" to 高雄 (4400)', () => {
        const result = resolver.resolve('高火');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.id).toBe('4400');
        }
      });
    });

    describe('Typo corrections', () => {
      it('should correct "瑞方" to "瑞芳"', () => {
        const result = resolver.resolve('瑞方');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.name).toBe('瑞芳');
        }
      });

      it('should correct "版橋" to "板橋"', () => {
        const result = resolver.resolve('版橋');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.name).toBe('板橋');
        }
      });

      it('should correct "朝州" to "潮州"', () => {
        const result = resolver.resolve('朝州');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.name).toBe('潮州');
        }
      });

      it('should correct simplified "双溪" to "雙溪"', () => {
        const result = resolver.resolve('双溪');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.name).toBe('雙溪');
        }
      });
    });

    describe('Fuzzy search', () => {
      it('should find fuzzy match with distance 1 (high confidence)', () => {
        // "基龍" vs "基隆" - one character different
        const result = resolver.resolve('基龍');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.name).toBe('基隆');
          expect(result.confidence).toBe('high');
        }
      });

      it('should find fuzzy match with distance 2 (medium confidence)', () => {
        // "基龍市" vs "基隆" - distance 2 (龍→隆 + 刪市)
        const result = resolver.resolve('基龍市');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.station.name).toBe('基隆');
          expect(result.confidence).toBe('medium');
        }
      });

      it('should return error with candidates for distance > 2', () => {
        const result = resolver.resolve('完全不存在');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('STATION_NOT_FOUND');
          expect(result.error.candidates).toBeDefined();
          expect(Array.isArray(result.error.candidates)).toBe(true);
        }
      });
    });

    describe('Error responses', () => {
      it('should include suggestion when close match exists', () => {
        const result = resolver.resolve('瑞方');
        // This should be corrected, not an error
        expect(result.success).toBe(true);
      });

      it('should include candidates list for unknown station', () => {
        const result = resolver.resolve('不存在的車站');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.candidates).toBeDefined();
          expect(result.error.candidates.length).toBeGreaterThan(0);
          expect(result.error.candidates.length).toBeLessThanOrEqual(5);
        }
      });

      it('should have proper error message format', () => {
        const result = resolver.resolve('完全找不到');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('完全找不到');
        }
      });
    });
  });
});
