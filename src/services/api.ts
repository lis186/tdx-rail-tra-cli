/**
 * TDX API Client
 * TDX API 客戶端 - 處理 TRA 相關 API 請求
 */

import { ofetch, FetchError } from 'ofetch';
import { AuthService } from './auth.js';
import { CacheService } from './cache.js';
import { RateLimiter } from './rate-limiter.js';
import { retry, isRetryableStatus } from './retry.js';
import type {
  DailyTrainTimetable,
  GeneralTrainTimetable,
  TrainLiveBoard,
  TrainDelay,
  ODFare,
  StationLiveBoard,
  Line,
  StationOfLine,
  DailyStationTimetable,
  LineTransfer,
  Alert,
  StationExit,
  DailyTimetableResponse,
  GeneralTimetableResponse,
  TrainLiveBoardResponse,
  TrainDelayResponse,
  ODFareResponse,
  StationLiveBoardResponse,
  LineResponse,
  StationOfLineResponse,
  DailyStationTimetableResponse,
  LineTransferResponse,
  AlertResponse,
  StationExitResponse,
} from '../types/api.js';

const API_BASE = 'https://tdx.transportdata.tw/api/basic';

// 快取 TTL 設定 (毫秒)
const CACHE_TTL = {
  TIMETABLE: 4 * 60 * 60 * 1000, // 4 小時
  FARE: 7 * 24 * 60 * 60 * 1000, // 7 天（票價不常變動）
  STATIC: 24 * 60 * 60 * 1000, // 24 小時（路線等靜態資料）
  LINE_TRANSFER: 7 * 24 * 60 * 60 * 1000, // 7 天（轉乘資訊不常變動）
  ALERT: 1 * 60 * 60 * 1000, // 1 小時（阻通資訊需較即時）
};

export interface ApiOptions {
  skipCache?: boolean;
}

export class TDXApiClient {
  private auth: AuthService;
  private cache: CacheService;
  private rateLimiter: RateLimiter;

  constructor(clientId: string, clientSecret: string) {
    this.auth = new AuthService(clientId, clientSecret);
    this.cache = new CacheService();
    this.rateLimiter = new RateLimiter();
  }

