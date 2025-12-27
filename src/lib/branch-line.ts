/**
 * Branch Line Detection Module
 * 支線判斷模組 - 識別支線站點並提供轉乘站資訊
 */

import type { LineTransfer, StationOfLine } from '../types/api.js';

/**
 * 支線資訊
 */
export interface BranchLineInfo {
  lineId: string; // 路線 ID (e.g., 'PX', 'JJ')
  lineName: string; // 路線名稱 (e.g., '平溪線')
  junctionStationId: string; // 轉乘站 ID
  junctionStationName: string; // 轉乘站名稱
}

/**
 * 支線判斷器
 * 使用 LineTransfer 和 StationOfLine API 資料識別支線站點
 */
export class BranchLineResolver {
  // 站點 ID → 支線資訊
  private stationToBranchLine: Map<string, BranchLineInfo> = new Map();

  // 轉乘站 ID Set（用於快速查詢）
  private junctionStations: Set<string> = new Set();

  // 是否已載入資料
  private loaded: boolean = false;

  /**
   * 載入資料
   * @param lineTransfers - LineTransfer API 回傳的轉乘資料
   * @param stationOfLines - StationOfLine API 回傳的路線站點資料
   */
  load(lineTransfers: LineTransfer[], stationOfLines: StationOfLine[]): void {
    this.stationToBranchLine.clear();
    this.junctionStations.clear();

    // 主幹線 ID 列表
    const mainLines = new Set(['WL', 'WL-C', 'EL', 'SL', 'SU']);

    // Step 1: 從 LineTransfer 識別支線轉乘點
    // 結構: { lineId: { junctionStationId, junctionStationName, lineName } }
    const branchLineJunctions: Map<
      string,
      { junctionStationId: string; junctionStationName: string; lineName: string }
    > = new Map();

    for (const transfer of lineTransfers) {
      // 找出支線（非主幹線的那一方）
      let branchLineId: string;
      let branchLineName: string;
      let junctionStationId: string;
      let junctionStationName: string;

      if (mainLines.has(transfer.FromLineID) && !mainLines.has(transfer.ToLineID)) {
        // From 是主幹線，To 是支線
        branchLineId = transfer.ToLineID;
        branchLineName = transfer.ToLineName.Zh_tw;
        junctionStationId = transfer.ToStationID;
        junctionStationName = transfer.ToStationName.Zh_tw;
      } else if (!mainLines.has(transfer.FromLineID) && mainLines.has(transfer.ToLineID)) {
        // From 是支線，To 是主幹線
        branchLineId = transfer.FromLineID;
        branchLineName = transfer.FromLineName.Zh_tw;
        junctionStationId = transfer.FromStationID;
        junctionStationName = transfer.FromStationName.Zh_tw;
      } else if (!mainLines.has(transfer.FromLineID) && !mainLines.has(transfer.ToLineID)) {
        // 兩個都是支線（例如內灣線↔六家線）
        // 優先選擇較短的作為「附屬支線」
        // 對於 NW↔LJ，LJ (六家線) 較短，所以 LJ 以 NW 的竹中為轉乘站
        branchLineId = transfer.ToLineID;
        branchLineName = transfer.ToLineName.Zh_tw;
        junctionStationId = transfer.ToStationID;
        junctionStationName = transfer.ToStationName.Zh_tw;
      } else {
        // 兩個都是主幹線，跳過
        continue;
      }

      // 記錄轉乘點
      if (!branchLineJunctions.has(branchLineId)) {
        branchLineJunctions.set(branchLineId, {
          junctionStationId,
          junctionStationName,
          lineName: branchLineName,
        });
      }

      // 加入轉乘站集合
      this.junctionStations.add(junctionStationId);
    }

    // Step 2: 從 StationOfLine 取得支線所有站點
    for (const sol of stationOfLines) {
      const junctionInfo = branchLineJunctions.get(sol.LineID);
      if (!junctionInfo) continue;

      // 將每個站點對應到支線資訊
      for (const station of sol.Stations) {
        // 跳過轉乘站本身（不需要再轉乘）
        if (station.StationID === junctionInfo.junctionStationId) {
          continue;
        }

        this.stationToBranchLine.set(station.StationID, {
          lineId: sol.LineID,
          lineName: junctionInfo.lineName,
          junctionStationId: junctionInfo.junctionStationId,
          junctionStationName: junctionInfo.junctionStationName,
        });
      }
    }

    this.loaded = true;
  }

  /**
   * 檢查是否已載入資料
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * 判斷站點是否在支線上
   * @param stationId - 站點 ID
   * @returns 是否為支線站點
   */
  isBranchLineStation(stationId: string): boolean {
    if (!this.loaded) return false;
    return this.stationToBranchLine.has(stationId);
  }

  /**
   * 取得支線站點的轉乘站
   * @param stationId - 站點 ID
   * @returns 轉乘站 ID，若非支線站點則回傳 null
   */
  getJunctionStation(stationId: string): string | null {
    if (!this.loaded) return null;

    const info = this.stationToBranchLine.get(stationId);
    return info?.junctionStationId ?? null;
  }

  /**
   * 取得支線站點的完整資訊
   * @param stationId - 站點 ID
   * @returns 支線資訊，若非支線站點則回傳 null
   */
  getBranchLineInfo(stationId: string): BranchLineInfo | null {
    if (!this.loaded) return null;
    return this.stationToBranchLine.get(stationId) ?? null;
  }

  /**
   * 取得所有轉乘站 ID
   * @returns 轉乘站 ID 陣列
   */
  getAllJunctionStations(): string[] {
    return Array.from(this.junctionStations);
  }
}
