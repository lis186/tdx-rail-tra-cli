/**
 * TDX API Types
 * TDX API 回應類型定義
 */

/**
 * 車站基本資料
 */
export interface TRAStation {
  StationID: string;
  StationName: {
    Zh_tw: string;
    En: string;
  };
  StationPosition: {
    PositionLat: number;
    PositionLon: number;
  };
  StationAddress?: string;
  StationClass?: string;
}

/**
 * 停靠時間資訊
 */
export interface StopTime {
  StopSequence: number;
  StationID: string;
  StationName: {
    Zh_tw: string;
    En: string;
  };
  ArrivalTime?: string;
  DepartureTime?: string;
}

/**
 * 列車基本資訊 (v3 API 共用)
 */
export interface TrainInfo {
  TrainNo: string;
  Direction: number;
  TrainTypeID: string;
  TrainTypeCode: string;
  TrainTypeName: {
    Zh_tw: string;
    En: string;
  };
  TripHeadSign?: string;
  StartingStationID: string;
  StartingStationName: {
    Zh_tw: string;
    En: string;
  };
  EndingStationID: string;
  EndingStationName: {
    Zh_tw: string;
    En: string;
  };
  TripLine?: number;
  WheelChairFlag?: number;
  PackageServiceFlag?: number;
  DiningFlag?: number;
  BreastFeedFlag?: number;
  BikeFlag?: number;
  DailyFlag?: number;
  Note?: string;
}

/**
 * 每日時刻表 (v3 API)
 */
export interface DailyTrainTimetable {
  TrainDate?: string;
  TrainInfo: TrainInfo;
  StopTimes: StopTime[];
}

/**
 * 車次一般時刻表 (v3 API)
 */
export interface GeneralTrainTimetable {
  TrainInfo: TrainInfo;
  StopTimes: StopTime[];
}

/**
 * 列車即時位置
 */
export interface TrainLiveBoard {
  TrainNo: string;
  TrainTypeName: {
    Zh_tw: string;
    En: string;
  };
  StationID: string;
  StationName: {
    Zh_tw: string;
    En: string;
  };
  DelayTime: number;
  UpdateTime: string;
}

/**
 * 延誤資訊
 */
export interface TrainDelay {
  TrainNo: string;
  DelayTime: number;
  UpdateTime: string;
}

/**
 * 票價資訊
 */
export interface ODFare {
  OriginStationID: string;
  OriginStationName: {
    Zh_tw: string;
    En: string;
  };
  DestinationStationID: string;
  DestinationStationName: {
    Zh_tw: string;
    En: string;
  };
  Fares: Array<{
    TicketType: number;
    FareClass: number;
    Price: number;
  }>;
}

/**
 * API 錯誤
 */
export interface TDXError {
  message: string;
  statusCode?: number;
}

/**
 * TDX API 回應包裝
 */
export interface TDXResponse<T> {
  UpdateTime: string;
  UpdateInterval: number;
  SrcUpdateTime: string;
  SrcUpdateInterval: number;
}

/**
 * 每日時刻表 API 回應
 */
export interface DailyTimetableResponse extends TDXResponse<DailyTrainTimetable[]> {
  TrainDate: string;
  TrainTimetables: DailyTrainTimetable[];
}

/**
 * 車次時刻表 API 回應
 */
export interface GeneralTimetableResponse extends TDXResponse<GeneralTrainTimetable[]> {
  TrainTimetables: GeneralTrainTimetable[];
}

/**
 * 即時位置 API 回應
 */
export interface TrainLiveBoardResponse extends TDXResponse<TrainLiveBoard[]> {
  TrainLiveBoards: TrainLiveBoard[];
}

/**
 * 延誤資訊 API 回應
 */
export interface TrainDelayResponse extends TDXResponse<TrainDelay[]> {
  TrainDelays: TrainDelay[];
}

/**
 * 票價 API 回應
 */
export interface ODFareResponse extends TDXResponse<ODFare[]> {
  ODFares: ODFare[];
}

/**
 * 車站即時看板（到離站資訊）
 */
export interface StationLiveBoard {
  StationID: string;
  StationName: {
    Zh_tw: string;
    En: string;
  };
  TrainNo: string;
  TrainTypeName: {
    Zh_tw: string;
    En: string;
  };
  EndingStationName: {
    Zh_tw: string;
    En: string;
  };
  Direction: number;
  ScheduledDepartureTime?: string;
  ScheduledArrivalTime?: string;
  DelayTime: number;
  Platform?: string;
  UpdateTime: string;
}

/**
 * 車站即時看板 API 回應
 */
export interface StationLiveBoardResponse extends TDXResponse<StationLiveBoard[]> {
  StationLiveBoards: StationLiveBoard[];
}

/**
 * 路線基本資料
 */
export interface Line {
  LineID: string;
  LineName: {
    Zh_tw: string;
    En: string;
  };
  LineSectionName?: {
    Zh_tw: string;
    En: string;
  };
  IsBranch?: boolean;
}

/**
 * 路線 API 回應
 */
export interface LineResponse extends TDXResponse<Line[]> {
  Lines: Line[];
}

/**
 * 路線車站資料
 */
export interface StationOfLine {
  LineID: string;
  Stations: Array<{
    Sequence: number;
    StationID: string;
    StationName: {
      Zh_tw: string;
      En: string;
    };
    CumulativeDistance?: number;
  }>;
}

/**
 * 路線車站 API 回應
 */
export interface StationOfLineResponse extends TDXResponse<StationOfLine[]> {
  StationOfLines: StationOfLine[];
}

/**
 * 車站每日時刻表
 */
export interface DailyStationTimetable {
  TrainDate: string;
  StationID: string;
  StationName: {
    Zh_tw: string;
    En: string;
  };
  Direction: number;
  TimeTables: Array<{
    TrainNo: string;
    TrainTypeName: {
      Zh_tw: string;
      En: string;
    };
    EndingStationName: {
      Zh_tw: string;
      En: string;
    };
    ArrivalTime?: string;
    DepartureTime?: string;
  }>;
}

/**
 * 車站每日時刻表 API 回應
 */
export interface DailyStationTimetableResponse extends TDXResponse<DailyStationTimetable[]> {
  StationTimetables: DailyStationTimetable[];
}

/**
 * 路線轉乘資訊
 * 描述兩條路線之間的轉乘關係及最少轉乘時間
 */
export interface LineTransfer {
  FromLineID: string;
  FromLineName: {
    Zh_tw: string;
    En: string;
  };
  FromStationID: string;
  FromStationName: {
    Zh_tw: string;
    En: string;
  };
  ToLineID: string;
  ToLineName: {
    Zh_tw: string;
    En: string;
  };
  ToStationID: string;
  ToStationName: {
    Zh_tw: string;
    En: string;
  };
  MinTransferTime: number; // 最少轉乘時間（分鐘）
  TransferDescription?: string;
}

/**
 * 路線轉乘 API 回應
 */
export interface LineTransferResponse extends TDXResponse<LineTransfer[]> {
  LineTransfers: LineTransfer[];
}
