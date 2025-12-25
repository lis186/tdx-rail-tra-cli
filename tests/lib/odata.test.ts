import { describe, it, expect } from 'vitest';
import {
  buildEqualsFilter,
  buildNotEqualsFilter,
  buildInFilter,
  buildComparisonFilter,
  buildDateFilter,
  buildContainsFilter,
  buildStartsWithFilter,
  buildEndsWithFilter,
  combineFiltersAnd,
  combineFiltersOr,
  buildSelectString,
  buildOrderByString,
  buildODataQuery,
  buildTrainNoFilter,
  buildStationFilter,
  buildTrainDateFilter,
} from '../../src/lib/odata.js';

describe('OData Builder', () => {
  describe('buildEqualsFilter', () => {
    it('should build string equals filter', () => {
      expect(buildEqualsFilter('TrainNo', '123')).toBe("TrainNo eq '123'");
    });

    it('should build number equals filter', () => {
      expect(buildEqualsFilter('DelayTime', 5)).toBe('DelayTime eq 5');
    });
  });

  describe('buildNotEqualsFilter', () => {
    it('should build string not equals filter', () => {
      expect(buildNotEqualsFilter('Status', 'Cancelled')).toBe("Status ne 'Cancelled'");
    });

    it('should build number not equals filter', () => {
      expect(buildNotEqualsFilter('DelayTime', 0)).toBe('DelayTime ne 0');
    });
  });

  describe('buildInFilter', () => {
    it('should return empty string for empty array', () => {
      expect(buildInFilter('TrainNo', [])).toBe('');
    });

    it('should build single value filter', () => {
      expect(buildInFilter('TrainNo', ['123'])).toBe("TrainNo eq '123'");
    });

    it('should build multiple values filter with OR', () => {
      expect(buildInFilter('TrainNo', ['123', '456', '789'])).toBe(
        "TrainNo eq '123' or TrainNo eq '456' or TrainNo eq '789'"
      );
    });

    it('should handle number values', () => {
      expect(buildInFilter('Type', [1, 2, 3])).toBe(
        'Type eq 1 or Type eq 2 or Type eq 3'
      );
    });
  });

  describe('buildComparisonFilter', () => {
    it('should build greater than filter', () => {
      expect(buildComparisonFilter('DelayTime', 'gt', 5)).toBe('DelayTime gt 5');
    });

    it('should build greater than or equal filter', () => {
      expect(buildComparisonFilter('DelayTime', 'ge', 0)).toBe('DelayTime ge 0');
    });

    it('should build less than filter', () => {
      expect(buildComparisonFilter('DelayTime', 'lt', 10)).toBe('DelayTime lt 10');
    });

    it('should build less than or equal filter', () => {
      expect(buildComparisonFilter('Price', 'le', 1000)).toBe('Price le 1000');
    });
  });

  describe('buildDateFilter', () => {
    it('should build date equals filter', () => {
      expect(buildDateFilter('TrainDate', 'eq', '2025-01-15')).toBe(
        'TrainDate eq 2025-01-15'
      );
    });

    it('should build date greater than filter', () => {
      expect(buildDateFilter('TrainDate', 'gt', '2025-01-01')).toBe(
        'TrainDate gt 2025-01-01'
      );
    });
  });

  describe('buildContainsFilter', () => {
    it('should build contains filter', () => {
      expect(buildContainsFilter('StationName', '台')).toBe(
        "contains(StationName, '台')"
      );
    });
  });

  describe('buildStartsWithFilter', () => {
    it('should build startswith filter', () => {
      expect(buildStartsWithFilter('TrainNo', '1')).toBe("startswith(TrainNo, '1')");
    });
  });

  describe('buildEndsWithFilter', () => {
    it('should build endswith filter', () => {
      expect(buildEndsWithFilter('StationID', '00')).toBe("endswith(StationID, '00')");
    });
  });

  describe('combineFiltersAnd', () => {
    it('should return empty string for empty array', () => {
      expect(combineFiltersAnd([])).toBe('');
    });

    it('should return single filter as-is', () => {
      expect(combineFiltersAnd(["TrainNo eq '123'"])).toBe("TrainNo eq '123'");
    });

    it('should combine multiple filters with AND', () => {
      expect(
        combineFiltersAnd(["TrainNo eq '123'", 'DelayTime gt 0'])
      ).toBe("(TrainNo eq '123') and (DelayTime gt 0)");
    });

    it('should skip empty filters', () => {
      expect(
        combineFiltersAnd(["TrainNo eq '123'", '', 'DelayTime gt 0'])
      ).toBe("(TrainNo eq '123') and (DelayTime gt 0)");
    });
  });

  describe('combineFiltersOr', () => {
    it('should return empty string for empty array', () => {
      expect(combineFiltersOr([])).toBe('');
    });

    it('should return single filter as-is', () => {
      expect(combineFiltersOr(["TrainNo eq '123'"])).toBe("TrainNo eq '123'");
    });

    it('should combine multiple filters with OR', () => {
      expect(
        combineFiltersOr(["TrainNo eq '123'", "TrainNo eq '456'"])
      ).toBe("(TrainNo eq '123') or (TrainNo eq '456')");
    });
  });

  describe('buildSelectString', () => {
    it('should join fields with comma', () => {
      expect(buildSelectString(['TrainNo', 'TrainTypeName', 'DelayTime'])).toBe(
        'TrainNo,TrainTypeName,DelayTime'
      );
    });

    it('should handle single field', () => {
      expect(buildSelectString(['TrainNo'])).toBe('TrainNo');
    });
  });

  describe('buildOrderByString', () => {
    it('should build ascending order', () => {
      expect(buildOrderByString([{ field: 'Time' }])).toBe('Time');
    });

    it('should build descending order', () => {
      expect(buildOrderByString([{ field: 'DelayTime', desc: true }])).toBe(
        'DelayTime desc'
      );
    });

    it('should build multiple orders', () => {
      expect(
        buildOrderByString([
          { field: 'Date' },
          { field: 'Time' },
          { field: 'DelayTime', desc: true },
        ])
      ).toBe('Date,Time,DelayTime desc');
    });
  });

  describe('buildODataQuery', () => {
    it('should build query with all options', () => {
      const query = buildODataQuery({
        filter: "TrainNo eq '123'",
        select: ['TrainNo', 'TrainTypeName'],
        orderby: ['Time'],
        top: 10,
        skip: 5,
        format: 'JSON',
      });

      expect(query).toEqual({
        $filter: "TrainNo eq '123'",
        $select: 'TrainNo,TrainTypeName',
        $orderby: 'Time',
        $top: '10',
        $skip: '5',
        $format: 'JSON',
      });
    });

    it('should only include provided options', () => {
      const query = buildODataQuery({
        filter: "TrainNo eq '123'",
      });

      expect(query).toEqual({
        $filter: "TrainNo eq '123'",
        $format: 'JSON',
      });
    });

    it('should default format to JSON', () => {
      const query = buildODataQuery({});
      expect(query.$format).toBe('JSON');
    });

    it('should skip top/skip when 0', () => {
      const query = buildODataQuery({
        top: 0,
        skip: 0,
      });

      expect(query.$top).toBeUndefined();
      expect(query.$skip).toBeUndefined();
    });
  });

  describe('TDX TRA specific builders', () => {
    describe('buildTrainNoFilter', () => {
      it('should build train number filter', () => {
        expect(buildTrainNoFilter(['123', '456'])).toBe(
          "TrainNo eq '123' or TrainNo eq '456'"
        );
      });
    });

    describe('buildStationFilter', () => {
      it('should build station ID filter', () => {
        expect(buildStationFilter(['1000', '4400'])).toBe(
          "StationID eq '1000' or StationID eq '4400'"
        );
      });
    });

    describe('buildTrainDateFilter', () => {
      it('should build train date filter', () => {
        expect(buildTrainDateFilter('2025-01-15')).toBe('TrainDate eq 2025-01-15');
      });
    });
  });
});
