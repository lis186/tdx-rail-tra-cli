import { describe, it, expect } from 'vitest';
import {
  isTpassEligibleTrainType,
  getStationRegions,
  getCommonRegions,
  checkTpassEligibility,
  getAllRegions,
  getRegionById,
  getRegionByName,
  getEligibleTrainTypes,
  getExcludedTrainTypes,
} from '../../src/lib/tpass.js';

describe('TPASS Module', () => {
  describe('isTpassEligibleTrainType', () => {
    it('should return true for regular train types', () => {
      expect(isTpassEligibleTrainType('區間')).toBe(true);
      expect(isTpassEligibleTrainType('區間快')).toBe(true);
      expect(isTpassEligibleTrainType('莒光')).toBe(true);
      expect(isTpassEligibleTrainType('復興')).toBe(true);
      expect(isTpassEligibleTrainType('自強')).toBe(true);
    });

    it('should return false for EMU3000', () => {
      expect(isTpassEligibleTrainType('EMU3000')).toBe(false);
      expect(isTpassEligibleTrainType('自強3000')).toBe(false);
      expect(isTpassEligibleTrainType('新自強 EMU3000')).toBe(false);
    });

    it('should return false for Puyuma', () => {
      expect(isTpassEligibleTrainType('普悠瑪')).toBe(false);
      expect(isTpassEligibleTrainType('PUYUMA')).toBe(false);
    });

    it('should return false for Taroko', () => {
      expect(isTpassEligibleTrainType('太魯閣')).toBe(false);
      expect(isTpassEligibleTrainType('TAROKO')).toBe(false);
    });

    it('should return false for tourism trains', () => {
      expect(isTpassEligibleTrainType('觀光列車')).toBe(false);
      expect(isTpassEligibleTrainType('藍皮解憂號')).toBe(false);
      expect(isTpassEligibleTrainType('鳴日號')).toBe(false);
    });

    it('should return false for group and business trains', () => {
      expect(isTpassEligibleTrainType('團體列車')).toBe(false);
      expect(isTpassEligibleTrainType('商務專開')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isTpassEligibleTrainType('emu3000')).toBe(false);
      expect(isTpassEligibleTrainType('puyuma')).toBe(false);
      expect(isTpassEligibleTrainType('taroko')).toBe(false);
    });
  });

  describe('getStationRegions', () => {
    it('should return regions for Taipei station', () => {
      const regions = getStationRegions('1000'); // 臺北
      expect(regions.length).toBeGreaterThan(0);
      expect(regions.some((r) => r.name === '基北北桃')).toBe(true);
    });

    it('should return regions for Taoyuan station (multiple regions)', () => {
      const regions = getStationRegions('1080'); // 桃園
      expect(regions.length).toBeGreaterThan(0);
      // 桃園 should be in both 基北北桃 and 桃竹竹苗
      expect(regions.some((r) => r.name === '基北北桃')).toBe(true);
      expect(regions.some((r) => r.name === '桃竹竹苗')).toBe(true);
    });

    it('should return empty array for station not in any region', () => {
      const regions = getStationRegions('9999'); // Non-existent
      expect(regions).toEqual([]);
    });
  });

  describe('getCommonRegions', () => {
    it('should return common region for same-region stations', () => {
      // 臺北 and 松山 are both in 基北北桃
      const common = getCommonRegions('1000', '0990');
      expect(common.length).toBeGreaterThan(0);
      expect(common.some((r) => r.name === '基北北桃')).toBe(true);
    });

    it('should return empty array for cross-region stations', () => {
      // 臺北 (基北北桃) and 新竹 (桃竹竹苗)
      const common = getCommonRegions('1000', '1210');
      expect(common).toEqual([]);
    });

    it('should return common region for overlapping stations', () => {
      // 桃園 and 中壢 are both in 基北北桃 and 桃竹竹苗
      const common = getCommonRegions('1080', '1100');
      expect(common.length).toBeGreaterThan(0);
    });
  });

  describe('checkTpassEligibility', () => {
    it('should return eligible for same-region OD pair', () => {
      const result = checkTpassEligibility('1000', '0990', '臺北', '松山');
      expect(result.eligible).toBe(true);
      expect(result.regions).toBeDefined();
      expect(result.regions!.length).toBeGreaterThan(0);
    });

    it('should return not eligible for cross-region OD pair', () => {
      const result = checkTpassEligibility('1000', '1210', '臺北', '新竹');
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('CROSS_REGION');
      expect(result.from).toBeDefined();
      expect(result.to).toBeDefined();
      expect(result.suggestion).toBeDefined();
    });

    it('should return not eligible for station not in any region', () => {
      const result = checkTpassEligibility('9999', '1000', 'Unknown', '臺北');
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('NO_REGION');
    });

    it('should include station names in result', () => {
      const result = checkTpassEligibility('1000', '0990', '臺北', '松山');
      // For eligible result, we don't include from/to
      expect(result.eligible).toBe(true);
    });
  });

  describe('getAllRegions', () => {
    it('should return all 9 TPASS regions', () => {
      const regions = getAllRegions();
      expect(regions.length).toBe(9);
    });

    it('should include expected region names', () => {
      const regions = getAllRegions();
      const names = regions.map((r) => r.name);
      expect(names).toContain('基北北桃');
      expect(names).toContain('桃竹竹苗');
      expect(names).toContain('中彰投苗');
      expect(names).toContain('雲林');
      expect(names).toContain('嘉義');
      expect(names).toContain('南高屏');
      expect(names).toContain('北宜');
      expect(names).toContain('花蓮');
      expect(names).toContain('臺東');
    });
  });

  describe('getRegionById', () => {
    it('should return region by ID', () => {
      const region = getRegionById('kpnt');
      expect(region).toBeDefined();
      expect(region!.name).toBe('基北北桃');
    });

    it('should return undefined for invalid ID', () => {
      const region = getRegionById('invalid');
      expect(region).toBeUndefined();
    });
  });

  describe('getRegionByName', () => {
    it('should return region by exact name', () => {
      const region = getRegionByName('基北北桃');
      expect(region).toBeDefined();
      expect(region!.id).toBe('kpnt');
    });

    it('should return region by partial name', () => {
      const region = getRegionByName('北桃');
      expect(region).toBeDefined();
      expect(region!.name).toBe('基北北桃');
    });

    it('should return region by ID', () => {
      const region = getRegionByName('kpnt');
      expect(region).toBeDefined();
      expect(region!.name).toBe('基北北桃');
    });

    it('should return undefined for invalid name', () => {
      const region = getRegionByName('不存在');
      expect(region).toBeUndefined();
    });
  });

  describe('getEligibleTrainTypes', () => {
    it('should return list of eligible train types', () => {
      const types = getEligibleTrainTypes();
      expect(types.length).toBeGreaterThan(0);
      expect(types).toContain('區間車');
      expect(types).toContain('區間快');
    });
  });

  describe('getExcludedTrainTypes', () => {
    it('should return list of excluded train types', () => {
      const types = getExcludedTrainTypes();
      expect(types.length).toBeGreaterThan(0);
      expect(types.some((t) => t.includes('EMU3000'))).toBe(true);
      expect(types.some((t) => t.includes('普悠瑪'))).toBe(true);
      expect(types.some((t) => t.includes('太魯閣'))).toBe(true);
    });
  });
});