  /**
   * 取得每日時刻表（起訖站）
   */
  async getDailyTimetable(
    fromStationId: string,
    toStationId: string,
    date: string,
    options: ApiOptions = {}
  ): Promise<DailyTrainTimetable[]> {
    const cacheKey = `timetable/od-${fromStationId}-${toStationId}-${date}`;

    // 檢查快取
    if (!options.skipCache) {
      const cached = this.cache.get<DailyTrainTimetable[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 發送 API 請求
    const url = `${API_BASE}/v3/Rail/TRA/DailyTrainTimetable/OD/${fromStationId}/to/${toStationId}/${date}`;
    const response = await this.request<DailyTimetableResponse>(url);
    const result = response.TrainTimetables ?? [];

    // 儲存快取
    this.cache.set(cacheKey, result, CACHE_TTL.TIMETABLE);

    return result;
  }

  /**
   * 取得車次時刻表
   */
  async getTrainTimetable(trainNo: string): Promise<GeneralTrainTimetable | null> {
    const cacheKey = `timetable/train-${trainNo}`;

    // 檢查快取
    const cached = this.cache.get<GeneralTrainTimetable>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${API_BASE}/v3/Rail/TRA/GeneralTrainTimetable/TrainNo/${trainNo}`;
    const response = await this.request<GeneralTimetableResponse>(url);
    const timetables = response.TrainTimetables ?? [];

    if (timetables.length === 0) {
      return null;
    }

    // 儲存快取
    this.cache.set(cacheKey, timetables[0], CACHE_TTL.TIMETABLE);

    return timetables[0];
  }

  /**
   * 取得車次即時位置
   * 注意：即時資料不快取
   */
  async getTrainLiveBoard(trainNo: string): Promise<TrainLiveBoard | null> {
    const url = `${API_BASE}/v3/Rail/TRA/TrainLiveBoard/TrainNo/${trainNo}`;
    const response = await this.request<TrainLiveBoardResponse>(url);
    const liveBoards = response.TrainLiveBoards ?? [];

    if (liveBoards.length === 0) {
      return null;
    }

    // 即時資料不快取
    return liveBoards[0];
  }

  /**
   * 取得多車次延誤資訊
   * 注意：即時資料不快取
   */
  async getTrainDelays(trainNos: string[]): Promise<TrainDelay[]> {
    if (trainNos.length === 0) {
      return [];
    }

    // 建立 OData $filter 查詢
    const filter = trainNos.map((no) => `TrainNo eq '${no}'`).join(' or ');

    const url = `${API_BASE}/v2/Rail/TRA/LiveTrainDelay`;
    const result = await this.request<TrainDelay[]>(url, {
      $filter: filter,
    });

    // 即時資料不快取
    return result;
  }

  /**
   * 取得起訖站票價
   */
  async getODFare(fromStationId: string, toStationId: string): Promise<ODFare | null> {
    const cacheKey = `fare/od-${fromStationId}-${toStationId}`;

    // 檢查快取
    const cached = this.cache.get<ODFare>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${API_BASE}/v3/Rail/TRA/ODFare/${fromStationId}/to/${toStationId}`;
    const response = await this.request<ODFareResponse>(url);
    const fares = response.ODFares ?? [];

    if (fares.length === 0) {
      return null;
    }

    // 儲存快取
    this.cache.set(cacheKey, fares[0], CACHE_TTL.FARE);

    return fares[0];
  }

  /**
   * 取得車站即時看板
   * 注意：即時資料不快取
   */
  async getStationLiveBoard(stationId: string): Promise<StationLiveBoard[]> {
    const url = `${API_BASE}/v3/Rail/TRA/StationLiveBoard/Station/${stationId}`;
    const response = await this.request<StationLiveBoardResponse>(url);
    return response.StationLiveBoards ?? [];
  }

  /**
   * 取得車站每日時刻表
   */
  async getStationTimetable(
    stationId: string,
    date: string,
    direction?: 0 | 1,
    options: ApiOptions = {}
  ): Promise<DailyStationTimetable[]> {
    const cacheKey = `timetable/station-${stationId}-${date}${direction !== undefined ? `-${direction}` : ''}`;

    // 檢查快取
    if (!options.skipCache) {
      const cached = this.cache.get<DailyStationTimetable[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let url = `${API_BASE}/v3/Rail/TRA/DailyStationTimetable/Station/${stationId}/${date}`;

    const query: Record<string, string> = {};
    if (direction !== undefined) {
      query['$filter'] = `Direction eq ${direction}`;
    }

    const response = await this.request<DailyStationTimetableResponse>(url, Object.keys(query).length > 0 ? query : undefined);
    const result = response.StationTimetables ?? [];

    // 儲存快取
    this.cache.set(cacheKey, result, CACHE_TTL.TIMETABLE);

    return result;
  }

  /**
   * 取得所有路線
   */
  async getLines(options: ApiOptions = {}): Promise<Line[]> {
    const cacheKey = 'lines/all';

    // 檢查快取
    if (!options.skipCache) {
      const cached = this.cache.get<Line[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const url = `${API_BASE}/v3/Rail/TRA/Line`;
    const response = await this.request<LineResponse>(url);
    const result = response.Lines ?? [];

    // 儲存快取
    this.cache.set(cacheKey, result, CACHE_TTL.STATIC);

    return result;
  }

  /**
   * 取得路線車站
   */
  async getStationsOfLine(lineId: string, options: ApiOptions = {}): Promise<StationOfLine | null> {
    const cacheKey = `lines/stations-${lineId}`;

    // 檢查快取
    if (!options.skipCache) {
      const cached = this.cache.get<StationOfLine>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const url = `${API_BASE}/v3/Rail/TRA/StationOfLine`;
    const response = await this.request<StationOfLineResponse>(url, {
      '$filter': `LineID eq '${lineId}'`,
    });
    const stationOfLines = response.StationOfLines ?? [];

    if (stationOfLines.length === 0) {
      return null;
    }

    // 儲存快取
    this.cache.set(cacheKey, stationOfLines[0], CACHE_TTL.STATIC);

    return stationOfLines[0];
  }

  /**
   * 取得多條路線的車站資料
   * 用於支線判斷功能
   */
  async getMultipleStationsOfLine(
    lineIds: string[],
    options: ApiOptions = {}
  ): Promise<StationOfLine[]> {
    const results: StationOfLine[] = [];

    for (const lineId of lineIds) {
      try {
        const stationOfLine = await this.getStationsOfLine(lineId, options);
        if (stationOfLine) {
          results.push(stationOfLine);
        }
      } catch {
        // 忽略單一路線查詢失敗
        continue;
      }
    }

    return results;
  }

  /**
   * 取得路線轉乘資訊
   * 用於查詢轉乘站的最少轉乘時間
   */
  async getLineTransfers(options: ApiOptions = {}): Promise<LineTransfer[]> {
    const cacheKey = 'line-transfers/all';

    // 檢查快取
    if (!options.skipCache) {
      const cached = this.cache.get<LineTransfer[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const url = `${API_BASE}/v3/Rail/TRA/LineTransfer`;
    const response = await this.request<LineTransferResponse>(url);
    const result = response.LineTransfers ?? [];

    // 儲存快取
    this.cache.set(cacheKey, result, CACHE_TTL.LINE_TRANSFER);

    return result;
  }

  /**
   * 取得阻通資訊
   * 包含路線停駛、異常狀態等資訊
   */
  async getAlerts(options: ApiOptions = {}): Promise<Alert[]> {
    const cacheKey = 'alerts/all';

    // 檢查快取
    if (!options.skipCache) {
      const cached = this.cache.get<Alert[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const url = `${API_BASE}/v3/Rail/TRA/Alert`;
    const response = await this.request<AlertResponse>(url);
    const result = response.Alerts ?? [];

    // 儲存快取
    this.cache.set(cacheKey, result, CACHE_TTL.ALERT);

    return result;
  }

  /**
   * 取得車站出口資訊
   */
  async getStationExits(
    stationId?: string,
    options: ApiOptions = {}
  ): Promise<StationExit[]> {
    const cacheKey = stationId ? `exits/${stationId}` : 'exits/all';

    // 檢查快取
    if (!options.skipCache) {
      const cached = this.cache.get<StationExit[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let url = `${API_BASE}/v3/Rail/TRA/StationExit`;
    if (stationId) {
      url += `?$filter=StationID eq '${stationId}'`;
    }

    const response = await this.request<StationExitResponse>(url);
    const result = response.StationExits ?? [];

    // 儲存快取
    this.cache.set(cacheKey, result, CACHE_TTL.STATIC);

    return result;
  }

  /**
   * 清除快取
   */
  clearCache(prefix?: string): void {
    this.cache.clear(prefix);
  }

  /**
   * 發送帶認證的 API 請求
   * 包含 Rate Limiting 和 Retry 機制
   */
  private async request<T>(url: string, query?: Record<string, string>): Promise<T> {
    // 使用 retry 包裝請求，處理暫時性錯誤
    return retry(
      async () => {
        // 取得 rate limit token
        await this.rateLimiter.acquire();

        // 取得 auth token
        const token = await this.auth.getToken();

        return ofetch<T>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          query: query
            ? {
                ...query,
                $format: 'JSON',
              }
            : {
                $format: 'JSON',
              },
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        shouldRetry: (error: unknown) => {
          // 處理 FetchError
          if (error instanceof FetchError) {
            const status = error.statusCode ?? error.status;
            if (status) {
              // 401 表示 token 過期，清除快取後重試
              if (status === 401) {
                this.auth.clearCache();
                return true;
              }
              return isRetryableStatus(status);
            }
          }

          // 處理一般 Error（網路錯誤等）
          if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return (
              message.includes('network') ||
              message.includes('timeout') ||
              message.includes('econnreset') ||
              message.includes('socket hang up') ||
              message.includes('fetch failed')
            );
          }

          return false;
        },
      }
    );
  }
}
