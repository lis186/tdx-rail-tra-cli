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
 * 每日時刻表
 */
export interface DailyTrainTimetable {
  TrainDate: string;
  DailyTrainInfo: {
    TrainNo: string;
    Direction: number;
    TrainTypeName: {
      Zh_tw: string;
      En: string;
    };
    StartingStationName: {
      Zh_tw: string;
      En: string;
    };
    EndingStationName: {
      Zh_tw: string;
      En: string;
    };
  };
  StopTimes: StopTime[];
}

/**
 * 車次一般時刻表
 */
export interface GeneralTrainTimetable {
  TrainInfo: {
    TrainNo: string;
    Direction: number;
    TrainTypeName: {
      Zh_tw: string;
      En: string;
    };
    StartingStationName: {
      Zh_tw: string;
      En: string;
    };
    EndingStationName: {
      Zh_tw: string;
      En: string;
    };
  };
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
