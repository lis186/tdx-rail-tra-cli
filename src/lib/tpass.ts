/**
 * TPASS Eligibility Module
 * TPASS 月票適用性判斷模組
 */

import {
  TPASS_REGIONS,
  TPASS_EXCLUDED_TRAIN_KEYWORDS,
  type TpassRegion,
} from '../data/tpass-regions.js';

export { TpassRegion };

export interface TpassCheckResult {
  eligible: boolean;
  regions?: TpassRegion[];
  reason?: 'CROSS_REGION' | 'NO_REGION';
  from?: {
    stationId: string;
    stationName?: string;
    regions: string[];
  };
  to?: {
    stationId: string;
    stationName?: string;
    regions: string[];
  };
  suggestion?: string;
}

/**
 * Check if a train type is eligible for TPASS
 * 檢查車種是否適用 TPASS
 *
 * @param trainTypeName - TrainTypeName.Zh_tw from API
 * @returns true if eligible for TPASS
 */
export function isTpassEligibleTrainType(trainTypeName: string): boolean {
  const upperName = trainTypeName.toUpperCase();
  return !TPASS_EXCLUDED_TRAIN_KEYWORDS.some((kw) =>
    upperName.includes(kw.toUpperCase())
  );
}

/**
 * Get regions that contain a specific station
 * 取得車站所屬的生活圈列表
 *
 * @param stationId - Station ID
 * @returns Array of regions containing this station
 */
export function getStationRegions(stationId: string): TpassRegion[] {
  return TPASS_REGIONS.filter((region) =>
    region.stationIds.includes(stationId)
  );
}

/**
 * Get common regions between two stations
 * 取得起訖站共同的生活圈
 *
 * @param fromId - Origin station ID
 * @param toId - Destination station ID
 * @returns Array of common regions (empty if cross-region)
 */
export function getCommonRegions(fromId: string, toId: string): TpassRegion[] {
  const fromRegions = getStationRegions(fromId);
  const toRegions = getStationRegions(toId);

  return fromRegions.filter((fr) =>
    toRegions.some((tr) => tr.id === fr.id)
  );
}

/**
 * Check TPASS eligibility for an OD pair
 * 檢查起訖站 TPASS 適用性
 *
 * @param fromId - Origin station ID
 * @param toId - Destination station ID
 * @param fromName - Optional origin station name for display
 * @param toName - Optional destination station name for display
 * @returns TpassCheckResult
 */
export function checkTpassEligibility(
  fromId: string,
  toId: string,
  fromName?: string,
  toName?: string
): TpassCheckResult {
  const fromRegions = getStationRegions(fromId);
  const toRegions = getStationRegions(toId);

  // Check if either station has no TPASS coverage
  if (fromRegions.length === 0 || toRegions.length === 0) {
    return {
      eligible: false,
      reason: 'NO_REGION',
      from: {
        stationId: fromId,
        stationName: fromName,
        regions: fromRegions.map((r) => r.name),
      },
      to: {
        stationId: toId,
        stationName: toName,
        regions: toRegions.map((r) => r.name),
      },
      suggestion:
        fromRegions.length === 0
          ? `${fromName || fromId} 不在 TPASS 生活圈範圍內`
          : `${toName || toId} 不在 TPASS 生活圈範圍內`,
    };
  }

  // Find common regions
  const commonRegions = getCommonRegions(fromId, toId);

  if (commonRegions.length === 0) {
    return {
      eligible: false,
      reason: 'CROSS_REGION',
      from: {
        stationId: fromId,
        stationName: fromName,
        regions: fromRegions.map((r) => r.name),
      },
      to: {
        stationId: toId,
        stationName: toName,
        regions: toRegions.map((r) => r.name),
      },
      suggestion: `${fromName || fromId}與${toName || toId}分屬不同生活圈，無法使用同一張 TPASS`,
    };
  }

  return {
    eligible: true,
    regions: commonRegions,
  };
}

/**
 * Get all TPASS regions
 * 取得所有 TPASS 生活圈
 */
export function getAllRegions(): TpassRegion[] {
  return TPASS_REGIONS;
}

/**
 * Get a specific region by ID
 * 取得特定生活圈
 */
export function getRegionById(regionId: string): TpassRegion | undefined {
  return TPASS_REGIONS.find((r) => r.id === regionId);
}

/**
 * Get a region by name (partial match)
 * 依名稱取得生活圈（支援部分匹配）
 */
export function getRegionByName(name: string): TpassRegion | undefined {
  const normalizedName = name.toLowerCase();
  return TPASS_REGIONS.find(
    (r) =>
      r.name.toLowerCase().includes(normalizedName) ||
      r.id.toLowerCase().includes(normalizedName)
  );
}

/**
 * Get eligible train type descriptions
 * 取得適用車種說明
 */
export function getEligibleTrainTypes(): string[] {
  return [
    '區間車',
    '區間快',
    '莒光號',
    '復興號',
    '自強號（非 EMU3000）',
  ];
}

/**
 * Get excluded train type descriptions
 * 取得不適用車種說明
 */
export function getExcludedTrainTypes(): string[] {
  return [
    'EMU3000 型自強號',
    '普悠瑪',
    '太魯閣',
    '觀光列車（藍皮解憂號、鳴日號等）',
    '團體列車',
    '商務專開列車',
  ];
}
