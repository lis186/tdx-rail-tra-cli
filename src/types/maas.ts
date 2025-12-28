/**
 * MAAS (Mobility as a Service) API 類型定義
 *
 * 用於城際運輸票務整合功能模組
 * 文件：https://tdx.transportdata.tw/webapi/File/Swagger/V3/4513f9d6-caae-4cf7-a50c-e7887bec804e
 */

/**
 * 運具類型
 */
export type MaasTransportMode = 'TRA' | 'HSR' | 'BUS' | 'MRT' | 'LRT' | 'FERRY';

/**
 * 運具資訊（含 UUID）
 */
export interface MaasTransport {
  mode: MaasTransportMode;
  name: string;
  category: string;
  headsign: string;
  shortName: string;
  longName: string;
  route_color: string;
  number: string;
  type: string;
  city: string;
  uuid: string;
}

/**
 * 路線區段
 */
export interface MaasSection {
  type: string;
  transport?: MaasTransport;
  departure?: {
    place: string;
    time: string;
  };
  arrival?: {
    place: string;
    time: string;
  };
}

/**
 * 路線方案
 */
export interface MaasRoute {
  travel_time: number;
  start_time: string;
  end_time: string;
  transfers: number;
  sections: MaasSection[];
}

/**
 * 旅運規劃 API 回應
 */
export interface MaasTripPlanningResponse {
  result: 'success' | 'fail';
  data?: {
    routes: MaasRoute[];
  };
  error?: {
    code: number;
    msg: string;
  };
}

/**
 * Deeplink 資訊
 */
export interface MaasDeeplink {
  deeplink: string;
  expired: string;
}

/**
 * Deeplink API 回應
 */
export interface MaasDeeplinkResponse {
  result: 'success' | 'fail';
  data?: MaasDeeplink[];
  error?: {
    code: number;
    msg: string;
  };
}

/**
 * Deeplink Token 驗證回應
 */
export interface MaasVerifyTokenResponse {
  result: 'success' | 'fail';
  data?: {
    token: string;
    agency: 'TRA' | 'HSR';
  };
  error?: {
    code: number;
    msg: string;
  };
}

/**
 * 旅運規劃請求參數
 */
export interface TripPlanningParams {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  departureTime: string;
  transit?: string;
  gc?: number;
  top?: number;
}
