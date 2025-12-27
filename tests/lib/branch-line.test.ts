/**
 * Branch Line Detection Tests
 * 支線判斷功能測試 (TDD)
 */

import { describe, it, expect } from 'vitest';
import {
  BranchLineResolver,
  type BranchLineInfo,
} from '../../src/lib/branch-line.js';
import type { LineTransfer, StationOfLine } from '../../src/types/api.js';

// ============================================================
// Mock Data - Matching Real TDX API Response Structure
// Based on API sampling from scripts/sample-line-transfer.ts
// ============================================================

// LineTransfer API 真實資料結構
const mockLineTransfers: LineTransfer[] = [
  // 平溪線轉乘點：三貂嶺
  {
    FromLineID: 'EL',
    FromLineName: { Zh_tw: '東部幹線', En: 'Eastern Main Line' },
    FromStationID: '7330',
    FromStationName: { Zh_tw: '三貂嶺', En: 'Sandiaoling' },
    ToLineID: 'PX',
    ToLineName: { Zh_tw: '平溪線', En: 'Pingxi Line' },
    ToStationID: '7330',
    ToStationName: { Zh_tw: '三貂嶺', En: 'Sandiaoling' },
    MinTransferTime: 3,
    TransferDescription: '',
  },
  // 深澳線轉乘點：瑞芳
  {
    FromLineID: 'EL',
    FromLineName: { Zh_tw: '東部幹線', En: 'Eastern Main Line' },
    FromStationID: '7360',
    FromStationName: { Zh_tw: '瑞芳', En: 'Ruifang' },
    ToLineID: 'SA',
    ToLineName: { Zh_tw: '深澳線', En: 'Shenao Line' },
    ToStationID: '7360',
    ToStationName: { Zh_tw: '瑞芳', En: 'Ruifang' },
    MinTransferTime: 3,
    TransferDescription: '1.3 月臺: 平溪線、深澳線',
  },
  // 集集線轉乘點：二水
  {
    FromLineID: 'WL',
    FromLineName: { Zh_tw: '西部幹線', En: 'Western Main Line' },
    FromStationID: '3430',
    FromStationName: { Zh_tw: '二水', En: 'Ershui' },
    ToLineID: 'JJ',
    ToLineName: { Zh_tw: '集集線', En: 'Jiji Line' },
    ToStationID: '3430',
    ToStationName: { Zh_tw: '二水', En: 'Ershui' },
    MinTransferTime: 3,
    TransferDescription: '',
  },
  // 內灣線轉乘點：北新竹
  {
    FromLineID: 'WL',
    FromLineName: { Zh_tw: '西部幹線', En: 'Western Main Line' },
    FromStationID: '1190',
    FromStationName: { Zh_tw: '北新竹', En: 'North Hsinchu' },
    ToLineID: 'NW',
    ToLineName: { Zh_tw: '內灣線', En: 'Neiwan Line' },
    ToStationID: '1190',
    ToStationName: { Zh_tw: '北新竹', En: 'North Hsinchu' },
    MinTransferTime: 3,
    TransferDescription: '',
  },
  // 內灣線/六家線轉乘點：竹中
  {
    FromLineID: 'NW',
    FromLineName: { Zh_tw: '內灣線', En: 'Neiwan Line' },
    FromStationID: '1193',
    FromStationName: { Zh_tw: '竹中', En: 'Zhuzhong' },
    ToLineID: 'LJ',
    ToLineName: { Zh_tw: '六家線', En: 'Liujia Line' },
    ToStationID: '1193',
    ToStationName: { Zh_tw: '竹中', En: 'Zhuzhong' },
    MinTransferTime: 3,
    TransferDescription: '',
  },
  // 沙崙線轉乘點：中洲
  {
    FromLineID: 'WL',
    FromLineName: { Zh_tw: '西部幹線', En: 'Western Main Line' },
    FromStationID: '4270',
    FromStationName: { Zh_tw: '中洲', En: 'Zhongzhou' },
    ToLineID: 'SH',
    ToLineName: { Zh_tw: '沙崙線', En: 'Shalun Line' },
    ToStationID: '4270',
    ToStationName: { Zh_tw: '中洲', En: 'Zhongzhou' },
    MinTransferTime: 3,
    TransferDescription: '',
  },
];

