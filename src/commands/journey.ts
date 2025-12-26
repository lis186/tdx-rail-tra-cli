/**
 * Journey Command
 * 行程規劃指令 - 支援直達與轉乘
 */

import { Command } from 'commander';
import Table from 'cli-table3';
import { StationResolver } from '../lib/station-resolver.js';
import { TDXApiClient } from '../services/api.js';
import { ConfigService } from '../services/config.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';
import {
  findJourneyOptions,
  sortJourneys,
  getTransferStations,
  type JourneySegment,
  type JourneyOption,
  type TransferLegData,
} from '../lib/journey-planner.js';
import type { DailyTrainTimetable } from '../types/api.js';

// 初始化
const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);
const config = new ConfigService();

/**
 * 取得今天的日期字串 (YYYY-MM-DD)
 */
function getToday(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * 取得 API 客戶端
 */
function getApiClient(): TDXApiClient {
  const clientId = config.getClientId();
  const clientSecret = config.getClientSecret();

  if (!clientId || !clientSecret) {
    console.error('錯誤：尚未設定 TDX API 憑證');
    console.error('請設定環境變數 TDX_CLIENT_ID 和 TDX_CLIENT_SECRET');
    console.error('或執行 tra config init 進行設定');
    process.exit(1);
  }

  return new TDXApiClient(clientId, clientSecret);
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
    trainType: timetable.TrainInfo.TrainTypeName.Zh_tw,
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
 */
function filterTransferStations(
  fromStationId: string,
  toStationId: string
): string[] {
  const allTransfers = getTransferStations();
  const fromId = parseInt(fromStationId, 10);
  const toId = parseInt(toStationId, 10);

  // 判斷方向
  const isNorthbound = fromId > toId;

  // 篩選介於起訖站之間的轉乘站
  return allTransfers.filter((stationId) => {
    const id = parseInt(stationId, 10);

    // 排除起訖站本身
    if (stationId === fromStationId || stationId === toStationId) {
      return false;
    }

    // 檢查是否在路線上（簡化邏輯：用 ID 範圍判斷）
    if (isNorthbound) {
      return id < fromId && id > toId;
    } else {
      return id > fromId && id < toId;
    }
  });
}

/**
 * 輸出表格格式
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

  // 使用更詳細的表格格式
  const table = new Table({
    head: ['#', '行程', '出發', '抵達', '時長'],
    style: { head: ['cyan'] },
    colWidths: [4, 50, 8, 8, 8],
    wordWrap: true,
  });

  journeys.forEach((journey, index) => {
    // 構建行程描述
    let routeDesc = '';

    if (journey.type === 'direct') {
      const seg = journey.segments[0];
      routeDesc = `[直達] ${seg.trainNo} ${seg.trainType}\n` +
                  `${seg.fromStationName} → ${seg.toStationName}`;
    } else {
      const lines: string[] = [];
      lines.push(`[轉乘] 在${journey.transferStation}轉車 (等${journey.waitTime}分)`);

      journey.segments.forEach((seg, i) => {
        const prefix = i === 0 ? '①' : '②';
        lines.push(`${prefix} ${seg.trainNo} ${seg.trainType}`);
        lines.push(`   ${seg.fromStationName} ${seg.departure} → ${seg.toStationName} ${seg.arrival}`);
      });

      routeDesc = lines.join('\n');
    }

    table.push([
      index + 1,
      routeDesc,
      journey.departure,
      journey.arrival,
      formatDuration(journey.totalDuration),
    ]);
  });

  console.log(table.toString());
  console.log(`\n共 ${journeys.length} 個行程方案`);
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

      // Step 1: 查詢直達車
      const directTimetables = await api.getDailyTimetable(
        fromStation.id,
        toStation.id,
        queryDate,
        { skipCache: !options.cache }
      );

      const directSegments: JourneySegment[] = directTimetables
        .map((t) => timetableToSegment(t, fromStation.id, toStation.id))
        .filter((s): s is JourneySegment => s !== null);

      // Step 2: 查詢轉乘方案（如果需要）
      const transferLegs: TransferLegData[] = [];

      if (maxTransfers >= 1) {
        // 篩選可能的轉乘站
        const potentialTransfers = filterTransferStations(fromStation.id, toStation.id);

        // 限制查詢的轉乘站數量（避免過多 API 呼叫）
        const transferStationsToQuery = potentialTransfers.slice(0, 3);

        for (const transferStationId of transferStationsToQuery) {
          const transferStation = TRA_STATIONS.find((s) => s.id === transferStationId);
          if (!transferStation) continue;

          try {
            // 查詢第一段：起站 → 轉乘站
            const firstLegTimetables = await api.getDailyTimetable(
              fromStation.id,
              transferStationId,
              queryDate,
              { skipCache: !options.cache }
            );

            // 查詢第二段：轉乘站 → 迄站
            const secondLegTimetables = await api.getDailyTimetable(
              transferStationId,
              toStation.id,
              queryDate,
              { skipCache: !options.cache }
            );

            const firstLegSegments = firstLegTimetables
              .map((t) => timetableToSegment(t, fromStation.id, transferStationId))
              .filter((s): s is JourneySegment => s !== null);

            const secondLegSegments = secondLegTimetables
              .map((t) => timetableToSegment(t, transferStationId, toStation.id))
              .filter((s): s is JourneySegment => s !== null);

            if (firstLegSegments.length > 0 && secondLegSegments.length > 0) {
              transferLegs.push({
                transferStation: transferStationId,
                firstLeg: firstLegSegments,
                secondLeg: secondLegSegments,
              });
            }
          } catch {
            // 忽略單一轉乘站查詢失敗
            continue;
          }
        }
      }

      // Step 3: 組合所有行程方案
      let journeys = findJourneyOptions(directSegments, transferLegs, {
        minTransferTime,
        maxTransferTime: maxWaitTime,
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
