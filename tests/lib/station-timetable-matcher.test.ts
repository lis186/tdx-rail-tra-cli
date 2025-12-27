/**
 * Station Timetable Matcher Tests
 * 車站時刻表比對器測試 (TDD)
 *
 * 用於支線行程規劃，透過比對起訖站時刻表找出共同車次
 */

import { describe, it, expect } from 'vitest';
import {
  StationTimetableMatcher,
  findMatchingTrains,
  validateTrainDirection,
  type MatchedTrain,
} from '../../src/lib/station-timetable-matcher.js';
import type { DailyStationTimetable } from '../../src/types/api.js';
import type { JourneySegment } from '../../src/lib/journey-planner.js';

// ============================================================
// Mock Data: 平溪線時刻表
// 模擬真實 API 回應結構
// ============================================================

// 三貂嶺站時刻表 (7330) - 平溪線起點/轉乘站
const mockSandiaolingTimetable: DailyStationTimetable[] = [
  {
    TrainDate: '2025-12-27',
    StationID: '7330',
    StationName: { Zh_tw: '三貂嶺', En: 'Sandiaoling' },
    Direction: 0, // 順行 (往菁桐)
    TimeTables: [
      {
        TrainNo: '4711',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '菁桐', En: 'Jingtong' },
        ArrivalTime: '08:35',
        DepartureTime: '08:36',
      },
      {
        TrainNo: '4713',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '菁桐', En: 'Jingtong' },
        ArrivalTime: '10:25',
        DepartureTime: '10:26',
      },
      {
        TrainNo: '4715',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '菁桐', En: 'Jingtong' },
        ArrivalTime: '12:35',
        DepartureTime: '12:36',
      },
    ],
  },
  {
    TrainDate: '2025-12-27',
    StationID: '7330',
    StationName: { Zh_tw: '三貂嶺', En: 'Sandiaoling' },
    Direction: 1, // 逆行 (往瑞芳)
    TimeTables: [
      {
        TrainNo: '4712',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '瑞芳', En: 'Ruifang' },
        ArrivalTime: '09:20',
        DepartureTime: '09:21',
      },
    ],
  },
];

// 十分站時刻表 (7332)
const mockShifenTimetable: DailyStationTimetable[] = [
  {
    TrainDate: '2025-12-27',
    StationID: '7332',
    StationName: { Zh_tw: '十分', En: 'Shifen' },
    Direction: 0, // 順行 (往菁桐)
    TimeTables: [
      {
        TrainNo: '4711',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '菁桐', En: 'Jingtong' },
        ArrivalTime: '08:52',
        DepartureTime: '08:53',
      },
      {
        TrainNo: '4713',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '菁桐', En: 'Jingtong' },
        ArrivalTime: '10:42',
        DepartureTime: '10:43',
      },
      {
        TrainNo: '4715',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '菁桐', En: 'Jingtong' },
        ArrivalTime: '12:52',
        DepartureTime: '12:53',
      },
    ],
  },
  {
    TrainDate: '2025-12-27',
    StationID: '7332',
    StationName: { Zh_tw: '十分', En: 'Shifen' },
    Direction: 1, // 逆行 (往三貂嶺)
    TimeTables: [
      {
        TrainNo: '4712',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '瑞芳', En: 'Ruifang' },
        ArrivalTime: '09:05',
        DepartureTime: '09:06',
      },
    ],
  },
];

// 菁桐站時刻表 (7336) - 平溪線終點
const mockJingtongTimetable: DailyStationTimetable[] = [
  {
    TrainDate: '2025-12-27',
    StationID: '7336',
    StationName: { Zh_tw: '菁桐', En: 'Jingtong' },
    Direction: 0,
    TimeTables: [
      {
        TrainNo: '4711',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '菁桐', En: 'Jingtong' },
        ArrivalTime: '09:02',
        // 終點站沒有 DepartureTime
      },
      {
        TrainNo: '4713',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
        EndingStationName: { Zh_tw: '菁桐', En: 'Jingtong' },
        ArrivalTime: '10:52',
      },
    ],
  },
];

