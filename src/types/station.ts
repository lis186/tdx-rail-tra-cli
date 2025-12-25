/**
 * 車站資料結構
 */
export interface Station {
  /** 車站 ID，例如 "1000" */
  id: string;
  /** 車站名稱，例如 "臺北" */
  name: string;
  /** 緯度 */
  lat: number;
  /** 經度 */
  lon: number;
}

/**
 * 車站解析結果
 */
export interface StationResolveResult {
  success: true;
  station: Station;
  confidence: 'exact' | 'high' | 'medium';
}

/**
 * 車站解析錯誤
 */
export interface StationResolveError {
  success: false;
  error: {
    code: 'STATION_NOT_FOUND';
    message: string;
    suggestion?: string;
    candidates: string[];
  };
}

export type StationResolveResponse = StationResolveResult | StationResolveError;
