/**
 * Train Filter Tests
 * 班次篩選功能測試
 */

import { describe, it, expect } from 'vitest';
import {
  filterByTimeRange,
  filterByTrainType,
  filterByServices,
  sortTrains,
  parseTrainTypeInput,
  normalizeTrainType,
  getTrainTypeFareRank,
  type TrainFilterOptions,
  type TrainEntry,
} from '../../src/lib/train-filter.js';

// Mock train data for testing (matches actual TDX API response format)
// Based on real API responses from routes like 台北-高雄, 台北-花蓮
const mockTrains: TrainEntry[] = [
  {
    trainNo: '101',
    trainType: '自強(推拉式自強號且無自行車車廂)',
    trainTypeCode: '4',
    departure: '08:00',
    arrival: '12:00',
    bikeFlag: 0,
    wheelChairFlag: 1,
  },
  {
    trainNo: '102',
    trainType: '區間',
    trainTypeCode: '8',
    departure: '08:30',
    arrival: '14:00',
    bikeFlag: 1,
    wheelChairFlag: 1,
  },
  {
    trainNo: '103',
    trainType: '普悠瑪(普悠瑪)',
    trainTypeCode: '2',
    departure: '09:00',
    arrival: '11:30',
    bikeFlag: 0,
    wheelChairFlag: 0,
  },
  {
    trainNo: '104',
    trainType: '太魯閣(太魯閣)',
    trainTypeCode: '1',
    departure: '09:30',
    arrival: '11:45',
    bikeFlag: 0,
    wheelChairFlag: 1,
  },
  {
    trainNo: '105',
    trainType: '莒光(無身障座位)',
    trainTypeCode: '5',
    departure: '10:00',
    arrival: '15:00',
    bikeFlag: 1,
    wheelChairFlag: 1,
  },
  {
    trainNo: '106',
    trainType: '區間快',
    trainTypeCode: '7',
    departure: '10:30',
    arrival: '14:30',
    bikeFlag: 1,
    wheelChairFlag: 0,
  },
  {
    trainNo: '107',
    trainType: '自強(3000)(EMU3000 型電車)',
    trainTypeCode: '3',
    departure: '11:00',
    arrival: '13:00',
    bikeFlag: 0,
    wheelChairFlag: 1,
  },
  {
    trainNo: '108',
    trainType: '自強(推拉式自強號且有自行車車廂)',
    trainTypeCode: '4',
    departure: '11:30',
    arrival: '16:00',
    bikeFlag: 1,
    wheelChairFlag: 1,
  },
];

