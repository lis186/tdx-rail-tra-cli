/**
 * Station Resolver Module
 * 車站名稱解析模組 - 支援 ID、名稱、暱稱、錯別字校正和模糊搜尋
 */

import type { Station, StationResolveResponse } from '../types/station.js';
import { levenshteinDistance, findBestMatch, getTopCandidates } from './fuzzy.js';

// 後綴清單（依長度排序，確保先移除最長的）
const SUFFIXES = ['火車站', '車站', '站'];

export class StationResolver {
  private stations: Station[];
  private stationById: Map<string, Station>;
  private stationByName: Map<string, Station>;
  private nicknames: Record<string, string>;
  private corrections: Record<string, string>;
  private stationNames: string[];

  constructor(
    stations: Station[],
    nicknames: Record<string, string> = {},
    corrections: Record<string, string> = {}
  ) {
    this.stations = stations;
    this.nicknames = nicknames;
    this.corrections = corrections;

    // 建立索引
    this.stationById = new Map();
    this.stationByName = new Map();
    this.stationNames = [];

    for (const station of stations) {
      this.stationById.set(station.id, station);
      this.stationByName.set(station.name, station);
      this.stationNames.push(station.name);
    }
  }

  /**
   * 解析車站名稱或 ID
   */
  resolve(input: string): StationResolveResponse {
    const trimmed = input.trim();

    // 1. 嘗試 ID 查找（純數字）
    if (/^\d+$/.test(trimmed)) {
      const station = this.stationById.get(trimmed);
      if (station) {
        return { success: true, station, confidence: 'exact' };
      }
      // ID 不存在，繼續嘗試其他方式
    }

    // 2. 暱稱對應
    if (this.nicknames[trimmed]) {
      const stationId = this.nicknames[trimmed];
      const station = this.stationById.get(stationId);
      if (station) {
        return { success: true, station, confidence: 'exact' };
      }
    }

    // 3. 移除後綴
    let normalized = trimmed;
    for (const suffix of SUFFIXES) {
      if (normalized.endsWith(suffix)) {
        normalized = normalized.slice(0, -suffix.length);
        break;
      }
    }

    // 4. 錯別字校正
    if (this.corrections[normalized]) {
      normalized = this.corrections[normalized];
    }

    // 5. 精確名稱匹配
    let station = this.stationByName.get(normalized);
    if (station) {
      return { success: true, station, confidence: 'exact' };
    }

    // 6. 台/臺 異體字轉換
    const variants = this.getVariants(normalized);
    for (const variant of variants) {
      station = this.stationByName.get(variant);
      if (station) {
        return { success: true, station, confidence: 'exact' };
      }
    }

    // 7. 模糊搜尋
    const fuzzyResult = findBestMatch(normalized, this.stationNames, 2);
    if (fuzzyResult) {
      const matchedStation = this.stationByName.get(fuzzyResult.match);
      if (matchedStation) {
        return {
          success: true,
          station: matchedStation,
          confidence: fuzzyResult.confidence as 'exact' | 'high' | 'medium',
        };
      }
    }

    // 8. 找不到 - 回傳錯誤和建議
    const candidates = getTopCandidates(normalized, this.stationNames, 5);
    return {
      success: false,
      error: {
        code: 'STATION_NOT_FOUND',
        message: `找不到車站「${input}」`,
        suggestion: candidates.length > 0 ? `您是否要查詢「${candidates[0]}」？` : undefined,
        candidates,
      },
    };
  }

  /**
   * 產生異體字變體（台↔臺）
   */
  private getVariants(input: string): string[] {
    const variants: string[] = [];

    // 台 → 臺
    if (input.includes('台')) {
      variants.push(input.replace(/台/g, '臺'));
    }

    // 臺 → 台
    if (input.includes('臺')) {
      variants.push(input.replace(/臺/g, '台'));
    }

    return variants;
  }

  /**
   * 取得所有車站
   */
  getAllStations(): Station[] {
    return [...this.stations];
  }

  /**
   * 根據 ID 取得車站
   */
  getById(id: string): Station | undefined {
    return this.stationById.get(id);
  }

  /**
   * 搜尋車站（回傳多個結果）
   */
  search(query: string, limit: number = 10): Station[] {
    const candidates = getTopCandidates(query, this.stationNames, limit);
    return candidates
      .map(name => this.stationByName.get(name))
      .filter((s): s is Station => s !== undefined);
  }
}
