/**
 * Journey Planner Tests
 * 行程規劃功能測試 (TDD)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTransferTime,
  isValidTransfer,
  findJourneyOptions,
  sortJourneys,
  getTransferStations,
  TransferTimeResolver,
  type JourneySegment,
  type JourneyOption,
  type JourneyPlannerOptions,
} from '../../src/lib/journey-planner.js';
import type { LineTransfer } from '../../src/types/api.js';

// ============================================================
// Transfer Time Calculation Tests
// ============================================================
describe('Transfer Time Calculation', () => {
  describe('calculateTransferTime', () => {
    it('should calculate transfer time in minutes', () => {
      expect(calculateTransferTime('10:00', '10:30')).toBe(30);
      expect(calculateTransferTime('08:00', '08:15')).toBe(15);
      expect(calculateTransferTime('12:00', '13:00')).toBe(60);
    });

    it('should handle same time (0 minutes)', () => {
      expect(calculateTransferTime('10:00', '10:00')).toBe(0);
    });

    it('should handle overnight transfers', () => {
      // Arrival at 23:30, departure at 00:30 next day = 60 minutes
      expect(calculateTransferTime('23:30', '00:30')).toBe(60);
      // Arrival at 23:50, departure at 05:00 next day = 310 minutes
      expect(calculateTransferTime('23:50', '05:00')).toBe(310);
    });

    it('should not treat daytime missed connections as overnight', () => {
      // Arrival at 08:12, departure at 06:08 = missed connection (-124 min)
      expect(calculateTransferTime('08:12', '06:08')).toBe(-124);
      // Arrival at 10:00, departure at 08:00 = missed connection (-120 min)
      expect(calculateTransferTime('10:00', '08:00')).toBe(-120);
    });

    it('should return negative for missed connection', () => {
      // Arrival at 10:30, but train departs at 10:00 = -30
      expect(calculateTransferTime('10:30', '10:00')).toBe(-30);
    });
  });

  describe('isValidTransfer', () => {
    it('should validate transfer with sufficient time', () => {
      expect(isValidTransfer('10:00', '10:15', 10)).toBe(true);
      expect(isValidTransfer('10:00', '10:30', 10)).toBe(true);
    });

    it('should reject transfer with insufficient time', () => {
      expect(isValidTransfer('10:00', '10:05', 10)).toBe(false);
      expect(isValidTransfer('10:00', '10:00', 10)).toBe(false);
    });

    it('should reject missed connections', () => {
      expect(isValidTransfer('10:30', '10:00', 10)).toBe(false);
    });

    it('should handle overnight valid transfers', () => {
      // 23:50 -> 00:10 next day = 20 minutes, >= 10
      expect(isValidTransfer('23:50', '00:10', 10)).toBe(true);
      // 22:00 -> 05:30 next day = 7.5 hours, valid overnight
      expect(isValidTransfer('22:00', '05:30', 10)).toBe(true);
    });

    it('should handle exact minimum transfer time', () => {
      expect(isValidTransfer('10:00', '10:10', 10)).toBe(true);
    });
  });
});

// ============================================================
// Transfer Station Tests
// ============================================================
describe('Transfer Stations', () => {
  describe('getTransferStations', () => {
    it('should return major transfer stations', () => {
      const stations = getTransferStations();
      // 主要轉乘站應包含：台北、台中、高雄、花蓮
      expect(stations).toContain('1000'); // 台北
      expect(stations).toContain('3360'); // 台中
      expect(stations).toContain('4400'); // 高雄
      expect(stations).toContain('7000'); // 花蓮
    });

    it('should include junction stations', () => {
      const stations = getTransferStations();
      // 分歧站：彰化、竹南、瑞芳
      expect(stations).toContain('3390'); // 彰化
      expect(stations).toContain('1190'); // 竹南
    });
  });
});

// ============================================================
// Journey Planning Algorithm Tests
// ============================================================
describe('Journey Planning', () => {
  // Mock train data for testing
  const mockDirectTrains: JourneySegment[] = [
    {
      trainNo: '123',
      trainType: '自強',
      trainTypeCode: '4',
      fromStation: '1000',
      fromStationName: '台北',
      toStation: '4400',
      toStationName: '高雄',
      departure: '08:00',
      arrival: '12:30',
    },
    {
      trainNo: '125',
      trainType: '莒光',
      trainTypeCode: '5',
      fromStation: '1000',
      fromStationName: '台北',
      toStation: '4400',
      toStationName: '高雄',
      departure: '09:00',
      arrival: '14:00',
    },
  ];

  const mockFirstLegTrains: JourneySegment[] = [
    {
      trainNo: '201',
      trainType: '區間快',
      trainTypeCode: '7',
      fromStation: '0900', // 基隆
      fromStationName: '基隆',
      toStation: '1000', // 台北
      toStationName: '台北',
      departure: '07:00',
      arrival: '07:45',
    },
    {
      trainNo: '203',
      trainType: '區間',
      trainTypeCode: '8',
      fromStation: '0900',
      fromStationName: '基隆',
      toStation: '1000',
      toStationName: '台北',
      departure: '07:30',
      arrival: '08:30',
    },
  ];

  const mockSecondLegTrains: JourneySegment[] = [
    {
      trainNo: '301',
      trainType: '自強',
      trainTypeCode: '4',
      fromStation: '1000', // 台北
      fromStationName: '台北',
      toStation: '4400', // 高雄
      toStationName: '高雄',
      departure: '08:00',
      arrival: '12:30',
    },
    {
      trainNo: '303',
      trainType: '普悠瑪',
      trainTypeCode: '2',
      fromStation: '1000',
      fromStationName: '台北',
      toStation: '4400',
      toStationName: '高雄',
      departure: '09:00',
      arrival: '12:00',
    },
  ];

  describe('findJourneyOptions', () => {
    it('should return direct journeys when available', () => {
      const options = findJourneyOptions(
        mockDirectTrains,
        [],
        { minTransferTime: 10 }
      );

      expect(options.length).toBe(2);
      expect(options[0].type).toBe('direct');
      expect(options[0].transfers).toBe(0);
      expect(options[0].segments.length).toBe(1);
    });

    it('should return transfer journeys with valid connections', () => {
      const options = findJourneyOptions(
        [], // no direct trains
        [{ transferStation: '1000', firstLeg: mockFirstLegTrains, secondLeg: mockSecondLegTrains }],
        { minTransferTime: 10 }
      );

      // 201 (到 07:45) + 301 (從 08:00) = 15分鐘轉乘時間，有效
      // 201 (到 07:45) + 303 (從 09:00) = 75分鐘轉乘時間，有效
      // 203 (到 08:30) + 303 (從 09:00) = 30分鐘轉乘時間，有效
      // 203 (到 08:30) + 301 (從 08:00) = 無效（已過）
      expect(options.length).toBe(3);
      expect(options.every((o) => o.type === 'transfer')).toBe(true);
      expect(options.every((o) => o.transfers === 1)).toBe(true);
    });

    it('should filter out invalid transfers (insufficient time)', () => {
      const tightTransferTrains: JourneySegment[] = [
        {
          trainNo: '401',
          trainType: '區間',
          trainTypeCode: '8',
          fromStation: '0900',
          fromStationName: '基隆',
          toStation: '1000',
          toStationName: '台北',
          departure: '07:55',
          arrival: '08:00', // Arrives exactly when next train departs
        },
      ];

      const options = findJourneyOptions(
        [],
        [{ transferStation: '1000', firstLeg: tightTransferTrains, secondLeg: mockSecondLegTrains }],
        { minTransferTime: 10 }
      );

      // 401 到 08:00，301 從 08:00 走 = 0 分鐘，不足 10 分鐘
      // 401 到 08:00，303 從 09:00 走 = 60 分鐘，有效
      expect(options.length).toBe(1);
      expect(options[0].segments[0].trainNo).toBe('401');
      expect(options[0].segments[1].trainNo).toBe('303');
    });

    it('should calculate total duration correctly', () => {
      const options = findJourneyOptions(
        mockDirectTrains,
        [],
        { minTransferTime: 10 }
      );

      // Train 123: 08:00 -> 12:30 = 270 minutes
      expect(options[0].totalDuration).toBe(270);
      // Train 125: 09:00 -> 14:00 = 300 minutes
      expect(options[1].totalDuration).toBe(300);
    });

    it('should include wait time in transfer duration', () => {
      const options = findJourneyOptions(
        [],
        [{ transferStation: '1000', firstLeg: mockFirstLegTrains, secondLeg: mockSecondLegTrains }],
        { minTransferTime: 10 }
      );

      // 201: 07:00->07:45 (45 min) + wait 15 min + 301: 08:00->12:30 (270 min) = 330 min
      const journey201_301 = options.find(
        (o) => o.segments[0].trainNo === '201' && o.segments[1].trainNo === '301'
      );
      expect(journey201_301).toBeDefined();
      expect(journey201_301!.totalDuration).toBe(330);
      expect(journey201_301!.waitTime).toBe(15);
    });
  });

  describe('sortJourneys', () => {
    const mockJourneys: JourneyOption[] = [
      {
        type: 'transfer',
        transfers: 1,
        totalDuration: 330,
        waitTime: 15,
        departure: '07:00',
        arrival: '12:30',
        segments: [],
      },
      {
        type: 'direct',
        transfers: 0,
        totalDuration: 270,
        waitTime: 0,
        departure: '08:00',
        arrival: '12:30',
        segments: [],
      },
      {
        type: 'transfer',
        transfers: 2,
        totalDuration: 250,
        waitTime: 30,
        departure: '06:00',
        arrival: '10:10',
        segments: [],
      },
    ];

    it('should sort by transfers (ascending)', () => {
      const sorted = sortJourneys(mockJourneys, 'transfers');
      expect(sorted[0].transfers).toBe(0);
      expect(sorted[1].transfers).toBe(1);
      expect(sorted[2].transfers).toBe(2);
    });

    it('should sort by duration (ascending)', () => {
      const sorted = sortJourneys(mockJourneys, 'duration');
      expect(sorted[0].totalDuration).toBe(250);
      expect(sorted[1].totalDuration).toBe(270);
      expect(sorted[2].totalDuration).toBe(330);
    });

    it('should sort by departure (ascending)', () => {
      const sorted = sortJourneys(mockJourneys, 'departure');
      expect(sorted[0].departure).toBe('06:00');
      expect(sorted[1].departure).toBe('07:00');
      expect(sorted[2].departure).toBe('08:00');
    });

    it('should sort by arrival (ascending)', () => {
      const sorted = sortJourneys(mockJourneys, 'arrival');
      expect(sorted[0].arrival).toBe('10:10');
      expect(sorted[1].arrival).toBe('12:30');
      expect(sorted[2].arrival).toBe('12:30');
    });
  });
});

// ============================================================
// Edge Cases
// ============================================================
describe('Edge Cases', () => {
  it('should handle empty train lists', () => {
    const options = findJourneyOptions([], [], { minTransferTime: 10 });
    expect(options).toEqual([]);
  });

  it('should handle no valid transfers', () => {
    const lateFirstLeg: JourneySegment[] = [
      {
        trainNo: '999',
        trainType: '區間',
        trainTypeCode: '8',
        fromStation: '0900',
        fromStationName: '基隆',
        toStation: '1000',
        toStationName: '台北',
        departure: '23:00',
        arrival: '23:45',
      },
    ];

    const earlySecondLeg: JourneySegment[] = [
      {
        trainNo: '001',
        trainType: '自強',
        trainTypeCode: '4',
        fromStation: '1000',
        fromStationName: '台北',
        toStation: '4400',
        toStationName: '高雄',
        departure: '06:00',
        arrival: '10:30',
      },
    ];

    const options = findJourneyOptions(
      [],
      [{ transferStation: '1000', firstLeg: lateFirstLeg, secondLeg: earlySecondLeg }],
      { minTransferTime: 10 }
    );

    // 23:45 -> 06:00 = overnight, but this is 6h15m wait which is valid
    // Unless we add max wait time constraint
    expect(options.length).toBe(1);
  });

  it('should handle multiple transfer stations', () => {
    const firstLegToTaipei: JourneySegment[] = [
      {
        trainNo: '101',
        trainType: '區間',
        trainTypeCode: '8',
        fromStation: '0900',
        fromStationName: '基隆',
        toStation: '1000',
        toStationName: '台北',
        departure: '07:00',
        arrival: '07:45',
      },
    ];

    const secondLegFromTaipei: JourneySegment[] = [
      {
        trainNo: '201',
        trainType: '自強',
        trainTypeCode: '4',
        fromStation: '1000',
        fromStationName: '台北',
        toStation: '4400',
        toStationName: '高雄',
        departure: '08:00',
        arrival: '12:30',
      },
    ];

    const firstLegToTaichung: JourneySegment[] = [
      {
        trainNo: '301',
        trainType: '自強',
        trainTypeCode: '4',
        fromStation: '0900',
        fromStationName: '基隆',
        toStation: '3360',
        toStationName: '台中',
        departure: '07:00',
        arrival: '09:30',
      },
    ];

    const secondLegFromTaichung: JourneySegment[] = [
      {
        trainNo: '401',
        trainType: '自強',
        trainTypeCode: '4',
        fromStation: '3360',
        fromStationName: '台中',
        toStation: '4400',
        toStationName: '高雄',
        departure: '10:00',
        arrival: '11:30',
      },
    ];

    const options = findJourneyOptions(
      [],
      [
        { transferStation: '1000', firstLeg: firstLegToTaipei, secondLeg: secondLegFromTaipei },
        { transferStation: '3360', firstLeg: firstLegToTaichung, secondLeg: secondLegFromTaichung },
      ],
      { minTransferTime: 10 }
    );

    expect(options.length).toBe(2);
    // Check both transfer options exist
    const taipeiTransfer = options.find((o) => o.transferStation === '台北');
    const taichungTransfer = options.find((o) => o.transferStation === '台中');
    expect(taipeiTransfer).toBeDefined();
    expect(taichungTransfer).toBeDefined();
  });
});

// ============================================================
// TransferTimeResolver Tests
// ============================================================
describe('TransferTimeResolver', () => {
  // Mock LineTransfer data
  // Mock data matching real TDX LineTransfer API response structure
  const mockLineTransfers: LineTransfer[] = [
    {
      FromLineID: 'EL',
      FromLineName: { Zh_tw: '東部幹線', En: 'Eastern Line' },
      FromStationID: '1920', // 瑞芳
      FromStationName: { Zh_tw: '瑞芳', En: 'Ruifang' },
      ToLineID: 'PX',
      ToLineName: { Zh_tw: '平溪線', En: 'Pingxi Line' },
      ToStationID: '7390', // 三貂嶺
      ToStationName: { Zh_tw: '三貂嶺', En: 'Sandiaoling' },
      MinTransferTime: 3,
      TransferDescription: '',
    },
    {
      FromLineID: 'WL',
      FromLineName: { Zh_tw: '西部幹線', En: 'Western Line' },
      FromStationID: '3450', // 二水
      FromStationName: { Zh_tw: '二水', En: 'Ershui' },
      ToLineID: 'JJ',
      ToLineName: { Zh_tw: '集集線', En: 'Jiji Line' },
      ToStationID: '3451', // 集集線車站
      ToStationName: { Zh_tw: '源泉', En: 'Yuanquan' },
      MinTransferTime: 5,
      TransferDescription: '',
    },
  ];

  describe('load', () => {
    it('should load LineTransfer data', () => {
      const resolver = new TransferTimeResolver();
      expect(resolver.isLoaded()).toBe(false);

      resolver.load(mockLineTransfers);

      expect(resolver.isLoaded()).toBe(true);
    });
  });

  describe('getMinTransferTime', () => {
    it('should return default time when not loaded', () => {
      const resolver = new TransferTimeResolver();

      expect(resolver.getMinTransferTime('1920')).toBe(10); // default
    });

    it('should return MinTransferTime from API data', () => {
      const resolver = new TransferTimeResolver();
      resolver.load(mockLineTransfers);

      // 瑞芳站的轉乘時間應該是 3 分鐘
      expect(resolver.getMinTransferTime('1920')).toBe(3);
      // 二水站的轉乘時間應該是 5 分鐘
      expect(resolver.getMinTransferTime('3450')).toBe(5);
    });

    it('should return default time for unknown station', () => {
      const resolver = new TransferTimeResolver();
      resolver.load(mockLineTransfers);

      // 未知站點應返回預設值
      expect(resolver.getMinTransferTime('9999')).toBe(10);
    });
  });

  describe('getTransferTimeBetween', () => {
    it('should return transfer time for specific station pair', () => {
      const resolver = new TransferTimeResolver();
      resolver.load(mockLineTransfers);

      // 瑞芳 → 三貂嶺
      expect(resolver.getTransferTimeBetween('1920', '7390')).toBe(3);
      // 反向也應該有資料
      expect(resolver.getTransferTimeBetween('7390', '1920')).toBe(3);
    });

    it('should return default for unknown station pair', () => {
      const resolver = new TransferTimeResolver();
      resolver.load(mockLineTransfers);

      expect(resolver.getTransferTimeBetween('1000', '4400')).toBe(10);
    });
  });

  describe('getDefaultTime', () => {
    it('should return default transfer time constant', () => {
      const resolver = new TransferTimeResolver();
      expect(resolver.getDefaultTime()).toBe(10);
    });
  });
});

// ============================================================
// Integration: findJourneyOptions with TransferTimeResolver
// ============================================================
describe('findJourneyOptions with TransferTimeResolver', () => {
  const mockFirstLeg: JourneySegment[] = [
    {
      trainNo: '101',
      trainType: '區間',
      trainTypeCode: '8',
      fromStation: '0900',
      fromStationName: '基隆',
      toStation: '1920', // 瑞芳
      toStationName: '瑞芳',
      departure: '07:00',
      arrival: '07:30',
    },
  ];

  const mockSecondLeg: JourneySegment[] = [
    {
      trainNo: '201',
      trainType: '區間',
      trainTypeCode: '8',
      fromStation: '1920', // 瑞芳
      fromStationName: '瑞芳',
      toStation: '7390',
      toStationName: '三貂嶺',
      departure: '07:35', // 5 min after arrival
      arrival: '07:50',
    },
  ];

  it('should use resolver MinTransferTime when provided', () => {
    const resolver = new TransferTimeResolver();
    resolver.load([
      {
        FromLineID: 'EL',
        FromLineName: { Zh_tw: '東部幹線', En: 'Eastern Line' },
        FromStationID: '1920',
        FromStationName: { Zh_tw: '瑞芳', En: 'Ruifang' },
        ToLineID: 'PX',
        ToLineName: { Zh_tw: '平溪線', En: 'Pingxi Line' },
        ToStationID: '7390',
        ToStationName: { Zh_tw: '三貂嶺', En: 'Sandiaoling' },
        MinTransferTime: 3, // Only 3 min needed
        TransferDescription: '',
      },
    ]);

    const options = findJourneyOptions(
      [],
      [{ transferStation: '1920', firstLeg: mockFirstLeg, secondLeg: mockSecondLeg }],
      { minTransferTime: 10, transferTimeResolver: resolver }
    );

    // 5 min transfer time >= 3 min (from resolver), should be valid
    expect(options.length).toBe(1);
    expect(options[0].waitTime).toBe(5);
  });

  it('should reject transfers when using default 10 min', () => {
    const options = findJourneyOptions(
      [],
      [{ transferStation: '1920', firstLeg: mockFirstLeg, secondLeg: mockSecondLeg }],
      { minTransferTime: 10 } // No resolver, use default 10 min
    );

    // 5 min transfer time < 10 min, should be rejected
    expect(options.length).toBe(0);
  });

  it('should use fallback minTransferTime when resolver has no data for station', () => {
    const resolver = new TransferTimeResolver();
    resolver.load([]); // Empty data

    const options = findJourneyOptions(
      [],
      [{ transferStation: '1920', firstLeg: mockFirstLeg, secondLeg: mockSecondLeg }],
      { minTransferTime: 10, transferTimeResolver: resolver }
    );

    // Resolver has no data for 1920, uses default 10 min
    // 5 min < 10 min, should be rejected
    expect(options.length).toBe(0);
  });
});
