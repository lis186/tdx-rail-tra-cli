/**
 * Timetable Command
 * 時刻表查詢指令
 */

import { Command } from 'commander';
import { StationResolver } from '../lib/station-resolver.js';
import { TDXApiClient } from '../services/api.js';
import { ConfigService } from '../services/config.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';
import {
  checkTpassEligibility,
  isTpassEligibleTrainType,
} from '../lib/tpass.js';
import {
  filterByTimeRange,
  filterByTrainType,
  filterByServices,
  sortTrains,
  parseTrainTypeInput,
  type TrainEntry,
} from '../lib/train-filter.js';
import type { DailyTrainTimetable, GeneralTrainTimetable, DailyStationTimetable, ODFare, TrainDelay, StationLiveBoard } from '../types/api.js';
import { simplifyTrainType } from '../lib/train-type.js';
import { padEnd } from '../lib/display-width.js';

// 即時資訊緩衝時間（分鐘）- 往前查詢的範圍以捕捉延誤列車
const LIVE_DELAY_BUFFER_MINUTES = 120;

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
 * 取得台灣現在時間 (HH:MM)
 */
function getCurrentTaiwanTime(): string {
  const now = new Date();
  // Use Intl to get Taiwan time reliably
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

/**
 * 時間字串轉分鐘數
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 分鐘數轉時間字串
 */
function minutesToTime(minutes: number): string {
  // Handle negative and overflow
  while (minutes < 0) minutes += 24 * 60;
  minutes = minutes % (24 * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * 時間相減（分鐘）
 */
function subtractMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) - minutes);
}

/**
 * 時間相加（分鐘）
 */
function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/**
 * 計算剩餘時間（分鐘），考慮跨日
 */
