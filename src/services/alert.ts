/**
 * Alert Service
 * 阻通資訊服務 - 提供停駛狀態查詢
 */

import type { Alert } from '../types/api.js';
import type { TDXApiClient } from './api.js';

/**
 * 正規化後的阻通資訊
 */
export interface NormalizedAlert {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'resolved';
  affectedStationIds: Set<string>;
  affectedLineIds: Set<string>;
  affectedStationNames: Map<string, string>; // stationId -> name
  affectedLineNames: Map<string, string>; // lineId -> name
  alternativeTransport?: string;
}

export interface AlertServiceOptions {
  forceRefresh?: boolean;
}

/**
 * AlertService
 * 提供阻通資訊查詢和站點/路線停駛狀態檢查
 */
export class AlertService {
  private apiClient: TDXApiClient;
  private cache: NormalizedAlert[] | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour (in-memory cache)

  constructor(apiClient: TDXApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * 取得所有進行中的阻通資訊
   */
  async getActiveAlerts(options: AlertServiceOptions = {}): Promise<NormalizedAlert[]> {
    // 檢查 in-memory cache
    if (!options.forceRefresh && this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }

    // 從 API 取得資料
    const rawAlerts = await this.apiClient.getAlerts({
      skipCache: options.forceRefresh,
    });

    // 正規化並過濾只保留 active 狀態
    const normalizedAlerts = rawAlerts
      .filter((alert) => alert.Status === 2) // 2 = active
      .map((alert) => this.normalizeAlert(alert));

    // 更新快取
    this.cache = normalizedAlerts;
    this.cacheTime = Date.now();

    return normalizedAlerts;
  }

  /**
   * 檢查站點是否停駛
   * @returns 若停駛返回 Alert，否則返回 null
   */
  async isStationSuspended(stationId: string): Promise<NormalizedAlert | null> {
    const alerts = await this.getActiveAlerts();

    for (const alert of alerts) {
      if (alert.affectedStationIds.has(stationId)) {
        return alert;
      }
    }

    return null;
  }

  /**
   * 批次檢查多個站點
   * @returns 受影響的 Alerts（去重）
   */
  async checkStations(stationIds: string[]): Promise<NormalizedAlert[]> {
    const alerts = await this.getActiveAlerts();
    const affectedAlerts: NormalizedAlert[] = [];
    const seenAlertIds = new Set<string>();

    for (const stationId of stationIds) {
      for (const alert of alerts) {
        if (alert.affectedStationIds.has(stationId) && !seenAlertIds.has(alert.id)) {
          affectedAlerts.push(alert);
          seenAlertIds.add(alert.id);
        }
      }
    }

    return affectedAlerts;
  }

  /**
   * 檢查路線是否停駛
   * @returns 若停駛返回 Alert，否則返回 null
   */
  async isLineSuspended(lineId: string): Promise<NormalizedAlert | null> {
    const alerts = await this.getActiveAlerts();

    for (const alert of alerts) {
      if (alert.affectedLineIds.has(lineId)) {
        return alert;
      }
    }

    return null;
  }

  /**
   * 正規化 Alert 資料
   */
  private normalizeAlert(alert: Alert): NormalizedAlert {
    const affectedStationIds = new Set<string>();
    const affectedStationNames = new Map<string, string>();
    const affectedLineIds = new Set<string>();
    const affectedLineNames = new Map<string, string>();

    // 處理站點
    for (const station of alert.Scope?.Stations ?? []) {
      affectedStationIds.add(station.StationID);
      affectedStationNames.set(station.StationID, station.StationName);
    }

    // 處理路線
    for (const line of alert.Scope?.Lines ?? []) {
      if (line.LineID) {
        affectedLineIds.add(line.LineID);
        affectedLineNames.set(line.LineID, line.LineName);
      }
    }

    // 解析替代交通方式
    const alternativeTransport = this.parseAlternativeTransport(alert.Description);

    return {
      id: alert.AlertID,
      title: alert.Title,
      description: alert.Description,
      status: alert.Status === 2 ? 'active' : 'resolved',
      affectedStationIds,
      affectedLineIds,
      affectedStationNames,
      affectedLineNames,
      alternativeTransport,
    };
  }

  /**
   * 從描述中解析替代交通方式
   */
  private parseAlternativeTransport(description: string): string | undefined {
    // 常見模式：「XX=XX間公路接駁」或「XX至XX站公路接駁」
    const patterns = [
      /[\u4e00-\u9fff]+=[\u4e00-\u9fff]+間公路接駁/,
      /[\u4e00-\u9fff]+至[\u4e00-\u9fff]+站?公路接駁[^\u3002]*/,
      /公路接駁[^\u3002]*/,
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return undefined;
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    this.cache = null;
    this.cacheTime = 0;
  }
}