describe('Train Filter Module', () => {
  // ============================================================
  // Time Range Filtering
  // ============================================================
  describe('filterByTimeRange', () => {
    describe('depart-after filter', () => {
      it('should filter trains departing after specified time', () => {
        const result = filterByTimeRange(mockTrains, { departAfter: '09:00' });
        expect(result.every((t) => t.departure >= '09:00')).toBe(true);
        expect(result.length).toBe(6); // 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
      });

      it('should include trains departing exactly at specified time', () => {
        const result = filterByTimeRange(mockTrains, { departAfter: '09:00' });
        expect(result.some((t) => t.departure === '09:00')).toBe(true);
      });

      it('should return all trains when no filter specified', () => {
        const result = filterByTimeRange(mockTrains, {});
        expect(result.length).toBe(mockTrains.length);
      });
    });

    describe('depart-before filter', () => {
      it('should filter trains departing before specified time', () => {
        const result = filterByTimeRange(mockTrains, { departBefore: '10:00' });
        expect(result.every((t) => t.departure <= '10:00')).toBe(true);
        expect(result.length).toBe(5); // 08:00, 08:30, 09:00, 09:30, 10:00
      });

      it('should include trains departing exactly at specified time', () => {
        const result = filterByTimeRange(mockTrains, { departBefore: '10:00' });
        expect(result.some((t) => t.departure === '10:00')).toBe(true);
      });
    });

    describe('arrive-by filter', () => {
      it('should filter trains arriving by specified time', () => {
        const result = filterByTimeRange(mockTrains, { arriveBy: '13:00' });
        expect(result.every((t) => t.arrival <= '13:00')).toBe(true);
        expect(result.length).toBe(4); // 12:00, 11:30, 11:45, 13:00
      });

      it('should include trains arriving exactly at specified time', () => {
        const result = filterByTimeRange(mockTrains, { arriveBy: '12:00' });
        expect(result.some((t) => t.arrival === '12:00')).toBe(true);
      });
    });

    describe('combined time filters', () => {
      it('should apply multiple time filters with AND logic', () => {
        const result = filterByTimeRange(mockTrains, {
          departAfter: '09:00',
          departBefore: '11:00',
        });
        expect(result.every((t) => t.departure >= '09:00' && t.departure <= '11:00')).toBe(true);
        expect(result.length).toBe(5); // 09:00, 09:30, 10:00, 10:30, 11:00
      });

      it('should filter by departure and arrival together', () => {
        const result = filterByTimeRange(mockTrains, {
          departAfter: '08:00',
          arriveBy: '12:00',
        });
        // Must depart >= 08:00 AND arrive <= 12:00
        expect(result.length).toBe(3); // 101 (08:00-12:00), 103 (09:00-11:30), 104 (09:30-11:45)
      });
    });

    describe('edge cases', () => {
      it('should handle empty train list', () => {
        const result = filterByTimeRange([], { departAfter: '09:00' });
        expect(result).toEqual([]);
      });

      it('should return empty when no trains match', () => {
        const result = filterByTimeRange(mockTrains, { departAfter: '23:00' });
        expect(result).toEqual([]);
      });
    });
  });

  // ============================================================
  // Train Type Filtering
  // ============================================================
  describe('filterByTrainType', () => {
    describe('include types', () => {
      it('should filter by Chinese train type name', () => {
        const result = filterByTrainType(mockTrains, { includeTypes: ['自強'] });
        // Should match all 自強 variants: 101, 107, 108
        expect(result.length).toBe(3);
        expect(result.map((t) => t.trainNo)).toContain('101');
        expect(result.map((t) => t.trainNo)).toContain('107');
        expect(result.map((t) => t.trainNo)).toContain('108');
      });

      it('should filter by multiple train types', () => {
        const result = filterByTrainType(mockTrains, { includeTypes: ['自強', '莒光'] });
        // 自強 matches 101, 107, 108; 莒光 matches 105
        expect(result.length).toBe(4);
        expect(result.map((t) => t.trainNo)).toContain('101');
        expect(result.map((t) => t.trainNo)).toContain('105');
        expect(result.map((t) => t.trainNo)).toContain('107');
        expect(result.map((t) => t.trainNo)).toContain('108');
      });

      it('should filter by train type code', () => {
        const result = filterByTrainType(mockTrains, { includeTypes: ['4'] });
        // Code '4' matches trainTypeCode='4': trains 101 and 108
        expect(result.length).toBe(2);
        expect(result.map((t) => t.trainNo)).toContain('101');
        expect(result.map((t) => t.trainNo)).toContain('108');
      });

      it('should filter by English alias (tc = 自強)', () => {
        const result = filterByTrainType(mockTrains, { includeTypes: ['tc'] });
        // 'tc' normalizes to 自強, which matches 101, 107, 108
        expect(result.length).toBe(3);
        expect(result.every((t) => t.trainType.includes('自強'))).toBe(true);
      });

      it('should filter by English alias (local = 區間)', () => {
        const result = filterByTrainType(mockTrains, { includeTypes: ['local'] });
        // 'local' normalizes to 區間, should only match 區間 (102), not 區間快 (106)
        expect(result.length).toBe(1);
        expect(result[0].trainNo).toBe('102');
      });

      it('should be case insensitive for aliases', () => {
        const result = filterByTrainType(mockTrains, { includeTypes: ['TC', 'CK'] });
        // TC = 自強 (101, 107, 108), CK = 莒光 (105)
        expect(result.length).toBe(4);
      });

      it('should support wildcard for train type family (自強*)', () => {
        const result = filterByTrainType(mockTrains, { includeTypes: ['自強*'] });
        // Should match all train types containing 自強
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.some((t) => t.trainType.includes('自強'))).toBe(true);
      });
    });

    describe('exclude types', () => {
      it('should exclude specified train types', () => {
        const result = filterByTrainType(mockTrains, { excludeTypes: ['普悠瑪', '太魯閣'] });
        expect(result.every((t) => t.trainType !== '普悠瑪' && t.trainType !== '太魯閣')).toBe(true);
        expect(result.length).toBe(6);
      });

      it('should exclude by train type code', () => {
        const result = filterByTrainType(mockTrains, { excludeTypes: ['1', '2'] });
        expect(result.every((t) => t.trainTypeCode !== '1' && t.trainTypeCode !== '2')).toBe(true);
      });

      it('should exclude by English alias', () => {
        const result = filterByTrainType(mockTrains, { excludeTypes: ['puyuma', 'taroko'] });
        expect(result.every((t) => t.trainType !== '普悠瑪' && t.trainType !== '太魯閣')).toBe(true);
      });
    });

    describe('TPASS filter', () => {
      it('should filter only TPASS eligible train types', () => {
        const result = filterByTrainType(mockTrains, { tpassOnly: true });
        // TPASS eligible: 自強, 莒光, 復興, 區間快, 區間
        // Excluded: 普悠瑪, 太魯閣, 新自強3000 (EMU3000)
        expect(result.every((t) =>
          !['普悠瑪', '太魯閣', '新自強3000'].some((ex) => t.trainType.includes(ex))
        )).toBe(true);
      });
    });

    describe('combined include and exclude', () => {
      it('should apply exclude after include', () => {
        const result = filterByTrainType(mockTrains, {
          includeTypes: ['自強*'],
          excludeTypes: ['普悠瑪'],
        });
        expect(result.every((t) => t.trainType !== '普悠瑪')).toBe(true);
      });
    });
  });

  // ============================================================
  // Service Flags Filtering
  // ============================================================
  describe('filterByServices', () => {
    describe('bike filter', () => {
      it('should filter trains with bike service', () => {
        const result = filterByServices(mockTrains, { bikeOnly: true });
        expect(result.every((t) => t.bikeFlag === 1)).toBe(true);
        expect(result.length).toBe(4); // 102, 105, 106, 108
      });
    });

    describe('wheelchair filter', () => {
      it('should filter trains with wheelchair service', () => {
        const result = filterByServices(mockTrains, { wheelchairOnly: true });
        expect(result.every((t) => t.wheelChairFlag === 1)).toBe(true);
        expect(result.length).toBe(6); // 101, 102, 104, 105, 107, 108
      });
    });

    describe('combined service filters', () => {
      it('should apply multiple service filters with AND logic', () => {
        const result = filterByServices(mockTrains, {
          bikeOnly: true,
          wheelchairOnly: true,
        });
        expect(result.every((t) => t.bikeFlag === 1 && t.wheelChairFlag === 1)).toBe(true);
        expect(result.length).toBe(3); // 102, 105, 108
      });
    });
  });

  // ============================================================
  // Sorting
  // ============================================================
  describe('sortTrains', () => {
    describe('sort by departure', () => {
      it('should sort by departure time ascending (default)', () => {
        const shuffled = [...mockTrains].reverse();
        const result = sortTrains(shuffled, 'departure');
        expect(result[0].departure).toBe('08:00');
        expect(result[result.length - 1].departure).toBe('11:30');
      });
    });

    describe('sort by arrival', () => {
      it('should sort by arrival time ascending', () => {
        const result = sortTrains(mockTrains, 'arrival');
        expect(result[0].arrival).toBe('11:30'); // 普悠瑪 arrives first
        expect(result[result.length - 1].arrival).toBe('16:00'); // 復興 arrives last
      });
    });

    describe('sort by duration', () => {
      it('should sort by travel duration ascending (fastest first)', () => {
        const result = sortTrains(mockTrains, 'duration');
        // Duration is arrival - departure in minutes
        // 107: 11:00 -> 13:00 = 2h (fastest)
        // 103: 09:00 -> 11:30 = 2.5h
        expect(result[0].trainNo).toBe('107'); // 2 hours duration
      });
    });

    describe('sort by fare', () => {
      it('should sort by fare ranking (cheapest first)', () => {
        const result = sortTrains(mockTrains, 'fare');
        // Fare ranking: 區間 < 區間快 < 復興 < 莒光 < 自強 < 普悠瑪/太魯閣/EMU3000
        expect(result[0].trainType.includes('區間')).toBe(true);
        // Most expensive should be at the end (普悠瑪, 太魯閣, or EMU3000)
        const lastTrainType = result[result.length - 1].trainType;
        expect(['普悠瑪', '太魯閣', 'EMU3000', '3000'].some((t) => lastTrainType.includes(t))).toBe(true);
      });
    });
  });

  // ============================================================
  // Helper Functions
  // ============================================================
  describe('parseTrainTypeInput', () => {
    it('should parse comma-separated types', () => {
      const result = parseTrainTypeInput('自強,莒光,區間');
      expect(result).toEqual(['自強', '莒光', '區間']);
    });

    it('should trim whitespace', () => {
      const result = parseTrainTypeInput('自強 , 莒光 , 區間');
      expect(result).toEqual(['自強', '莒光', '區間']);
    });

    it('should handle single type', () => {
      const result = parseTrainTypeInput('自強');
      expect(result).toEqual(['自強']);
    });

    it('should handle empty string', () => {
      const result = parseTrainTypeInput('');
      expect(result).toEqual([]);
    });
  });

  describe('normalizeTrainType', () => {
    it('should normalize Chinese name to code', () => {
      expect(normalizeTrainType('自強')).toEqual({ code: '4', name: '自強' });
      expect(normalizeTrainType('區間')).toEqual({ code: '8', name: '區間' });
    });

    it('should normalize English alias to code', () => {
      expect(normalizeTrainType('tc')).toEqual({ code: '4', name: '自強' });
      expect(normalizeTrainType('local')).toEqual({ code: '8', name: '區間' });
      expect(normalizeTrainType('puyuma')).toEqual({ code: '2', name: '普悠瑪' });
    });

    it('should handle numeric code', () => {
      expect(normalizeTrainType('4')).toEqual({ code: '4', name: '自強', matchByCode: true });
    });

    it('should be case insensitive', () => {
      expect(normalizeTrainType('TC')).toEqual({ code: '4', name: '自強' });
      expect(normalizeTrainType('PUYUMA')).toEqual({ code: '2', name: '普悠瑪' });
    });

    it('should return null for unknown type', () => {
      expect(normalizeTrainType('unknown')).toBeNull();
    });
  });

  describe('getTrainTypeFareRank', () => {
    it('should return correct fare ranking', () => {
      // Lower rank = cheaper
      expect(getTrainTypeFareRank('區間')).toBeLessThan(getTrainTypeFareRank('區間快'));
      expect(getTrainTypeFareRank('區間快')).toBeLessThan(getTrainTypeFareRank('復興'));
      expect(getTrainTypeFareRank('復興')).toBeLessThan(getTrainTypeFareRank('莒光'));
      expect(getTrainTypeFareRank('莒光')).toBeLessThan(getTrainTypeFareRank('自強'));
      expect(getTrainTypeFareRank('自強')).toBeLessThan(getTrainTypeFareRank('普悠瑪'));
      expect(getTrainTypeFareRank('普悠瑪')).toBe(getTrainTypeFareRank('太魯閣'));
    });

    it('should handle EMU3000 variants', () => {
      expect(getTrainTypeFareRank('新自強3000')).toBe(getTrainTypeFareRank('EMU3000'));
    });
  });
});
