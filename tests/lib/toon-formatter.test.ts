import { describe, it, expect } from 'vitest';
import { toToon, countTokens, measureTokenSavings } from '../../src/lib/toon-formatter.js';

describe('TOON Formatter', () => {
  describe('toToon - primitives', () => {
    it('should format simple object', () => {
      const data = { id: 123, name: 'Ada', active: true };
      const result = toToon(data);
      expect(result).toBe('id: 123\nname: Ada\nactive: true');
    });

    it('should format null and undefined', () => {
      const data = { value: null, missing: undefined };
      const result = toToon(data);
      expect(result).toBe('value: null');
    });

    it('should format numbers correctly (no exponent, no trailing zeros)', () => {
      const data = { price: 100.50, count: 42, zero: 0 };
      const result = toToon(data);
      expect(result).toBe('price: 100.5\ncount: 42\nzero: 0');
    });

    it('should handle -0 as 0', () => {
      const data = { value: -0 };
      const result = toToon(data);
      expect(result).toBe('value: 0');
    });
  });

  describe('toToon - strings with escaping', () => {
    it('should escape special characters', () => {
      const data = { text: 'line1\nline2', path: 'C:\\folder' };
      const result = toToon(data);
      expect(result).toContain('text: "line1\\nline2"');
      expect(result).toContain('path: "C:\\\\folder"');
    });

    it('should escape double quotes', () => {
      const data = { quote: 'He said "hello"' };
      const result = toToon(data);
      expect(result).toBe('quote: "He said \\"hello\\""');
    });

    it('should not quote simple strings', () => {
      const data = { name: 'Alice' };
      const result = toToon(data);
      expect(result).toBe('name: Alice');
    });

    it('should quote strings with commas', () => {
      const data = { list: 'a,b,c' };
      const result = toToon(data);
      expect(result).toBe('list: "a,b,c"');
    });
  });

  describe('toToon - nested objects', () => {
    it('should format nested object with indentation', () => {
      const data = {
        user: {
          id: 123,
          name: 'Ada',
        },
      };
      const result = toToon(data);
      expect(result).toBe('user:\n  id: 123\n  name: Ada');
    });

    it('should format deeply nested objects', () => {
      const data = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };
      const result = toToon(data);
      expect(result).toBe('level1:\n  level2:\n    value: deep');
    });
  });

  describe('toToon - primitive arrays (inline)', () => {
    it('should format simple array inline', () => {
      const data = { tags: ['admin', 'ops', 'dev'] };
      const result = toToon(data);
      expect(result).toBe('tags[3]: admin,ops,dev');
    });

    it('should format number array', () => {
      const data = { scores: [90, 85, 92] };
      const result = toToon(data);
      expect(result).toBe('scores[3]: 90,85,92');
    });

    it('should format empty array', () => {
      const data = { items: [] };
      const result = toToon(data);
      expect(result).toBe('items[0]:');
    });
  });

  describe('toToon - tabular arrays (uniform objects)', () => {
    it('should format uniform object array as tabular', () => {
      const data = {
        users: [
          { id: 1, name: 'Alice', role: 'admin' },
          { id: 2, name: 'Bob', role: 'user' },
        ],
      };
      const result = toToon(data);
      expect(result).toBe('users[2]{id,name,role}:\n  1,Alice,admin\n  2,Bob,user');
    });

    it('should handle single item array', () => {
      const data = {
        items: [{ id: 1, name: 'First' }],
      };
      const result = toToon(data);
      expect(result).toBe('items[1]{id,name}:\n  1,First');
    });

    it('should escape values with commas in tabular format', () => {
      const data = {
        rows: [
          { name: 'Alice, Bob', value: 100 },
        ],
      };
      const result = toToon(data);
      expect(result).toBe('rows[1]{name,value}:\n  "Alice, Bob",100');
    });
  });

  describe('toToon - train timetable (real use case)', () => {
    it('should format TRA timetable data', () => {
      const data = {
        origin: '台北',
        destination: '高雄',
        date: '2025-01-15',
        trains: [
          { trainNo: '123', departure: '08:00', arrival: '12:30', trainType: '自強' },
          { trainNo: '125', departure: '08:30', arrival: '13:00', trainType: '自強' },
        ],
      };
      const result = toToon(data);
      expect(result).toContain('origin: 台北');
      expect(result).toContain('destination: 高雄');
      expect(result).toContain('trains[2]{trainNo,departure,arrival,trainType}:');
      expect(result).toContain('123,08:00,12:30,自強');
    });

    it('should format station list', () => {
      const data = {
        stations: [
          { id: '1000', name: '台北', nameEn: 'Taipei' },
          { id: '1020', name: '板橋', nameEn: 'Banqiao' },
          { id: '1030', name: '桃園', nameEn: 'Taoyuan' },
        ],
      };
      const result = toToon(data);
      expect(result).toBe(
        'stations[3]{id,name,nameEn}:\n  1000,台北,Taipei\n  1020,板橋,Banqiao\n  1030,桃園,Taoyuan'
      );
    });
  });

  describe('toToon - root array', () => {
    it('should format root primitive array', () => {
      const data = ['apple', 'banana', 'cherry'];
      const result = toToon(data);
      expect(result).toBe('[3]: apple,banana,cherry');
    });

    it('should format root object array as tabular', () => {
      const data = [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' },
      ];
      const result = toToon(data);
      expect(result).toBe('[2]{id,name}:\n  1,First\n  2,Second');
    });
  });

  describe('countTokens', () => {
    it('should estimate token count', () => {
      const text = 'Hello world! This is a test.';
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(20);
    });

    it('should handle Chinese characters', () => {
      const text = '台北到高雄的火車時刻表';
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle empty string', () => {
      expect(countTokens('')).toBe(0);
    });
  });

  describe('measureTokenSavings', () => {
    it('should measure token savings for timetable data', () => {
      const data = {
        trains: [
          { trainNo: '123', departure: '08:00', arrival: '12:30', type: '自強' },
          { trainNo: '125', departure: '08:30', arrival: '13:00', type: '自強' },
          { trainNo: '127', departure: '09:00', arrival: '13:30', type: '莒光' },
        ],
      };

      const result = measureTokenSavings(data);

      expect(result.jsonTokens).toBeGreaterThan(0);
      expect(result.toonTokens).toBeGreaterThan(0);
      expect(result.savedTokens).toBeGreaterThan(0);
      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(result.savingsPercent).toBeLessThan(100);
    });

    it('should show significant savings for larger datasets', () => {
      const data = {
        stations: Array.from({ length: 10 }, (_, i) => ({
          id: `${1000 + i * 10}`,
          name: `車站${i + 1}`,
          nameEn: `Station${i + 1}`,
        })),
      };

      const result = measureTokenSavings(data);

      // TOON should save at least 20% tokens
      expect(result.savingsPercent).toBeGreaterThan(20);
    });

    it('should show 30%+ savings for realistic TRA timetable response', () => {
      // Simulate a real API response with 20 trains
      const data = {
        success: true,
        query: {
          from: { id: '1000', name: '臺北', nameEn: 'Taipei' },
          to: { id: '4400', name: '高雄', nameEn: 'Kaohsiung' },
          date: '2025-01-15',
          filters: {
            departAfter: '08:00',
            departBefore: null,
            arriveBy: null,
            type: null,
            tpass: false,
          },
        },
        count: 20,
        timetables: Array.from({ length: 20 }, (_, i) => ({
          trainNo: `${100 + i}`,
          trainType: i % 3 === 0 ? '自強' : i % 3 === 1 ? '莒光' : '區間',
          departure: `${8 + Math.floor(i / 2)}:${(i % 2) * 30}`.padStart(5, '0'),
          arrival: `${12 + Math.floor(i / 2)}:${(i % 2) * 30}`.padStart(5, '0'),
          duration: 240 + i * 5,
          tpassEligible: i % 3 !== 2,
          stopCount: 5 + (i % 8),
        })),
      };

      const result = measureTokenSavings(data);

      // For realistic data, TOON should save 30%+ tokens
      expect(result.savingsPercent).toBeGreaterThan(30);

      // Log the actual savings for visibility
      console.log(`\n📊 Token Savings Report:`);
      console.log(`   JSON: ${result.jsonTokens} tokens`);
      console.log(`   TOON: ${result.toonTokens} tokens`);
      console.log(`   Saved: ${result.savedTokens} tokens (${result.savingsPercent}%)`);
    });
  });

  describe('toToon - mixed nested and tabular', () => {
    it('should handle complex structure', () => {
      const data = {
        meta: {
          version: '1.0',
          cached: true,
        },
        results: [
          { id: 1, value: 'A' },
          { id: 2, value: 'B' },
        ],
      };
      const result = toToon(data);
      expect(result).toContain('meta:\n  version: 1.0\n  cached: true');
      expect(result).toContain('results[2]{id,value}:\n  1,A\n  2,B');
    });
  });
});