// StationOfLine API 真實資料結構
const mockStationOfLines: StationOfLine[] = [
  // 平溪線
  {
    LineID: 'PX',
    Stations: [
      { Sequence: 0, StationID: '7330', StationName: { Zh_tw: '三貂嶺', En: 'Sandiaoling' } },
      { Sequence: 1, StationID: '7331', StationName: { Zh_tw: '大華', En: 'Dahua' } },
      { Sequence: 2, StationID: '7332', StationName: { Zh_tw: '十分', En: 'Shifen' } },
      { Sequence: 3, StationID: '7333', StationName: { Zh_tw: '望古', En: 'Wanggu' } },
      { Sequence: 4, StationID: '7334', StationName: { Zh_tw: '嶺腳', En: 'Lingjiao' } },
      { Sequence: 5, StationID: '7335', StationName: { Zh_tw: '平溪', En: 'Pingxi' } },
      { Sequence: 6, StationID: '7336', StationName: { Zh_tw: '菁桐', En: 'Jingtong' } },
    ],
  },
  // 深澳線
  {
    LineID: 'SA',
    Stations: [
      { Sequence: 0, StationID: '7360', StationName: { Zh_tw: '瑞芳', En: 'Ruifang' } },
      { Sequence: 1, StationID: '7361', StationName: { Zh_tw: '海科館', En: 'Haikeguan' } },
      { Sequence: 2, StationID: '7362', StationName: { Zh_tw: '八斗子', En: 'Badouzi' } },
    ],
  },
  // 集集線
  {
    LineID: 'JJ',
    Stations: [
      { Sequence: 0, StationID: '3430', StationName: { Zh_tw: '二水', En: 'Ershui' } },
      { Sequence: 1, StationID: '3431', StationName: { Zh_tw: '源泉', En: 'Yuanquan' } },
      { Sequence: 2, StationID: '3432', StationName: { Zh_tw: '濁水', En: 'Zhuoshui' } },
      { Sequence: 3, StationID: '3433', StationName: { Zh_tw: '龍泉', En: 'Longquan' } },
      { Sequence: 4, StationID: '3434', StationName: { Zh_tw: '集集', En: 'Jiji' } },
      { Sequence: 5, StationID: '3435', StationName: { Zh_tw: '水里', En: 'Shuili' } },
      { Sequence: 6, StationID: '3436', StationName: { Zh_tw: '車埕', En: 'Checheng' } },
    ],
  },
  // 內灣線
  {
    LineID: 'NW',
    Stations: [
      { Sequence: 0, StationID: '1190', StationName: { Zh_tw: '北新竹', En: 'North Hsinchu' } },
      { Sequence: 1, StationID: '1191', StationName: { Zh_tw: '千甲', En: 'Qianjia' } },
      { Sequence: 2, StationID: '1192', StationName: { Zh_tw: '新莊', En: 'Xinzhuang' } },
      { Sequence: 3, StationID: '1193', StationName: { Zh_tw: '竹中', En: 'Zhuzhong' } },
      { Sequence: 4, StationID: '1201', StationName: { Zh_tw: '上員', En: 'Shangyuan' } },
      { Sequence: 5, StationID: '1202', StationName: { Zh_tw: '榮華', En: 'Ronghua' } },
      { Sequence: 6, StationID: '1203', StationName: { Zh_tw: '竹東', En: 'Zhudong' } },
      { Sequence: 7, StationID: '1204', StationName: { Zh_tw: '橫山', En: 'Hengshan' } },
      { Sequence: 8, StationID: '1205', StationName: { Zh_tw: '九讚頭', En: 'Jiuzantou' } },
      { Sequence: 9, StationID: '1206', StationName: { Zh_tw: '合興', En: 'Hexing' } },
      { Sequence: 10, StationID: '1207', StationName: { Zh_tw: '富貴', En: 'Fugui' } },
      { Sequence: 11, StationID: '1208', StationName: { Zh_tw: '內灣', En: 'Neiwan' } },
    ],
  },
  // 六家線
  {
    LineID: 'LJ',
    Stations: [
      { Sequence: 0, StationID: '1193', StationName: { Zh_tw: '竹中', En: 'Zhuzhong' } },
      { Sequence: 1, StationID: '1194', StationName: { Zh_tw: '六家', En: 'Liujia' } },
    ],
  },
  // 沙崙線
  {
    LineID: 'SH',
    Stations: [
      { Sequence: 0, StationID: '4270', StationName: { Zh_tw: '中洲', En: 'Zhongzhou' } },
      { Sequence: 1, StationID: '4271', StationName: { Zh_tw: '長榮大學', En: 'Chang Jung University' } },
      { Sequence: 2, StationID: '4272', StationName: { Zh_tw: '沙崙', En: 'Shalun' } },
    ],
  },
];

