import { describe, it, expect } from 'vitest';
import {
  formatOutput,
  outputData,
  isValidFormat,
  type OutputFormat,
} from '../../src/lib/output-formatter.js';

describe('Output Formatter', () => {
  describe('isValidFormat', () => {
    it('should accept valid formats', () => {
      expect(isValidFormat('json')).toBe(true);
      expect(isValidFormat('table')).toBe(true);
      expect(isValidFormat('toon')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidFormat('csv')).toBe(false);
      expect(isValidFormat('xml')).toBe(false);
      expect(isValidFormat('')).toBe(false);
    });
  });

  describe('formatOutput', () => {
    const sampleData = {
      success: true,
      trains: [
        { trainNo: '123', departure: '08:00', arrival: '12:30' },
        { trainNo: '125', departure: '08:30', arrival: '13:00' },
      ],
    };

    it('should format as JSON by default', () => {
      const result = formatOutput(sampleData);
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.trains).toHaveLength(2);
    });

    it('should format as JSON when specified', () => {
      const result = formatOutput(sampleData, 'json');
      expect(result).toContain('"success": true');
      expect(result).toContain('"trainNo": "123"');
    });

    it('should format as TOON when specified', () => {
      const result = formatOutput(sampleData, 'toon');
      expect(result).toContain('success: true');
      expect(result).toContain('trains[2]{trainNo,departure,arrival}:');
      expect(result).toContain('123,08:00,12:30');
    });

    it('should produce smaller output with TOON', () => {
      const jsonOutput = formatOutput(sampleData, 'json');
      const toonOutput = formatOutput(sampleData, 'toon');
      expect(toonOutput.length).toBeLessThan(jsonOutput.length);
    });
  });

  describe('TRA timetable real data format', () => {
    const timetableData = {
      success: true,
      query: {
        from: { id: '1000', name: '臺北' },
        to: { id: '4400', name: '高雄' },
        date: '2025-01-15',
      },
      count: 3,
      timetables: [
        {
          trainNo: '123',
          trainType: '自強',
          departure: '08:00',
          arrival: '12:30',
          duration: 270,
          tpassEligible: true,
        },
        {
          trainNo: '125',
          trainType: '自強',
          departure: '08:30',
          arrival: '13:00',
          duration: 270,
          tpassEligible: true,
        },
        {
          trainNo: '127',
          trainType: '莒光',
          departure: '09:00',
          arrival: '14:30',
          duration: 330,
          tpassEligible: false,
        },
      ],
    };

    it('should format timetable as TOON', () => {
      const result = formatOutput(timetableData, 'toon');
      expect(result).toContain('success: true');
      expect(result).toContain('query:');
      expect(result).toContain('from:');
      expect(result).toContain('id: 1000');
      expect(result).toContain('name: 臺北');
      expect(result).toContain('count: 3');
      expect(result).toContain('timetables[3]{trainNo,trainType,departure,arrival,duration,tpassEligible}:');
    });

    it('should produce significantly smaller TOON output', () => {
      const jsonOutput = formatOutput(timetableData, 'json');
      const toonOutput = formatOutput(timetableData, 'toon');

      // TOON should be at least 30% smaller
      const savingsPercent = ((jsonOutput.length - toonOutput.length) / jsonOutput.length) * 100;
      expect(savingsPercent).toBeGreaterThan(30);
    });
  });

  describe('outputData', () => {
    it('should handle toon format correctly', () => {
      const data = { test: 'value' };
      // This test is more for coverage - outputData logs to console
      expect(() => {
        // Mock console.log during test
        const originalLog = console.log;
        console.log = () => {};
        outputData(data, 'toon');
        console.log = originalLog;
      }).not.toThrow();
    });
  });
});
