/**
 * Journey Command
 * 行程規劃指令 - 支援直達與轉乘
 */

import { Command } from 'commander';
// Removed cli-table3 - using simple dash format for consistency
import { StationResolver } from '../lib/station-resolver.js';
import { getApiClient } from '../lib/api-client.js';
import { TDXApiClient } from '../services/api.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';
import {
  findJourneyOptions,
  sortJourneys,
  getTransferStations,
  TransferTimeResolver,
  type JourneySegment,
  type JourneyOption,
  type TransferLegData,
} from '../lib/journey-planner.js';
import { BranchLineResolver } from '../lib/branch-line.js';
import { StationTimetableMatcher } from '../lib/station-timetable-matcher.js';
import { AlertService, NormalizedAlert } from '../services/alert.js';
import type { DailyTrainTimetable } from '../types/api.js';
import { simplifyTrainType } from '../lib/train-type.js';
import { loggers } from '../services/api.js';

// 支線 Line ID 列表
const BRANCH_LINE_IDS = ['PX', 'SA', 'JJ', 'NW', 'LJ', 'SH'];

// 初始化
const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);

/**
 * 取得今天的日期字串 (YYYY-MM-DD)
 */
function getToday(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * 從 API 回傳的時刻表轉換為 JourneySegment
 */
function timetableToSegment(
  timetable: DailyTrainTimetable,
  fromStationId: string,
  toStationId: string
): JourneySegment | null {
  const fromStop = timetable.StopTimes.find((s) => s.StationID === fromStationId);
  const toStop = timetable.StopTimes.find((s) => s.StationID === toStationId);

  if (!fromStop || !toStop) return null;

  return {
    trainNo: timetable.TrainInfo.TrainNo,
    trainType: simplifyTrainType(timetable.TrainInfo.TrainTypeName.Zh_tw),
    trainTypeCode: timetable.TrainInfo.TrainTypeCode,
    fromStation: fromStationId,
    fromStationName: fromStop.StationName.Zh_tw,
    toStation: toStationId,
    toStationName: toStop.StationName.Zh_tw,
    departure: fromStop.DepartureTime || '',
    arrival: toStop.ArrivalTime || '',
    bikeFlag: timetable.TrainInfo.BikeFlag,
    wheelChairFlag: timetable.TrainInfo.WheelChairFlag,
  };
}

/**
 * 格式化時間長度 (分鐘 -> Xh Ym)
 */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

/**
 * 篩選有效的轉乘站（介於起訖站之間）
 * 使用 station ID 的數值順序來判斷
 * 並支援支線轉乘站
 */
function filterTransferStations(
  fromStationId: string,
  toStationId: string,
  branchLineResolver?: BranchLineResolver
): string[] {
  const candidates = new Set<string>();

  // 1. 原有邏輯：主幹線轉乘站（基於 ID 範圍）
  const allTransfers = getTransferStations();
  const fromId = parseInt(fromStationId, 10);
  const toId = parseInt(toStationId, 10);
  const isNorthbound = fromId > toId;

  for (const stationId of allTransfers) {
    const id = parseInt(stationId, 10);

    // 排除起訖站本身
    if (stationId === fromStationId || stationId === toStationId) {
      continue;
    }

    // 檢查是否在路線上（用 ID 範圍判斷）
    if (isNorthbound) {
      if (id < fromId && id > toId) {
        candidates.add(stationId);
      }
    } else {
      if (id > fromId && id < toId) {
        candidates.add(stationId);
      }
    }
  }

  // 2. 新增：支線轉乘站
  if (branchLineResolver && branchLineResolver.isLoaded()) {
    // 如果起站是支線站，加入其轉乘站
    const fromJunction = branchLineResolver.getJunctionStation(fromStationId);
    if (fromJunction) {
      candidates.add(fromJunction);
    }

    // 如果迄站是支線站，加入其轉乘站
    const toJunction = branchLineResolver.getJunctionStation(toStationId);
    if (toJunction) {
      candidates.add(toJunction);
    }
  }

  return Array.from(candidates);
}

/**
 * 字串填充工具函數
 */
function padEnd(str: string, len: number): string {
  // 計算實際顯示寬度（中文字元算 2）
  let width = 0;
  for (const char of str) {
    width += char.charCodeAt(0) > 127 ? 2 : 1;
  }
  const padding = Math.max(0, len - width);
  return str + ' '.repeat(padding);
}

/**
 * 輸出表格格式 - 使用簡單橫線風格
 */
function printJourneyTable(
  journeys: JourneyOption[],
  fromStation: { name: string },
  toStation: { name: string },
  date: string
): void {
  console.log(`\n行程規劃：${fromStation.name} → ${toStation.name} (${date})\n`);

  if (journeys.length === 0) {
    console.log('沒有找到符合條件的行程');
    return;
  }

  // 定義欄位寬度
  const COL = {
    num: 4,
    route: 50,
    departure: 8,
    arrival: 8,
    duration: 8,
  };

  // 印出表頭
  const header = [
    padEnd('#', COL.num),
    padEnd('行程', COL.route),
    padEnd('出發', COL.departure),
    padEnd('抵達', COL.arrival),
    padEnd('時長', COL.duration),
  ].join('');
  console.log(header);
  console.log('─'.repeat(78));

  journeys.forEach((journey, index) => {
    // 第一行：編號、類型描述、時間資訊
    let typeDesc = '';
    if (journey.type === 'direct') {
      const seg = journey.segments[0];
      typeDesc = `[直達] ${seg.trainNo} ${seg.trainType}`;
    } else {
      typeDesc = `[轉乘] 在${journey.transferStation}轉車 (等${journey.waitTime}分)`;
    }

    const row1 = [
      padEnd(String(index + 1), COL.num),
      padEnd(typeDesc, COL.route),
      padEnd(journey.departure, COL.departure),
      padEnd(journey.arrival, COL.arrival),
      padEnd(formatDuration(journey.totalDuration), COL.duration),
    ].join('');
    console.log(row1);

    // 輸出每個 segment 的詳細資訊
    journey.segments.forEach((seg, i) => {
      const prefix = journey.type === 'direct' ? '  ' : (i === 0 ? '① ' : '② ');
      const segLine = journey.type === 'direct'
        ? `   ${seg.fromStationName} ${seg.departure} → ${seg.toStationName} ${seg.arrival}`
        : `${prefix}${seg.trainNo} ${seg.trainType}`;
      console.log(padEnd('', COL.num) + segLine);

      if (journey.type !== 'direct') {
        const detailLine = `   ${seg.fromStationName} ${seg.departure} → ${seg.toStationName} ${seg.arrival}`;
        console.log(padEnd('', COL.num) + detailLine);
      }
    });

    // 行程之間加分隔線（除了最後一個）
    if (index < journeys.length - 1) {
      console.log('─'.repeat(78));
    }
  });

  console.log(`\n共 ${journeys.length} 個行程方案`);
}

/**
 * 格式化站點停駛錯誤
 */
function formatStationSuspendedError(
  stationName: string,
  alert: NormalizedAlert,
  junctionStation?: string
): {
  code: string;
  message: string;
  alert: {
    id: string;
    title: string;
    description: string;
    alternativeTransport?: string;
  };
  suggestion: string;
} {
  // 找出替代站點建議
  let suggestion = '';
  if (junctionStation) {
    const junctionName = TRA_STATIONS.find((s) => s.id === junctionStation)?.name || junctionStation;
    suggestion = `請改查詢至${junctionName}站，再轉乘公路接駁`;
  } else if (alert.alternativeTransport) {
    suggestion = `替代方案：${alert.alternativeTransport}`;
  } else {
    suggestion = '請改查詢其他路線';
  }

  return {
    code: 'STATION_SUSPENDED',
    message: `${stationName}站目前停駛中`,
    alert: {
      id: alert.id,
      title: alert.title,
      description: alert.description,
      alternativeTransport: alert.alternativeTransport,
    },
    suggestion,
  };
}

/**
 * 格式化 JSON 輸出
 */
function formatJourneysForJson(journeys: JourneyOption[]): object[] {
  return journeys.map((j) => ({
    type: j.type,
    transfers: j.transfers,
    departure: j.departure,
    arrival: j.arrival,
    totalDuration: j.totalDuration,
    totalDurationFormatted: formatDuration(j.totalDuration),
    waitTime: j.waitTime,
    transferStation: j.transferStation || null,
    segments: j.segments.map((s) => ({
      trainNo: s.trainNo,
      trainType: s.trainType,
      from: s.fromStationName,
      to: s.toStationName,
      departure: s.departure,
      arrival: s.arrival,
    })),
  }));
}

/**
 * Hybrid 策略：根據是否為支線站點選擇查詢方式
 * - 主幹線：使用 OD API（快速）
 * - 支線：使用 Station Timetable 比對（支援所有站點）
 */
async function querySegmentsHybrid(
  api: TDXApiClient,
  fromStationId: string,
  toStationId: string,
  fromStationName: string,
  toStationName: string,
  date: string,
  branchLineResolver: BranchLineResolver,
  options: { skipCache?: boolean } = {}
): Promise<JourneySegment[]> {
  const isBranchLineQuery =
    branchLineResolver.isBranchLineStation(fromStationId) ||
    branchLineResolver.isBranchLineStation(toStationId);

  if (!isBranchLineQuery) {
    // 主幹線查詢：使用 OD API
    const timetables = await api.getDailyTimetable(
      fromStationId,
      toStationId,
      date,
      options
    );
    return timetables
      .map((t) => timetableToSegment(t, fromStationId, toStationId))
      .filter((s): s is JourneySegment => s !== null);
  }

  // 支線查詢：使用 Station Timetable 比對
  const [originTimetables, destTimetables] = await Promise.all([
    api.getStationTimetable(fromStationId, date, undefined, options),
    api.getStationTimetable(toStationId, date, undefined, options),
  ]);

  const matcher = new StationTimetableMatcher();
  return matcher.toJourneySegments(
    originTimetables,
    destTimetables,
    fromStationId,
    toStationId,
    fromStationName,
    toStationName
  );
}

export const journeyCommand = new Command('journey')
  .description('行程規劃（含轉乘）')
  .argument('<from>', '起站')
  .argument('<to>', '迄站')
  .option('-d, --date <date>', '日期 (YYYY-MM-DD)')
  .option('--depart-after <time>', '出發時間不早於 (HH:MM)')
  .option('--arrive-by <time>', '抵達時間不晚於 (HH:MM)')
  .option('--max-transfers <n>', '最多轉乘次數', '1')
  .option('--min-transfer-time <min>', '最少轉乘時間（分鐘）', '10')
  .option('--max-wait-time <min>', '最長等待時間（分鐘）', '120')
  .option('--sort <field>', '排序方式：transfers|duration|departure|arrival', 'duration')
  .option('--limit <number>', '限制顯示方案數量', '10')
  .option('--no-cache', '不使用快取')
  .action(async (from, to, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const queryDate = options.date || getToday();
    const minTransferTime = parseInt(options.minTransferTime, 10);
    const maxWaitTime = parseInt(options.maxWaitTime, 10);
    const maxTransfers = parseInt(options.maxTransfers, 10);
    const limit = parseInt(options.limit, 10);

    // 解析車站
    const fromResult = resolver.resolve(from);
    if (!fromResult.success) {
      if (format === 'json') {
        console.log(JSON.stringify({ success: false, error: fromResult.error }));
      } else {
        console.error(`錯誤：無法解析起站「${from}」`);
        if (fromResult.error.suggestion) {
          console.error(`建議：${fromResult.error.suggestion}`);
        }
      }
      process.exit(1);
    }

    const toResult = resolver.resolve(to);
    if (!toResult.success) {
      if (format === 'json') {
        console.log(JSON.stringify({ success: false, error: toResult.error }));
      } else {
        console.error(`錯誤：無法解析迄站「${to}」`);
        if (toResult.error.suggestion) {
          console.error(`建議：${toResult.error.suggestion}`);
        }
      }
      process.exit(1);
    }

    const fromStation = fromResult.station;
    const toStation = toResult.station;

    try {
      const api = getApiClient();

      // Step 0: 載入轉乘資料（用於動態計算最少轉乘時間和支線判斷）
      const transferTimeResolver = new TransferTimeResolver();
      const branchLineResolver = new BranchLineResolver();
      try {
        const lineTransfers = await api.getLineTransfers({ skipCache: !options.cache });
        transferTimeResolver.load(lineTransfers);

        // 載入支線車站資料（用於判斷支線站點的轉乘站）
        const stationOfLines = await api.getMultipleStationsOfLine(
          BRANCH_LINE_IDS,
          { skipCache: !options.cache }
        );
        branchLineResolver.load(lineTransfers, stationOfLines);
      } catch (err) {
        loggers.api.debug('支線/轉乘資料載入失敗，使用預設值', { error: err instanceof Error ? err.message : String(err) });
      }

      // Step 0.5: 檢查站點是否停駛
      const alertService = new AlertService(api);
      const suspendedStations = await alertService.checkStations([fromStation.id, toStation.id]);

      if (suspendedStations.size > 0) {
        // 檢查起站
        const fromAlert = suspendedStations.get(fromStation.id);
        if (fromAlert) {
          const junctionStation = branchLineResolver.getJunctionStation(fromStation.id);
          const error = formatStationSuspendedError(fromStation.name, fromAlert, junctionStation ?? undefined);
          if (format === 'json') {
            console.log(JSON.stringify({ success: false, error }));
          } else {
            console.error(`🚫 ${error.message}`);
            console.error(`   ${error.alert.description.trim()}`);
            console.error(`   💡 ${error.suggestion}`);
          }
          process.exit(1);
        }

        // 檢查迄站
        const toAlert = suspendedStations.get(toStation.id);
        if (toAlert) {
          const junctionStation = branchLineResolver.getJunctionStation(toStation.id);
          const error = formatStationSuspendedError(toStation.name, toAlert, junctionStation ?? undefined);
          if (format === 'json') {
            console.log(JSON.stringify({ success: false, error }));
          } else {
            console.error(`🚫 ${error.message}`);
            console.error(`   ${error.alert.description.trim()}`);
            console.error(`   💡 ${error.suggestion}`);
          }
          process.exit(1);
        }
      }

      // Step 1: 查詢直達車（使用 Hybrid 策略支援支線）
      const directSegments = await querySegmentsHybrid(
        api,
        fromStation.id,
        toStation.id,
        fromStation.name,
        toStation.name,
        queryDate,
        branchLineResolver,
        { skipCache: !options.cache }
      );

      // Step 2: 查詢轉乘方案（如果需要）
      const transferLegs: TransferLegData[] = [];

      if (maxTransfers >= 1) {
        // 篩選可能的轉乘站
        const potentialTransfers = filterTransferStations(fromStation.id, toStation.id, branchLineResolver);

        // 限制查詢的轉乘站數量（避免過多 API 呼叫）
        const transferStationsToQuery = potentialTransfers.slice(0, 3);

        // 🔧 P2 改善：外層並行查詢所有轉乘站（而非順序執行）
        const transferQueries = transferStationsToQuery.map(async (transferStationId) => {
          const transferStation = TRA_STATIONS.find((s) => s.id === transferStationId);
          if (!transferStation) return null;

          try {
            // 內層並行：每個轉乘站的兩段同時查詢
            const [firstLegSegments, secondLegSegments] = await Promise.all([
              querySegmentsHybrid(
                api,
                fromStation.id,
                transferStationId,
                fromStation.name,
                transferStation.name,
                queryDate,
                branchLineResolver,
                { skipCache: !options.cache }
              ),
              querySegmentsHybrid(
                api,
                transferStationId,
                toStation.id,
                transferStation.name,
                toStation.name,
                queryDate,
                branchLineResolver,
                { skipCache: !options.cache }
              ),
            ]);

            if (firstLegSegments.length > 0 && secondLegSegments.length > 0) {
              return {
                transferStation: transferStationId,
                firstLeg: firstLegSegments,
                secondLeg: secondLegSegments,
              };
            }
            return null;
          } catch {
            // 忽略單一轉乘站查詢失敗
            return null;
          }
        });

        // 等待所有查詢完成
        const transferResults = await Promise.all(transferQueries);

        // 過濾有效結果並添加到 transferLegs
        transferLegs.push(
          ...transferResults.filter((r): r is TransferLegData => r !== null)
        );
      }

      // Step 3: 組合所有行程方案
      // 如果使用者沒有指定 --min-transfer-time，使用 resolver 的動態值
      // 否則使用使用者指定的值（作為強制覆蓋）
      const useResolver = options.minTransferTime === '10'; // 預設值表示使用者沒有指定
      let journeys = findJourneyOptions(directSegments, transferLegs, {
        minTransferTime,
        maxTransferTime: maxWaitTime,
        transferTimeResolver: useResolver ? transferTimeResolver : undefined,
      });

      // 過濾時間條件
      if (options.departAfter) {
        journeys = journeys.filter((j) => j.departure >= options.departAfter);
      }
      if (options.arriveBy) {
        journeys = journeys.filter((j) => j.arrival <= options.arriveBy);
      }

      // 排序
      const sortField = options.sort as 'transfers' | 'duration' | 'departure' | 'arrival';
      journeys = sortJourneys(journeys, sortField);

      // 限制數量
      if (limit > 0 && journeys.length > limit) {
        journeys = journeys.slice(0, limit);
      }

      // 輸出
      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          query: {
            from: fromStation,
            to: toStation,
            date: queryDate,
            options: {
              departAfter: options.departAfter,
              arriveBy: options.arriveBy,
              maxTransfers,
              minTransferTime,
              sort: options.sort,
            },
          },
          count: journeys.length,
          journeys: formatJourneysForJson(journeys),
        }, null, 2));
      } else {
        printJourneyTable(journeys, fromStation, toStation, queryDate);
      }
    } catch (error) {
      if (format === 'json') {
        console.log(JSON.stringify({
          success: false,
          error: {
            code: 'API_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
        }));
      } else {
        console.error(`查詢失敗：${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(1);
    }
  });