function calculateRemainingMinutes(departureTime: string, currentTime: string): number {
  const depMin = timeToMinutes(departureTime);
  const curMin = timeToMinutes(currentTime);
  let diff = depMin - curMin;
  // 如果差值為負且絕對值很大，可能是跨日
  if (diff < -12 * 60) diff += 24 * 60;
  return diff;
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

export const timetableCommand = new Command('timetable')
  .description('時刻表查詢');

/**
 * tra timetable daily <from> <to> [date]
 */
timetableCommand
  .command('daily <from> <to> [date]')
  .description('查詢起訖站每日時刻表')
  .option('--depart-after <time>', '出發時間不早於 (HH:MM)')
  .option('--depart-before <time>', '出發時間不晚於 (HH:MM)')
  .option('--arrive-by <time>', '抵達時間不晚於 (HH:MM)')
  .option('--after <time>', '只顯示指定時間之後的班次 (HH:MM) [已棄用，請用 --depart-after]')
  .option('-t, --type <types>', '篩選車種（逗號分隔）')
  .option('--exclude-type <types>', '排除車種（逗號分隔）')
  .option('--tpass', '僅顯示 TPASS 適用班次')
  .option('--bike', '僅顯示可攜帶自行車班次')
  .option('--wheelchair', '僅顯示有輪椅服務班次')
  .option('--sort <field>', '排序方式：departure|arrival|duration|fare', 'departure')
  .option('--limit <number>', '限制顯示班次數量', '20')
  .option('--with-fare', '包含票價資訊')
  .option('--with-live', '包含即時延誤資訊（會擴大查詢範圍以捕捉延誤列車）')
  .option('--no-cache', '不使用快取')
  .action(async (from, to, date, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const queryDate = date || getToday();

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

    // TPASS 生活圈檢查
    if (options.tpass) {
      const tpassCheck = checkTpassEligibility(
        fromStation.id,
        toStation.id,
        fromStation.name,
        toStation.name
      );

      if (!tpassCheck.eligible) {
        if (format === 'json') {
          console.log(JSON.stringify({
            success: false,
            error: {
              code: tpassCheck.reason === 'CROSS_REGION' ? 'TPASS_CROSS_REGION' : 'TPASS_NO_REGION',
              message: tpassCheck.suggestion,
              from: tpassCheck.from,
              to: tpassCheck.to,
            },
          }, null, 2));
        } else {
          console.error(`TPASS 不適用：${tpassCheck.suggestion}`);
          if (tpassCheck.from && tpassCheck.to) {
            console.error(`  起站「${tpassCheck.from.stationName}」所屬生活圈：${tpassCheck.from.regions.join('、') || '無'}`);
            console.error(`  迄站「${tpassCheck.to.stationName}」所屬生活圈：${tpassCheck.to.regions.join('、') || '無'}`);
          }
        }
        process.exit(1);
      }
    }

    try {
      const api = getApiClient();

      // 處理即時查詢：擴大時間範圍以捕捉延誤列車
      let departAfter = options.departAfter || options.after;

      // 支援 "now" 關鍵字
      if (departAfter === 'now') {
        departAfter = getCurrentTaiwanTime();
      }

      const originalDepartAfter = departAfter; // 保存原始請求時間
      let expandedDepartAfter = departAfter;

      if (options.withLive && departAfter) {
        // 往前擴大查詢範圍 (120 分鐘)
        expandedDepartAfter = subtractMinutes(departAfter, LIVE_DELAY_BUFFER_MINUTES);
      }

      const timetables = await api.getDailyTimetable(
        fromStation.id,
        toStation.id,
        queryDate,
        { skipCache: !options.cache }
      );

      // Convert to TrainEntry format for filtering
      type ExtendedTrainEntry = TrainEntry & {
        _original: DailyTrainTimetable;
        delayMinutes?: number;
        actualDeparture?: string;
        liveStatus?: string;
        remainingMinutes?: number;
        platform?: string;
      };

      let trainEntries: ExtendedTrainEntry[] = timetables.map((train) => {
        const fromStop = train.StopTimes.find((s) => s.StationID === fromStation.id);
        const toStop = train.StopTimes.find((s) => s.StationID === toStation.id);
        return {
          trainNo: train.TrainInfo.TrainNo,
          trainType: train.TrainInfo.TrainTypeName.Zh_tw,
          trainTypeCode: train.TrainInfo.TrainTypeCode,
          departure: fromStop?.DepartureTime || '',
          arrival: toStop?.ArrivalTime || '',
          bikeFlag: train.TrainInfo.BikeFlag,
          wheelChairFlag: train.TrainInfo.WheelChairFlag,
          // Keep reference to original for output
          _original: train,
        };
      });

      // 第一階段：用擴大的時間範圍過濾
      trainEntries = filterByTimeRange(trainEntries, {
        departAfter: expandedDepartAfter,
        departBefore: options.departBefore,
        arriveBy: options.arriveBy,
      }) as ExtendedTrainEntry[];

      // Apply train type filters
      trainEntries = filterByTrainType(trainEntries, {
        includeTypes: options.type ? parseTrainTypeInput(options.type) : undefined,
        excludeTypes: options.excludeType ? parseTrainTypeInput(options.excludeType) : undefined,
        tpassOnly: options.tpass,
      }) as ExtendedTrainEntry[];

      // Apply service filters
      trainEntries = filterByServices(trainEntries, {
        bikeOnly: options.bike,
        wheelchairOnly: options.wheelchair,
      }) as ExtendedTrainEntry[];

      // 取得即時延誤資訊
      let delayMap = new Map<string, TrainDelay>();
      const currentTime = getCurrentTaiwanTime();

      if (options.withLive && trainEntries.length > 0) {
        try {
          const trainNos = trainEntries.map((t) => t.trainNo);
          const delays = await api.getTrainDelays(trainNos);
          delayMap = new Map(delays.map((d) => [d.TrainNo, d]));

          // 為每班車計算即時資訊
          for (const entry of trainEntries) {
            const delay = delayMap.get(entry.trainNo);
            if (delay) {
              entry.delayMinutes = delay.DelayTime;
              entry.actualDeparture = addMinutes(entry.departure, delay.DelayTime);
              entry.liveStatus = delay.DelayTime > 0
                ? `晚 ${delay.DelayTime} 分`
                : '準時';
            } else {
              // Live API 無資料 - 可能尚未發車或已過站
              entry.delayMinutes = 0;
              entry.actualDeparture = entry.departure;
              entry.liveStatus = '尚未發車';
            }
            // 計算剩餘時間
            entry.remainingMinutes = calculateRemainingMinutes(entry.actualDeparture, currentTime);
          }

          // 第二階段：用原始請求時間重新過濾（基於實際出發時間）
          if (originalDepartAfter) {
            const originalMinutes = timeToMinutes(originalDepartAfter);
            trainEntries = trainEntries.filter((entry) => {
              const actualMinutes = timeToMinutes(entry.actualDeparture!);
              // 處理跨日情況
              let diff = actualMinutes - originalMinutes;
              if (diff < -12 * 60) diff += 24 * 60;
              if (diff > 12 * 60) diff -= 24 * 60;
              return diff >= 0;
            });
          }

          // 過濾已發車的列車（剩餘時間 < 0）
          trainEntries = trainEntries.filter((entry) =>
            entry.remainingMinutes === undefined || entry.remainingMinutes >= -2
          );

          // 取得起站即時看板以獲取月臺資訊
          try {
            const liveBoards = await api.getStationLiveBoard(fromStation.id);
            const platformMap = new Map<string, string>();
            for (const board of liveBoards) {
              if (board.Platform) {
                platformMap.set(board.TrainNo, board.Platform);
              }
            }
            // 合併月臺資訊
            for (const entry of trainEntries) {
              const platform = platformMap.get(entry.trainNo);
              if (platform) {
                entry.platform = platform;
              }
            }
          } catch {
            // 月臺資訊查詢失敗，不影響主流程
          }
        } catch {
          // 即時資訊查詢失敗，繼續使用靜態時刻表
          if (format !== 'json') {
            console.warn('警告：即時資訊查詢失敗，僅顯示靜態時刻表');
          }
        }
      }

      // Sort (用剩餘時間排序，如果有即時資訊的話)
      const sortField = options.sort as 'departure' | 'arrival' | 'duration' | 'fare';
      if (options.withLive && sortField === 'departure') {
        // 用剩餘時間排序（正確處理跨日班次）
        trainEntries.sort((a, b) => {
          const aRemaining = a.remainingMinutes ?? Infinity;
          const bRemaining = b.remainingMinutes ?? Infinity;
          return aRemaining - bRemaining;
        });
      } else {
        trainEntries = sortTrains(trainEntries, sortField) as ExtendedTrainEntry[];
      }

      // Limit
      const limit = parseInt(options.limit, 10);
      if (limit > 0 && trainEntries.length > limit) {
        trainEntries = trainEntries.slice(0, limit);
      }

      // Get filtered original timetables for output
      const filteredTimetables = trainEntries.map(
        (e) => (e as TrainEntry & { _original: DailyTrainTimetable })._original
      );

      // Fetch fare data if requested
      let fareData: ODFare | null = null;
      if (options.withFare) {
        try {
          fareData = await api.getODFare(fromStation.id, toStation.id);
        } catch {
          // Fare lookup failed, continue without fare data
          if (format !== 'json') {
            console.warn('警告：票價查詢失敗，不顯示票價資訊');
          }
        }
      }

      if (format === 'json') {
        // 準備輸出資料（包含即時資訊）
        const timetablesOutput = formatTimetablesForJson(filteredTimetables, fromStation.id, toStation.id);

        // 如果有即時資訊，附加到每個班次
        if (options.withLive) {
          for (let i = 0; i < timetablesOutput.length; i++) {
            const entry = trainEntries[i];
            if (entry) {
              (timetablesOutput[i] as Record<string, unknown>).live = {
                delayMinutes: entry.delayMinutes ?? 0,
                actualDeparture: entry.actualDeparture || entry.departure,
                status: entry.liveStatus || '未知',
                remainingMinutes: entry.remainingMinutes ?? null,
                platform: entry.platform || null,
              };
            }
          }
        }

        const output: Record<string, unknown> = {
          success: true,
          query: {
            from: fromStation,
            to: toStation,
            date: queryDate,
            filters: {
              departAfter: originalDepartAfter,
              departBefore: options.departBefore,
              arriveBy: options.arriveBy,
              type: options.type,
              excludeType: options.excludeType,
              tpass: options.tpass,
              bike: options.bike,
              wheelchair: options.wheelchair,
              withLive: options.withLive,
              sort: options.sort,
            },
          },
          count: filteredTimetables.length,
          timetables: timetablesOutput,
        };

        // Add current time if live info requested
        if (options.withLive) {
          output.currentTime = currentTime;
        }

        // Add fare info if available
        if (fareData) {
          output.fare = formatFareForOutput(fareData);
        }

        console.log(JSON.stringify(output, null, 2));
      } else {
        // 傳遞即時資訊給 table 輸出
        const liveData = options.withLive
          ? trainEntries.map((e) => ({
              trainNo: e.trainNo,
              delayMinutes: e.delayMinutes ?? 0,
              actualDeparture: e.actualDeparture || e.departure,
              status: e.liveStatus || '未知',
              remainingMinutes: e.remainingMinutes ?? null,
              platform: e.platform || null,
            }))
          : undefined;
        printTimetableTable(filteredTimetables, fromStation, toStation, queryDate, fareData, liveData, currentTime);
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

/**
 * tra timetable train <trainNo>
 */
timetableCommand
  .command('train <trainNo>')
  .description('查詢車次時刻表')
  .option('--no-cache', '不使用快取')
  .action(async (trainNo, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    try {
      const api = getApiClient();
      const timetable = await api.getTrainTimetable(trainNo);

      if (!timetable) {
        if (format === 'json') {
          console.log(JSON.stringify({
            success: false,
            error: {
              code: 'TRAIN_NOT_FOUND',
              message: `找不到車次 ${trainNo}`,
            },
          }));
        } else {
          console.error(`找不到車次 ${trainNo}`);
        }
        process.exit(1);
      }

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          train: formatTrainTimetableForJson(timetable),
        }, null, 2));
      } else {
        printTrainTimetableTable(timetable);
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

/**
 * tra timetable station <station> [date]
 */
timetableCommand
  .command('station <station> [date]')
  .description('查詢車站每日時刻表')
  .option('--direction <dir>', '方向篩選：0=順行（南下）、1=逆行（北上）')
  .option('--depart-after <time>', '出發時間不早於 (HH:MM)')
  .option('--depart-before <time>', '出發時間不晚於 (HH:MM)')
  .option('--after <time>', '只顯示指定時間之後的班次 (HH:MM) [已棄用，請用 --depart-after]')
  .option('-t, --type <types>', '篩選車種（逗號分隔）')
  .option('--exclude-type <types>', '排除車種（逗號分隔）')
  .option('--bike', '僅顯示可攜帶自行車班次')
  .option('--wheelchair', '僅顯示有輪椅服務班次')
  .option('--sort <field>', '排序方式：departure|fare', 'departure')
  .option('--limit <number>', '限制顯示班次數量', '30')
  .option('--no-cache', '不使用快取')
  .action(async (station, date, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const queryDate = date || getToday();

    // 解析車站
    const result = resolver.resolve(station);
    if (!result.success) {
      if (format === 'json') {
        console.log(JSON.stringify({ success: false, error: result.error }));
      } else {
        console.error(`錯誤：無法解析車站「${station}」`);
        if (result.error.suggestion) {
          console.error(`建議：${result.error.suggestion}`);
        }
      }
      process.exit(1);
    }

    const stationInfo = result.station;
    const direction = options.direction !== undefined
      ? parseInt(options.direction, 10) as 0 | 1
      : undefined;

    // Warn if bike/wheelchair used with station command
    if (options.bike || options.wheelchair) {
      if (format !== 'json') {
        console.warn('警告：車站時刻表不包含自行車/輪椅服務資訊，請使用 daily 指令查詢');
      }
    }

    try {
      const api = getApiClient();
      const timetables = await api.getStationTimetable(
        stationInfo.id,
        queryDate,
        direction,
        { skipCache: !options.cache }
      );

      // 合併時刻表並轉換為 TrainEntry 格式
      let trainEntries: (TrainEntry & { endingStation: string; direction: number })[] = [];

      for (const timetable of timetables) {
        for (const train of timetable.TimeTables) {
          trainEntries.push({
            trainNo: train.TrainNo,
            trainType: train.TrainTypeName.Zh_tw,
            trainTypeCode: '', // Not available in station timetable API
            endingStation: train.EndingStationName.Zh_tw,
            direction: timetable.Direction,
            arrival: train.ArrivalTime || '',
            departure: train.DepartureTime || '',
          });
        }
      }

      // Apply time range filters (support legacy --after option)
      const departAfter = options.departAfter || options.after;
      trainEntries = filterByTimeRange(trainEntries, {
        departAfter,
        departBefore: options.departBefore,
      }) as typeof trainEntries;

      // Apply train type filters (by name only, no code available)
      trainEntries = filterByTrainType(trainEntries, {
        includeTypes: options.type ? parseTrainTypeInput(options.type) : undefined,
        excludeTypes: options.excludeType ? parseTrainTypeInput(options.excludeType) : undefined,
      }) as typeof trainEntries;

      // Sort
      const sortField = options.sort as 'departure' | 'fare';
      trainEntries = sortTrains(trainEntries, sortField) as typeof trainEntries;

      // Limit
      const limit = parseInt(options.limit, 10);
      if (limit > 0 && trainEntries.length > limit) {
        trainEntries = trainEntries.slice(0, limit);
      }

      // Convert back to output format
      const allTrains = trainEntries.map((e) => ({
        trainNo: e.trainNo,
        trainType: e.trainType,
        endingStation: e.endingStation,
        direction: e.direction,
        arrival: e.arrival || null,
        departure: e.departure || null,
      }));

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          query: {
            station: stationInfo,
            date: queryDate,
            direction: direction !== undefined ? (direction === 0 ? '順行' : '逆行') : 'all',
            filters: {
              departAfter,
              departBefore: options.departBefore,
              type: options.type,
              excludeType: options.excludeType,
              sort: options.sort,
            },
          },
          count: allTrains.length,
          timetables: allTrains,
        }, null, 2));
      } else {
        printStationTimetableTable(stationInfo, queryDate, allTrains, direction);
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

/**
 * 印出車站時刻表表格
 */
function printStationTimetableTable(
  station: { name: string; id: string },
  date: string,
  trains: Array<{
    trainNo: string;
    trainType: string;
    endingStation: string;
    direction: number;
    arrival: string | null;
    departure: string | null;
  }>,
  direction?: 0 | 1
): void {
  const directionText = direction !== undefined
    ? `（${direction === 0 ? '順行/南下' : '逆行/北上'}）`
    : '';
  console.log(`\n${station.name} 時刻表 (${date})${directionText}\n`);

  if (trains.length === 0) {
    console.log('沒有找到班次');
    return;
  }

  console.log('車次\t車種\t\t終點站\t\t到站\t\t發車\t\t方向');
  console.log('─'.repeat(80));

  for (const train of trains) {
    const trainType = train.trainType.padEnd(6, '　');
    const endStation = train.endingStation.padEnd(4, '　');
    const arrival = train.arrival || '--:--';
    const departure = train.departure || '--:--';
    const dirText = train.direction === 0 ? '↓南' : '↑北';

    console.log(
      `${train.trainNo}\t${trainType}\t\t${endStation}\t\t${arrival}\t\t${departure}\t\t${dirText}`
    );
  }

  console.log(`\n共 ${trains.length} 班次`);
}

/**
 * 格式化時刻表為 JSON 輸出
 */
function formatTimetablesForJson(
  timetables: DailyTrainTimetable[],
  fromId: string,
  toId: string
): Array<{
  trainNo: string;
  trainType: string;
  departure: string;
  arrival: string;
  duration: number;
  services: {
    bike: boolean;
    wheelchair: boolean;
  };
}> {
  return timetables.map((train) => {
    const fromStop = train.StopTimes.find((s) => s.StationID === fromId);
    const toStop = train.StopTimes.find((s) => s.StationID === toId);

    const departure = fromStop?.DepartureTime || '';
    const arrival = toStop?.ArrivalTime || '';

    // 計算行車時間（分鐘）
    let duration = 0;
    if (departure && arrival) {
      const [dh, dm] = departure.split(':').map(Number);
      const [ah, am] = arrival.split(':').map(Number);
      duration = (ah * 60 + am) - (dh * 60 + dm);
      if (duration < 0) duration += 24 * 60; // 跨日
    }

    return {
      trainNo: train.TrainInfo.TrainNo,
      trainType: train.TrainInfo.TrainTypeName.Zh_tw,
      departure,
      arrival,
      duration,
      services: {
        bike: train.TrainInfo.BikeFlag === 1,
        wheelchair: train.TrainInfo.WheelChairFlag === 1,
      },
    };
  });
}

/**
 * 格式化車次時刻表為 JSON 輸出
 */
function formatTrainTimetableForJson(timetable: GeneralTrainTimetable): {
  trainNo: string;
  trainType: string;
  direction: string;
  startStation: string;
  endStation: string;
  stops: Array<{
    sequence: number;
    stationId: string;
    stationName: string;
    arrival: string | null;
    departure: string | null;
  }>;
} {
  return {
    trainNo: timetable.TrainInfo.TrainNo,
    trainType: timetable.TrainInfo.TrainTypeName.Zh_tw,
    direction: timetable.TrainInfo.Direction === 0 ? '順行' : '逆行',
    startStation: timetable.TrainInfo.StartingStationName.Zh_tw,
    endStation: timetable.TrainInfo.EndingStationName.Zh_tw,
    stops: timetable.StopTimes.map((stop) => ({
      sequence: stop.StopSequence,
      stationId: stop.StationID,
      stationName: stop.StationName.Zh_tw,
      arrival: stop.ArrivalTime || null,
      departure: stop.DepartureTime || null,
    })),
  };
}

/**
 * 格式化票價資訊供輸出
 */
function formatFareForOutput(fare: ODFare): {
  adult: number;
  child: number;
  elderly: number;
  disabled: number;
} {
  // Find adult regular fare (TicketType=1, FareClass=1)
  const adultFare = fare.Fares.find((f) => f.TicketType === 1 && f.FareClass === 1);
  // Find child fare (FareClass=2)
  const childFare = fare.Fares.find((f) => f.TicketType === 1 && f.FareClass === 2);
  // Find elderly fare (FareClass=3)
  const elderlyFare = fare.Fares.find((f) => f.TicketType === 1 && f.FareClass === 3);
  // Find disabled fare (FareClass=4)
  const disabledFare = fare.Fares.find((f) => f.TicketType === 1 && f.FareClass === 4);

  return {
    adult: adultFare?.Price || 0,
    child: childFare?.Price || 0,
    elderly: elderlyFare?.Price || 0,
    disabled: disabledFare?.Price || 0,
  };
}

/**
 * 即時資訊類型
 */
interface LiveInfo {
  trainNo: string;
  delayMinutes: number;
  actualDeparture: string;
  status: string;
  remainingMinutes: number | null;
  platform: string | null;
}

/**
 * 格式化剩餘時間
 */
function formatRemainingTime(minutes: number | null): string {
  if (minutes === null) return '--';
  if (minutes < 0) return '已發車';
  if (minutes < 1) return '即將發車';
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
}

/**
 * 印出時刻表表格
 */
function printTimetableTable(
  timetables: DailyTrainTimetable[],
  from: { name: string; id: string },
  to: { name: string; id: string },
  date: string,
  fareData?: ODFare | null,
  liveData?: LiveInfo[],
  currentTime?: string
): void {
  console.log(`\n${from.name} → ${to.name} (${date})\n`);

  // Show current time if live data available
  if (liveData && currentTime) {
    console.log(`目前時間：${currentTime}\n`);
  }

  // Show fare info if available
  if (fareData) {
    const fare = formatFareForOutput(fareData);
    console.log(`票價：成人 $${fare.adult}｜孩童 $${fare.child}｜敬老/愛心 $${fare.elderly}\n`);
  }

  if (timetables.length === 0) {
    console.log('沒有找到班次');
    return;
  }

  // Create live data lookup
  const liveMap = new Map<string, LiveInfo>();
  let hasPlatformInfo = false;
  if (liveData) {
    for (const live of liveData) {
      liveMap.set(live.trainNo, live);
      if (live.platform) hasPlatformInfo = true;
    }
  }

  // 定義欄位寬度
  const COL = {
    remaining: 8,
    trainNo: 6,
    trainType: 6,
    time: 5,
    delay: 6,
    duration: 8,
    platform: 4,
    service: 4,
  };

  // Print header based on whether we have live data
  if (liveData) {
    const header = [
      padEnd('剩餘', COL.remaining),
      padEnd('車次', COL.trainNo),
      padEnd('車種', COL.trainType),
      padEnd('預定', COL.time),
      padEnd('延誤', COL.delay),
      padEnd('實際', COL.time),
    ];
    if (hasPlatformInfo) header.push(padEnd('月臺', COL.platform));
    header.push('服務');
    console.log(header.join('  '));
    console.log('─'.repeat(hasPlatformInfo ? 60 : 54));
  } else {
    console.log([
      padEnd('車次', COL.trainNo),
      padEnd('車種', COL.trainType),
      padEnd('出發', COL.time),
      padEnd('抵達', COL.time),
      padEnd('時間', COL.duration),
      '服務',
    ].join('  '));
    console.log('─'.repeat(48));
  }

  for (const train of timetables) {
    const fromStop = train.StopTimes.find((s) => s.StationID === from.id);
    const toStop = train.StopTimes.find((s) => s.StationID === to.id);

    const departure = fromStop?.DepartureTime || '--:--';
    const arrival = toStop?.ArrivalTime || '--:--';
    const trainType = simplifyTrainType(train.TrainInfo.TrainTypeName.Zh_tw);
    const trainNo = train.TrainInfo.TrainNo;

    // 服務標示
    const services: string[] = [];
    if (train.TrainInfo.BikeFlag === 1) services.push('🚲');
    if (train.TrainInfo.WheelChairFlag === 1) services.push('♿');
    const serviceStr = services.join(' ') || '-';

    if (liveData) {
      // 有即時資訊
      const live = liveMap.get(trainNo);
      const delayStr = live
        ? (live.delayMinutes > 0 ? `+${live.delayMinutes}分` : (live.status === '尚未發車' ? '待發' : '準時'))
        : '--';
      const actualDep = live?.actualDeparture || departure;
      const remaining = live ? formatRemainingTime(live.remainingMinutes) : '--';

      const row = [
        padEnd(remaining, COL.remaining),
        padEnd(trainNo, COL.trainNo),
        padEnd(trainType, COL.trainType),
        padEnd(departure, COL.time),
        padEnd(delayStr, COL.delay),
        padEnd(actualDep, COL.time),
      ];
      if (hasPlatformInfo) {
        row.push(padEnd(live?.platform || '--', COL.platform));
      }
      row.push(serviceStr);
      console.log(row.join('  '));
    } else {
      // 無即時資訊
      // 計算行車時間
      let durationStr = '--';
      if (fromStop?.DepartureTime && toStop?.ArrivalTime) {
        const [dh, dm] = fromStop.DepartureTime.split(':').map(Number);
        const [ah, am] = toStop.ArrivalTime.split(':').map(Number);
        let minutes = (ah * 60 + am) - (dh * 60 + dm);
        if (minutes < 0) minutes += 24 * 60;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        durationStr = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
      }

      console.log([
        padEnd(trainNo, COL.trainNo),
        padEnd(trainType, COL.trainType),
        padEnd(departure, COL.time),
        padEnd(arrival, COL.time),
        padEnd(durationStr, COL.duration),
        serviceStr,
      ].join('  '));
    }
  }

  console.log(`\n共 ${timetables.length} 班次`);
}

/**
 * 印出車次時刻表表格
 */
function printTrainTimetableTable(timetable: GeneralTrainTimetable): void {
  const info = timetable.TrainInfo;
  console.log(`\n車次 ${info.TrainNo} - ${simplifyTrainType(info.TrainTypeName.Zh_tw)}`);
  console.log(`${info.StartingStationName.Zh_tw} → ${info.EndingStationName.Zh_tw}`);
  console.log(`方向：${info.Direction === 0 ? '順行（南下）' : '逆行（北上）'}\n`);

  const COL = { seq: 4, name: 8, time: 5 };
  console.log([
    padEnd('站序', COL.seq),
    padEnd('站名', COL.name),
    padEnd('到達', COL.time),
    '出發',
  ].join('  '));
  console.log('─'.repeat(30));

  for (const stop of timetable.StopTimes) {
    const arrival = stop.ArrivalTime || '--:--';
    const departure = stop.DepartureTime || '--:--';
    console.log([
      padEnd(String(stop.StopSequence), COL.seq),
      padEnd(stop.StationName.Zh_tw, COL.name),
      padEnd(arrival, COL.time),
      departure,
    ].join('  '));
  }

  console.log(`\n共 ${timetable.StopTimes.length} 停靠站`);
}
