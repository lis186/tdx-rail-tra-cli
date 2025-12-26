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
import type { DailyTrainTimetable, GeneralTrainTimetable, DailyStationTimetable } from '../types/api.js';

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
      const timetables = await api.getDailyTimetable(
        fromStation.id,
        toStation.id,
        queryDate,
        { skipCache: !options.cache }
      );

      // Convert to TrainEntry format for filtering
      let trainEntries: TrainEntry[] = timetables.map((train) => {
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
        } as TrainEntry & { _original: DailyTrainTimetable };
      });

      // Apply time range filters (support legacy --after option)
      const departAfter = options.departAfter || options.after;
      trainEntries = filterByTimeRange(trainEntries, {
        departAfter,
        departBefore: options.departBefore,
        arriveBy: options.arriveBy,
      });

      // Apply train type filters
      trainEntries = filterByTrainType(trainEntries, {
        includeTypes: options.type ? parseTrainTypeInput(options.type) : undefined,
        excludeTypes: options.excludeType ? parseTrainTypeInput(options.excludeType) : undefined,
        tpassOnly: options.tpass,
      });

      // Apply service filters
      trainEntries = filterByServices(trainEntries, {
        bikeOnly: options.bike,
        wheelchairOnly: options.wheelchair,
      });

      // Sort
      const sortField = options.sort as 'departure' | 'arrival' | 'duration' | 'fare';
      trainEntries = sortTrains(trainEntries, sortField);

      // Limit
      const limit = parseInt(options.limit, 10);
      if (limit > 0 && trainEntries.length > limit) {
        trainEntries = trainEntries.slice(0, limit);
      }

      // Get filtered original timetables for output
      const filteredTimetables = trainEntries.map(
        (e) => (e as TrainEntry & { _original: DailyTrainTimetable })._original
      );

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          query: {
            from: fromStation,
            to: toStation,
            date: queryDate,
            filters: {
              departAfter,
              departBefore: options.departBefore,
              arriveBy: options.arriveBy,
              type: options.type,
              excludeType: options.excludeType,
              tpass: options.tpass,
              bike: options.bike,
              wheelchair: options.wheelchair,
              sort: options.sort,
            },
          },
          count: filteredTimetables.length,
          timetables: formatTimetablesForJson(filteredTimetables, fromStation.id, toStation.id),
        }, null, 2));
      } else {
        printTimetableTable(filteredTimetables, fromStation, toStation, queryDate);
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
 * 印出時刻表表格
 */
function printTimetableTable(
  timetables: DailyTrainTimetable[],
  from: { name: string; id: string },
  to: { name: string; id: string },
  date: string
): void {
  console.log(`\n${from.name} → ${to.name} (${date})\n`);

  if (timetables.length === 0) {
    console.log('沒有找到班次');
    return;
  }

  console.log('車次\t車種\t\t出發\t\t抵達\t\t行車時間\t服務');
  console.log('─'.repeat(80));

  for (const train of timetables) {
    const fromStop = train.StopTimes.find((s) => s.StationID === from.id);
    const toStop = train.StopTimes.find((s) => s.StationID === to.id);

    const departure = fromStop?.DepartureTime || '--:--';
    const arrival = toStop?.ArrivalTime || '--:--';
    const trainType = train.TrainInfo.TrainTypeName.Zh_tw.padEnd(8, '　');

    // 計算行車時間
    let durationStr = '--';
    if (fromStop?.DepartureTime && toStop?.ArrivalTime) {
      const [dh, dm] = fromStop.DepartureTime.split(':').map(Number);
      const [ah, am] = toStop.ArrivalTime.split(':').map(Number);
      let minutes = (ah * 60 + am) - (dh * 60 + dm);
      if (minutes < 0) minutes += 24 * 60;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }

    // 服務標示
    const services: string[] = [];
    if (train.TrainInfo.BikeFlag === 1) services.push('🚲');
    if (train.TrainInfo.WheelChairFlag === 1) services.push('♿');
    const serviceStr = services.join(' ') || '-';

    console.log(
      `${train.TrainInfo.TrainNo}\t${trainType}\t${departure}\t\t${arrival}\t\t${durationStr.padEnd(8)}\t${serviceStr}`
    );
  }

  console.log(`\n共 ${timetables.length} 班次`);
}

/**
 * 印出車次時刻表表格
 */
function printTrainTimetableTable(timetable: GeneralTrainTimetable): void {
  const info = timetable.TrainInfo;
  console.log(`\n車次 ${info.TrainNo} - ${info.TrainTypeName.Zh_tw}`);
  console.log(`${info.StartingStationName.Zh_tw} → ${info.EndingStationName.Zh_tw}`);
  console.log(`方向：${info.Direction === 0 ? '順行（南下）' : '逆行（北上）'}\n`);

  console.log('站序\t站名\t\t到達\t\t出發');
  console.log('─'.repeat(50));

  for (const stop of timetable.StopTimes) {
    const arrival = stop.ArrivalTime || '--:--';
    const departure = stop.DepartureTime || '--:--';
    const name = stop.StationName.Zh_tw.padEnd(6, '　');

    console.log(`${stop.StopSequence}\t${name}\t\t${arrival}\t\t${departure}`);
  }

  console.log(`\n共 ${timetable.StopTimes.length} 停靠站`);
}