// ============================================================
// findMatchingTrains Tests
// ============================================================
describe('findMatchingTrains', () => {
  it('should find trains that stop at both origin and destination', () => {
    const matches = findMatchingTrains(
      mockSandiaolingTimetable,
      mockShifenTimetable,
      '7330',
      '7332'
    );

    expect(matches.length).toBeGreaterThan(0);
    // 4711, 4713, 4715 都應該匹配（三貂嶺 → 十分）
    const trainNos = matches.map((m) => m.trainNo);
    expect(trainNos).toContain('4711');
    expect(trainNos).toContain('4713');
    expect(trainNos).toContain('4715');
  });

  it('should correctly extract departure and arrival times', () => {
    const matches = findMatchingTrains(
      mockSandiaolingTimetable,
      mockShifenTimetable,
      '7330',
      '7332'
    );

    const train4711 = matches.find((m) => m.trainNo === '4711');
    expect(train4711).toBeDefined();
    expect(train4711!.departure).toBe('08:36'); // 三貂嶺發車
    expect(train4711!.arrival).toBe('08:52'); // 十分到達
  });

  it('should filter out reverse direction trains', () => {
    // 查詢 十分 → 三貂嶺（逆向）
    const matches = findMatchingTrains(
      mockShifenTimetable,
      mockSandiaolingTimetable,
      '7332',
      '7330'
    );

    // 只有 4712 是從十分開往三貂嶺的
    const trainNos = matches.map((m) => m.trainNo);
    expect(trainNos).toContain('4712');
    // 4711, 4713, 4715 是反方向，不應該匹配
    expect(trainNos).not.toContain('4711');
  });

  it('should handle terminal station (no departure time)', () => {
    const matches = findMatchingTrains(
      mockSandiaolingTimetable,
      mockJingtongTimetable,
      '7330',
      '7336'
    );

    // 4711, 4713 應該匹配（三貂嶺 → 菁桐）
    expect(matches.length).toBe(2);
    const train4711 = matches.find((m) => m.trainNo === '4711');
    expect(train4711!.arrival).toBe('09:02');
  });

  it('should return empty array when no matching trains', () => {
    // 用空的時刻表
    const emptyTimetable: DailyStationTimetable[] = [];
    const matches = findMatchingTrains(
      emptyTimetable,
      mockShifenTimetable,
      '0000',
      '7332'
    );

    expect(matches).toEqual([]);
  });
});

// ============================================================
// validateTrainDirection Tests
// ============================================================
describe('validateTrainDirection', () => {
  it('should return true when departure is before arrival', () => {
    expect(validateTrainDirection('08:36', '08:52')).toBe(true);
    expect(validateTrainDirection('10:00', '14:30')).toBe(true);
  });

  it('should return false when departure is after arrival', () => {
    // 這表示列車是反方向行駛
    expect(validateTrainDirection('09:00', '08:30')).toBe(false);
  });

  it('should return false when times are equal', () => {
    expect(validateTrainDirection('08:00', '08:00')).toBe(false);
  });

  it('should handle overnight trains (departure late, arrival early)', () => {
    // 23:30 出發，00:30 到達（跨日）
    expect(validateTrainDirection('23:30', '00:30')).toBe(true);
  });

  it('should not treat daytime reverse as overnight', () => {
    // 10:00 "出發"，08:00 "到達" - 這是反方向，不是跨日
    expect(validateTrainDirection('10:00', '08:00')).toBe(false);
  });
});

// ============================================================
// StationTimetableMatcher Class Tests
// ============================================================
describe('StationTimetableMatcher', () => {
  describe('toJourneySegments', () => {
    it('should convert matched trains to JourneySegment format', () => {
      const matcher = new StationTimetableMatcher();

      const segments = matcher.toJourneySegments(
        mockSandiaolingTimetable,
        mockShifenTimetable,
        '7330',
        '7332',
        '三貂嶺',
        '十分'
      );

      expect(segments.length).toBeGreaterThan(0);

      const segment = segments[0];
      expect(segment).toHaveProperty('trainNo');
      expect(segment).toHaveProperty('trainType');
      expect(segment).toHaveProperty('fromStation');
      expect(segment).toHaveProperty('toStation');
      expect(segment).toHaveProperty('fromStationName');
      expect(segment).toHaveProperty('toStationName');
      expect(segment).toHaveProperty('departure');
      expect(segment).toHaveProperty('arrival');
    });

    it('should set correct station names', () => {
      const matcher = new StationTimetableMatcher();

      const segments = matcher.toJourneySegments(
        mockSandiaolingTimetable,
        mockShifenTimetable,
        '7330',
        '7332',
        '三貂嶺',
        '十分'
      );

      expect(segments[0].fromStation).toBe('7330');
      expect(segments[0].toStation).toBe('7332');
      expect(segments[0].fromStationName).toBe('三貂嶺');
      expect(segments[0].toStationName).toBe('十分');
    });

    it('should sort segments by departure time', () => {
      const matcher = new StationTimetableMatcher();

      const segments = matcher.toJourneySegments(
        mockSandiaolingTimetable,
        mockShifenTimetable,
        '7330',
        '7332',
        '三貂嶺',
        '十分'
      );

      // 確認按出發時間排序
      for (let i = 1; i < segments.length; i++) {
        expect(segments[i].departure >= segments[i - 1].departure).toBe(true);
      }
    });
  });

  describe('integration with real-world scenarios', () => {
    it('should handle Taipei to Shifen journey planning', () => {
      // 這個測試模擬：
      // 1. 台北 → 三貂嶺（主幹線，用 OD API）
      // 2. 三貂嶺 → 十分（支線，用 StationTimetableMatcher）

      const matcher = new StationTimetableMatcher();

      // 第二段：三貂嶺 → 十分
      const branchSegments = matcher.toJourneySegments(
        mockSandiaolingTimetable,
        mockShifenTimetable,
        '7330',
        '7332',
        '三貂嶺',
        '十分'
      );

      expect(branchSegments.length).toBeGreaterThan(0);

      // 驗證車次資訊完整
      branchSegments.forEach((seg) => {
        expect(seg.trainNo).toBeTruthy();
        expect(seg.trainType).toBeTruthy();
        expect(seg.departure).toMatch(/^\d{2}:\d{2}$/);
        expect(seg.arrival).toMatch(/^\d{2}:\d{2}$/);
      });
    });
  });
});
