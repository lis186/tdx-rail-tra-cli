import { describe, it, expect } from 'vitest';
import {
  getDisplayWidth,
  padString,
  truncateString,
  formatTable,
  formatCSV,
  formatJSON,
  output,
  type ColumnDef,
} from '../../src/utils/output.js';

describe('Output Formatter', () => {
  describe('getDisplayWidth', () => {
    it('should return correct width for ASCII', () => {
      expect(getDisplayWidth('hello')).toBe(5);
    });

    it('should return double width for CJK characters', () => {
      expect(getDisplayWidth('臺北')).toBe(4);
    });

    it('should handle mixed characters', () => {
      expect(getDisplayWidth('台北Taipei')).toBe(10);
    });

    it('should return 0 for empty string', () => {
      expect(getDisplayWidth('')).toBe(0);
    });
  });

  describe('padString', () => {
    it('should pad left by default', () => {
      expect(padString('hi', 5)).toBe('hi   ');
    });

    it('should pad right', () => {
      expect(padString('hi', 5, 'right')).toBe('   hi');
    });

    it('should pad center', () => {
      expect(padString('hi', 5, 'center')).toBe(' hi  ');
    });

    it('should handle CJK padding', () => {
      expect(padString('臺北', 6)).toBe('臺北  ');
    });

    it('should not pad if already at width', () => {
      expect(padString('hello', 5)).toBe('hello');
    });

    it('should not pad if exceeds width', () => {
      expect(padString('hello world', 5)).toBe('hello world');
    });
  });

  describe('truncateString', () => {
    it('should not truncate if within width', () => {
      expect(truncateString('hello', 10)).toBe('hello');
    });

    it('should truncate and add ellipsis', () => {
      expect(truncateString('hello world', 8)).toBe('hello w…');
    });

    it('should handle CJK truncation', () => {
      expect(truncateString('臺北車站', 5)).toBe('臺北…');
    });

    it('should return original if exact width', () => {
      expect(truncateString('hello', 5)).toBe('hello');
    });
  });

  describe('formatTable', () => {
    interface TestRow {
      name: string;
      value: number;
    }

    const columns: ColumnDef<TestRow>[] = [
      { key: 'name', label: '名稱', width: 10 },
      { key: 'value', label: '數值', width: 8, align: 'right' },
    ];

    const data: TestRow[] = [
      { name: '測試一', value: 100 },
      { name: '測試二', value: 200 },
    ];

    it('should format table with borders', () => {
      const result = formatTable(data, columns, { showBorder: true });
      expect(result).toContain('┌');
      expect(result).toContain('┐');
      expect(result).toContain('└');
      expect(result).toContain('┘');
      expect(result).toContain('│');
    });

    it('should format table without borders', () => {
      const result = formatTable(data, columns, { showBorder: false });
      expect(result).not.toContain('┌');
      expect(result).not.toContain('│');
    });

    it('should show header by default', () => {
      const result = formatTable(data, columns);
      expect(result).toContain('名稱');
      expect(result).toContain('數值');
    });

    it('should hide header when disabled', () => {
      const result = formatTable(data, columns, { showHeader: false });
      expect(result.split('\n')[0]).toContain('測試一');
    });

    it('should return empty string for empty data', () => {
      const result = formatTable([], columns);
      expect(result).toBe('');
    });

    it('should apply custom format function', () => {
      const columnsWithFormat: ColumnDef<TestRow>[] = [
        { key: 'name', label: '名稱' },
        {
          key: 'value',
          label: '數值',
          format: (v) => `$${v}`
        },
      ];
      const result = formatTable(data, columnsWithFormat, { showBorder: false });
      expect(result).toContain('$100');
      expect(result).toContain('$200');
    });
  });

  describe('formatCSV', () => {
    interface TestRow {
      name: string;
      value: number;
    }

    const columns: ColumnDef<TestRow>[] = [
      { key: 'name', label: '名稱' },
      { key: 'value', label: '數值' },
    ];

    const data: TestRow[] = [
      { name: '測試一', value: 100 },
      { name: '測試二', value: 200 },
    ];

    it('should format CSV with header', () => {
      const result = formatCSV(data, columns);
      const lines = result.split('\n');
      expect(lines[0]).toBe('名稱,數值');
    });

    it('should format CSV data rows', () => {
      const result = formatCSV(data, columns);
      const lines = result.split('\n');
      expect(lines[1]).toBe('測試一,100');
      expect(lines[2]).toBe('測試二,200');
    });

    it('should escape values with commas', () => {
      const dataWithComma: TestRow[] = [
        { name: 'hello, world', value: 100 },
      ];
      const result = formatCSV(dataWithComma, columns);
      expect(result).toContain('"hello, world"');
    });

    it('should escape values with quotes', () => {
      const dataWithQuote: TestRow[] = [
        { name: 'say "hello"', value: 100 },
      ];
      const result = formatCSV(dataWithQuote, columns);
      expect(result).toContain('"say ""hello"""');
    });

    it('should return empty string for empty data', () => {
      const result = formatCSV([], columns);
      expect(result).toBe('');
    });
  });

  describe('formatJSON', () => {
    it('should format JSON with indentation', () => {
      const data = { name: '測試', value: 100 };
      const result = formatJSON(data, true);
      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });

    it('should format JSON without indentation', () => {
      const data = { name: '測試', value: 100 };
      const result = formatJSON(data, false);
      expect(result).not.toContain('\n');
    });

    it('should handle arrays', () => {
      const data = [{ a: 1 }, { a: 2 }];
      const result = formatJSON(data);
      expect(JSON.parse(result)).toEqual(data);
    });
  });

  describe('output', () => {
    interface TestRow {
      name: string;
      value: number;
    }

    const columns: ColumnDef<TestRow>[] = [
      { key: 'name', label: '名稱' },
      { key: 'value', label: '數值' },
    ];

    const data: TestRow[] = [
      { name: '測試', value: 100 },
    ];

    it('should output as JSON by default', () => {
      const result = output(data, columns);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should output as table', () => {
      const result = output(data, columns, 'table');
      expect(result).toContain('名稱');
    });

    it('should output as CSV', () => {
      const result = output(data, columns, 'csv');
      expect(result.split('\n')[0]).toBe('名稱,數值');
    });
  });

  describe('nested path access', () => {
    it('should access nested properties', () => {
      interface NestedRow {
        station: {
          name: string;
          id: string;
        };
        value: number;
      }

      const columns: ColumnDef<NestedRow>[] = [
        { key: 'station.name', label: '站名' },
        { key: 'value', label: '數值' },
      ];

      const data: NestedRow[] = [
        { station: { name: '臺北', id: '1000' }, value: 100 },
      ];

      const result = formatTable(data, columns, { showBorder: false });
      expect(result).toContain('臺北');
    });
  });
});
