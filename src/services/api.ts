/**
 * TDX API Client
 * TDX API 客戶端 - 處理 TRA 相關 API 請求
 */

import { ofetch } from 'ofetch';
import { AuthService } from './auth.js';
import { CacheService } from './cache.js';
import type {
  DailyTrainTimetable,
  GeneralTrainTimetable,
  TrainLiveBoard,
  TrainDelay,
  ODFare,
} from '../types/api.js';

const API_BASE = 'https://tdx.transportdata.tw/api/basic';

// 快取 TTL 設定 (毫秒)
const CACHE_TTL = {
  TIMETABLE: 4 * 60 * 60 * 1000, // 4 小時
  FARE: 7 * 24 * 60 * 60 * 1000, // 7 天（票價不常變動）
};

export interface ApiOptions {
  skipCache?: boolean;
}

export class TDXApiClient {
  private auth: AuthService;
  private cache: CacheService;

  constructor(clientId: string, clientSecret: string) {
    this.auth = new AuthService(clientId, clientSecret);
    this.cache = new CacheService();
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
    const result = await this.request<DailyTrainTimetable[]>(url);

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
    const result = await this.request<GeneralTrainTimetable[]>(url);

    if (result.length === 0) {
      return null;
    }

    // 儲存快取
    this.cache.set(cacheKey, result[0], CACHE_TTL.TIMETABLE);

    return result[0];
  }

  /**
   * 取得車次即時位置
   * 注意：即時資料不快取
   */
  async getTrainLiveBoard(trainNo: string): Promise<TrainLiveBoard | null> {
    const url = `${API_BASE}/v3/Rail/TRA/TrainLiveBoard/TrainNo/${trainNo}`;
    const result = await this.request<TrainLiveBoard[]>(url);

    if (result.length === 0) {
      return null;
    }

    // 即時資料不快取
    return result[0];
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
    const result = await this.request<ODFare[]>(url);

    if (result.length === 0) {
      return null;
    }

    // 儲存快取
    this.cache.set(cacheKey, result[0], CACHE_TTL.FARE);

    return result[0];
  }

  /**
   * 清除快取
   */
  clearCache(prefix?: string): void {
    this.cache.clear(prefix);
  }

  /**
   * 發送帶認證的 API 請求
   */
  private async request<T>(url: string, query?: Record<string, string>): Promise<T> {
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
  }
}