// ============================================================
// BranchLineResolver Tests
// ============================================================
describe('BranchLineResolver', () => {
  describe('load', () => {
    it('should load LineTransfer data', () => {
      const resolver = new BranchLineResolver();
      expect(resolver.isLoaded()).toBe(false);

      resolver.load(mockLineTransfers, mockStationOfLines);

      expect(resolver.isLoaded()).toBe(true);
    });

    it('should handle empty data gracefully', () => {
      const resolver = new BranchLineResolver();
      resolver.load([], []);

      expect(resolver.isLoaded()).toBe(true);
    });
  });

  describe('isBranchLineStation', () => {
    it('should identify branch line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 平溪線站點
      expect(resolver.isBranchLineStation('7332')).toBe(true); // 十分
      expect(resolver.isBranchLineStation('7335')).toBe(true); // 平溪
      expect(resolver.isBranchLineStation('7336')).toBe(true); // 菁桐

      // 集集線站點
      expect(resolver.isBranchLineStation('3434')).toBe(true); // 集集
      expect(resolver.isBranchLineStation('3436')).toBe(true); // 車埕

      // 內灣線站點
      expect(resolver.isBranchLineStation('1208')).toBe(true); // 內灣

      // 六家線站點
      expect(resolver.isBranchLineStation('1194')).toBe(true); // 六家

      // 沙崙線站點
      expect(resolver.isBranchLineStation('4272')).toBe(true); // 沙崙
    });

    it('should return false for main line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 主幹線站點
      expect(resolver.isBranchLineStation('1000')).toBe(false); // 台北
      expect(resolver.isBranchLineStation('4400')).toBe(false); // 高雄
      expect(resolver.isBranchLineStation('3360')).toBe(false); // 台中
    });

    it('should return false when not loaded', () => {
      const resolver = new BranchLineResolver();
      expect(resolver.isBranchLineStation('7332')).toBe(false);
    });
  });

  describe('getJunctionStation', () => {
    it('should return junction station for Pingxi Line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 平溪線站點都應該返回三貂嶺作為轉乘站
      expect(resolver.getJunctionStation('7332')).toBe('7330'); // 十分 → 三貂嶺
      expect(resolver.getJunctionStation('7335')).toBe('7330'); // 平溪 → 三貂嶺
      expect(resolver.getJunctionStation('7336')).toBe('7330'); // 菁桐 → 三貂嶺
    });

    it('should return junction station for Shenao Line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 深澳線站點都應該返回瑞芳作為轉乘站
      expect(resolver.getJunctionStation('7361')).toBe('7360'); // 海科館 → 瑞芳
      expect(resolver.getJunctionStation('7362')).toBe('7360'); // 八斗子 → 瑞芳
    });

    it('should return junction station for Jiji Line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 集集線站點都應該返回二水作為轉乘站
      expect(resolver.getJunctionStation('3434')).toBe('3430'); // 集集 → 二水
      expect(resolver.getJunctionStation('3436')).toBe('3430'); // 車埕 → 二水
    });

    it('should return junction station for Neiwan Line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 內灣線站點應該返回北新竹作為主要轉乘站
      expect(resolver.getJunctionStation('1208')).toBe('1190'); // 內灣 → 北新竹
      expect(resolver.getJunctionStation('1203')).toBe('1190'); // 竹東 → 北新竹
    });

    it('should return junction station for Liujia Line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 六家線站點（只有六家站需要轉乘）
      expect(resolver.getJunctionStation('1194')).toBe('1193'); // 六家 → 竹中
    });

    it('should return junction station for Shalun Line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 沙崙線站點都應該返回中洲作為轉乘站
      expect(resolver.getJunctionStation('4271')).toBe('4270'); // 長榮大學 → 中洲
      expect(resolver.getJunctionStation('4272')).toBe('4270'); // 沙崙 → 中洲
    });

    it('should return null for main line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      expect(resolver.getJunctionStation('1000')).toBeNull(); // 台北
      expect(resolver.getJunctionStation('4400')).toBeNull(); // 高雄
    });

    it('should return null for junction stations themselves', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 轉乘站本身不需要再轉乘
      expect(resolver.getJunctionStation('7330')).toBeNull(); // 三貂嶺
      expect(resolver.getJunctionStation('7360')).toBeNull(); // 瑞芳
      expect(resolver.getJunctionStation('3430')).toBeNull(); // 二水
      expect(resolver.getJunctionStation('4270')).toBeNull(); // 中洲
    });
  });

  describe('getBranchLineInfo', () => {
    it('should return branch line info for branch line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      const info = resolver.getBranchLineInfo('7332'); // 十分
      expect(info).not.toBeNull();
      expect(info?.lineId).toBe('PX');
      expect(info?.lineName).toBe('平溪線');
      expect(info?.junctionStationId).toBe('7330');
      expect(info?.junctionStationName).toBe('三貂嶺');
    });

    it('should return null for main line stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      expect(resolver.getBranchLineInfo('1000')).toBeNull(); // 台北
    });
  });

  describe('getAllJunctionStations', () => {
    it('should return all junction stations', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      const junctions = resolver.getAllJunctionStations();

      // 應該包含所有支線的轉乘站
      expect(junctions).toContain('7330'); // 三貂嶺 (平溪線)
      expect(junctions).toContain('7360'); // 瑞芳 (深澳線)
      expect(junctions).toContain('3430'); // 二水 (集集線)
      expect(junctions).toContain('1190'); // 北新竹 (內灣線)
      expect(junctions).toContain('1193'); // 竹中 (六家線)
      expect(junctions).toContain('4270'); // 中洲 (沙崙線)
    });
  });
});

// ============================================================
// Journey Planning Integration Tests
// ============================================================
describe('Branch Line Journey Planning Integration', () => {
  describe('filterTransferStationsWithBranchLines', () => {
    it('should include junction when destination is branch line station', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 台北 → 十分：應該包含三貂嶺作為轉乘站
      const junctionStation = resolver.getJunctionStation('7332');
      expect(junctionStation).toBe('7330');
    });

    it('should include junction when origin is branch line station', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 車埕 → 高雄：應該包含二水作為轉乘站
      const junctionStation = resolver.getJunctionStation('3436');
      expect(junctionStation).toBe('3430');
    });

    it('should handle both origin and destination on branch lines', () => {
      const resolver = new BranchLineResolver();
      resolver.load(mockLineTransfers, mockStationOfLines);

      // 十分 → 車埕：需要兩個轉乘站（三貂嶺和二水）
      const fromJunction = resolver.getJunctionStation('7332');
      const toJunction = resolver.getJunctionStation('3436');

      expect(fromJunction).toBe('7330'); // 三貂嶺
      expect(toJunction).toBe('3430'); // 二水
    });
  });
});
