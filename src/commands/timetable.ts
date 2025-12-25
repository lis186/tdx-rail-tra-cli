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
import type { DailyTrainTimetable, GeneralTrainTimetable } from '../types/api.js';

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
  .option('--after <time>', '只顯示指定時間之後的班次 (HH:MM)')
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

    try {
      const api = getApiClient();
      let timetables = await api.getDailyTimetable(
        fromStation.id,
        toStation.id,
        queryDate,
        { skipCache: !options.cache }
      );

      // 過濾時間
      if (options.after) {
        timetables = timetables.filter((train) => {
          const firstStop = train.StopTimes.find((s) => s.StationID === fromStation.id);
          if (!firstStop?.DepartureTime) return false;
          return firstStop.DepartureTime >= options.after;
        });
      }

      // 限制數量
      const limit = parseInt(options.limit, 10);
      if (limit > 0 && timetables.length > limit) {
        timetables = timetables.slice(0, limit);
      }

      // 排序：依出發時間
      timetables.sort((a, b) => {
        const aTime = a.StopTimes.find((s) => s.StationID === fromStation.id)?.DepartureTime || '';
        const bTime = b.StopTimes.find((s) => s.StationID === fromStation.id)?.DepartureTime || '';
        return aTime.localeCompare(bTime);
      });

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          query: {
            from: fromStation,
            to: toStation,
            date: queryDate,
          },
          count: timetables.length,
          timetables: formatTimetablesForJson(timetables, fromStation.id, toStation.id),
        }, null, 2));
      } else {
        printTimetableTable(timetables, fromStation, toStation, queryDate);
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
      trainNo: train.DailyTrainInfo.TrainNo,
      trainType: train.DailyTrainInfo.TrainTypeName.Zh_tw,
      departure,
      arrival,
      duration,
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

  console.log('車次\t車種\t\t出發\t\t抵達\t\t行車時間');
  console.log('─'.repeat(70));

  for (const train of timetables) {
    const fromStop = train.StopTimes.find((s) => s.StationID === from.id);
    const toStop = train.StopTimes.find((s) => s.StationID === to.id);

    const departure = fromStop?.DepartureTime || '--:--';
    const arrival = toStop?.ArrivalTime || '--:--';
    const trainType = train.DailyTrainInfo.TrainTypeName.Zh_tw.padEnd(8, '　');

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

    console.log(
      `${train.DailyTrainInfo.TrainNo}\t${trainType}\t${departure}\t\t${arrival}\t\t${durationStr}`
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
