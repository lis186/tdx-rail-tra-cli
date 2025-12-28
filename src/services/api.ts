/**
 * TDX API Client
 * TDX API 客戶端 - 處理 TRA 相關 API 請求
 */

import { ofetch, FetchError } from 'ofetch';
import { AuthService } from './auth.js';
import { CacheService } from './cache.js';
import { RateLimiter } from './rate-limiter.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { retry, isRetryableStatus } from './retry.js';
import { loggers } from '../lib/logger.js';
import * as metrics from '../lib/metrics.js';
import { ApiKeyPool } from './api-key-pool.js';
import type { ApiKeyCredential, ApiKeySlotMetrics } from '../types/api-key.js';
// 🔧 P2 改善：導出 Prometheus 指標
export { getMetricsSnapshot, getMetricsContentType } from '../lib/metrics.js';
// 🔧 P1 改善：導出新的重試策略 (可選使用)
export { retryWithExponentialBackoff, createApiRetryOptions, defaultShouldRetry } from '../lib/retry-strategy.js';
export type { RetryOptions, RetryStatistics } from '../lib/retry-strategy.js';
// 🔧 P1 改善：導出日誌系統 (結構化日誌)
export { loggers, StructuredLogger, createRequestContext, generateSpanId } from '../lib/logger.js';
export type { LogContext, LogEntry, LogLevel } from '../lib/logger.js';
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
  private pool: ApiKeyPool;
  private cache: CacheService;
  private circuitBreaker: CircuitBreaker;

  // 向後相容的舊屬性（deprecated，僅用於測試）
  private auth?: AuthService;
  private rateLimiter?: RateLimiter;

  /**
   * 建構 TDX API 客戶端
   * @param credentialsOrPool - 單一憑證（向後相容）、憑證陣列或 ApiKeyPool
   * @param clientSecret - 單一憑證的 secret（向後相容）
   */
  constructor(
    credentialsOrPool: string | ApiKeyCredential[] | ApiKeyPool,
    clientSecret?: string
  ) {
    // 建立 ApiKeyPool
    if (credentialsOrPool instanceof ApiKeyPool) {
      // 已經是 Pool
      this.pool = credentialsOrPool;
    } else if (typeof credentialsOrPool === 'string' && clientSecret) {
      // 向後相容：單一 Key
      this.pool = new ApiKeyPool([{
        clientId: credentialsOrPool,
        clientSecret,
        label: 'default',
      }]);
    } else if (Array.isArray(credentialsOrPool)) {
      // 憑證陣列
      this.pool = new ApiKeyPool(credentialsOrPool);
    } else {
      throw new Error('Invalid credentials provided to TDXApiClient');
    }

    this.cache = new CacheService();

    // 🔧 初始化 Circuit Breaker (P1 改善)
    this.circuitBreaker = new CircuitBreaker('TDX-API', {
      failureThreshold: 5,      // 5 次失敗後開啟
      successThreshold: 2,      // 2 次成功後關閉
      timeout: 60000,           // 60 秒後嘗試恢復
      shouldRetry: (error: Error) => {
        // 只重試暫時性錯誤
        const code = (error as any).code || (error as any).status;
        return code === 'ECONNREFUSED' ||
               code === 'ETIMEDOUT' ||
               code === 'ENOTFOUND' ||
               code === 429 ||  // Too Many Requests
               code === 502 ||  // Bad Gateway
               code === 503 ||  // Service Unavailable
               code === 504;    // Gateway Timeout
      }
    });
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
    // 🔧 P2 改善：並行查詢所有支線（而非順序執行）
    const promises = lineIds.map((lineId) =>
      this.getStationsOfLine(lineId, options)
        .then((result) => ({ status: 'fulfilled' as const, value: result }))
        .catch(() => ({ status: 'rejected' as const, reason: null }))
    );

    const settled = await Promise.all(promises);

    // 過濾成功結果
    return settled
      .filter((r) => r.status === 'fulfilled' && r.value !== null)
      .map((r) => (r as { status: 'fulfilled'; value: StationOfLine }).value);
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
   * 包含 Circuit Breaker、Rate Limiting、Retry 和 Logging 機制 (P1 改善)
   * 🔧 Multi-Key 改善：使用 ApiKeyPool 選擇最佳 Slot
   */
  private async request<T>(url: string, query?: Record<string, string>): Promise<T> {
    const startTime = Date.now();
    const requestId = loggers.api.getCurrentRequestId();

    // 🔧 取得最佳可用 Slot
    const slot = this.pool.getSlot();
    const slotId = slot.id;

    loggers.api.debug('API request started', {
      requestId,
      url,
      query,
      slotId,
    });

    try {
      // 🔧 使用 Circuit Breaker 保護 API 請求 (P1 改善)
      const result = await this.circuitBreaker.execute(() =>
        // 使用 retry 包裝請求，處理暫時性錯誤
        retry(
          async () => {
            // 🔧 使用 Slot 的 RateLimiter
            await slot.getRateLimiter().acquire();

            // 🔧 使用 Slot 的 AuthService
            const token = await slot.getAuthService().getToken();

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
                    slot.getAuthService().clearCache();
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
        )
      );

      // 🔧 記錄成功
      slot.recordSuccess();

      const duration = Date.now() - startTime;
      loggers.api.info('API request completed', {
        requestId,
        url,
        duration,
        statusCode: 200,
        slotId,
      });

      // 🔧 記錄 Prometheus 指標 (P2 改善)
      metrics.recordApiRequest(
        'GET',
        this.extractEndpointFromUrl(url),
        200,
        duration
      );

      return result;
    } catch (error) {
      // 🔧 記錄失敗
      slot.recordFailure(error instanceof Error ? error : new Error(String(error)));

      const duration = Date.now() - startTime;
      const statusCode = (error as any)?.statusCode || (error as any)?.status || 500;

      loggers.api.error(
        'API request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          url,
          duration,
          statusCode,
          slotId,
        }
      );

      // 🔧 記錄 Prometheus 指標 (P2 改善)
      metrics.recordApiRequest(
        'GET',
        this.extractEndpointFromUrl(url),
        statusCode,
        duration
      );

      throw error;
    }
  }

  /**
   * 取得 Circuit Breaker 狀態（用於監控）
   */
  getCircuitBreakerMetrics() {
    return this.circuitBreaker.getMetrics();
  }

  /**
   * 取得 Circuit Breaker 當前狀態（用於健康檢查）
   */
  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }

  /**
   * 取得所有內部服務實例（用於健康檢查）
   */
  getInternalServices() {
    return {
      pool: this.pool,
      cache: this.cache,
      circuitBreaker: this.circuitBreaker
    };
  }

  /**
   * 🔧 取得 API Key Pool 指標（用於監控）
   */
  getPoolMetrics(): ApiKeySlotMetrics[] {
    return this.pool.getMetrics();
  }

  /**
   * 🔧 取得 Pool 總容量
   */
  getPoolCapacity(): { available: number; max: number } {
    return this.pool.getTotalCapacity();
  }

  /**
   * 🔧 檢查是否有多組 Key
   */
  hasMultipleKeys(): boolean {
    return this.pool.getSlotCount() > 1;
  }

  /**
   * 發送 MAAS API 請求（不使用 OData $format 參數）
   * MAAS API 使用不同的格式，不支援 TDX 標準的 $format=JSON
   */
  private async maasRequest<T>(url: string, query?: Record<string, string>): Promise<T> {
    // 取得最佳可用 Slot
    const slot = this.pool.getSlot();
    if (!slot) {
      throw new Error('No available API key slots');
    }

    try {
      const result = await this.circuitBreaker.execute(async () => {
        const token = await slot.auth.getToken();
        return ofetch<T>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          query: query,
        });
      });

      // 記錄成功
      slot.recordSuccess();

      return result;
    } catch (error) {
      // 記錄失敗
      slot.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 取得網頁訂票連結 (透過 TDX Booking Deeplink API)
   *
   * 注意：此 API 需要 TDX MAAS 訂閱權限
   * 若帳號無權限會返回 403，此時會使用 fallback 連結
   */
  async getBookingWebUrl(params: {
    startStation: string;
    endStation: string;
    date: string;
    trainNumber: string;
    ticketType: number;
    ticketCount: number;
  }): Promise<{ url: string }> {
    const MAAS_API_BASE = 'https://tdx.transportdata.tw/api/maas-tra';
    const url = `${MAAS_API_BASE}/booking/deeplink/web/tra`;

    const query = {
      start_station: params.startStation,
      end_station: params.endStation,
      departure_date: params.date,
      departure_number: params.trainNumber,
      ticket_type: String(params.ticketType),
      ticket_count: String(params.ticketCount),
    };

    // MAAS API 回應格式: { result: "success", data: { url: "..." } }
    const response = await this.maasRequest<{ result: string; data: { url: string } }>(url, query);
    return { url: response.data.url };
  }

  /**
   * 取得 APP 深度連結 (透過 TDX Booking Deeplink API)
   *
   * 注意：此 API 需要 TDX MAAS 訂閱權限
   * 若帳號無權限會返回 403，此時會使用 fallback 連結
   */
  async getBookingDeeplink(params: {
    startStation: string;
    endStation: string;
    date: string;
    trainNumber: string;
  }): Promise<{ url: string }> {
    const MAAS_API_BASE = 'https://tdx.transportdata.tw/api/maas-tra';
    const url = `${MAAS_API_BASE}/booking/deeplink/direct/tra`;

    const query = {
      start_station: params.startStation,
      end_station: params.endStation,
      train_date: params.date,
      train_number: params.trainNumber,
    };

    // MAAS API 回應格式: { result: "success", data: { url: "..." } }
    const response = await this.maasRequest<{ result: string; data: { url: string } }>(url, query);
    return { url: response.data.url };
  }

  /**
   * 從 URL 中提取端點路徑（用於指標標籤）
   */
  private extractEndpointFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // 簡化路徑：去掉版本號，保留主要端點
      // 例：/api/basic/v3/Rail/TRA/Station → /Rail/TRA/Station
      return pathname
        .replace(/^\/api\/basic\/v\d+\//, '/')
        .replace(/\/\d+$/, '') // 去掉 ID
        .substring(0, 50); // 限制長度
    } catch {
      return '/unknown';
    }
  }
}
