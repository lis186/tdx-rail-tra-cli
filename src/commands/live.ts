/**
 * Live Command
 * 即時資訊查詢指令
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
import type { TrainLiveBoard, TrainDelay, StationLiveBoard } from '../types/api.js';
import { runWithWatch } from '../utils/watch.js';

// 初始化
const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);
const config = new ConfigService();

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

export const liveCommand = new Command('live')
  .description('即時資訊查詢');

/**
 * tra live train <trainNo>
 */
liveCommand
  .command('train <trainNo>')
  .description('查詢車次即時位置')
  .option('--watch', '持續監控模式')
  .option('--interval <seconds>', '監控更新間隔（秒）', '30')
  .action(async (trainNo, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const watch = options.watch || false;
    const interval = parseInt(options.interval, 10);

    const fetchAndDisplay = async () => {
      const api = getApiClient();
      const liveBoard = await api.getTrainLiveBoard(trainNo);

      if (!liveBoard) {
        if (format === 'json') {
          console.log(JSON.stringify({
            success: false,
            error: {
              code: 'TRAIN_NOT_FOUND',
              message: `找不到車次 ${trainNo} 的即時資訊（可能尚未發車或已到站）`,
            },
          }));
        } else {
          console.error(`找不到車次 ${trainNo} 的即時資訊`);
          console.error('提示：車次可能尚未發車或已抵達終點站');
        }
        if (!watch) process.exit(1);
        return;
      }

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          train: formatLiveBoardForJson(liveBoard),
        }, null, 2));
      } else {
        printLiveBoard(liveBoard);
      }
    };

    try {
      await runWithWatch(fetchAndDisplay, watch, {
        interval,
        clearScreen: format !== 'json',
        showUpdateTime: format !== 'json',
      });
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
 * tra live delays [--trains <no1,no2,...>]
 */
liveCommand
  .command('delays')
  .description('查詢列車延誤資訊')
  .option('--trains <trainNos>', '指定車次（逗號分隔）')
  .action(async (options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    try {
      const api = getApiClient();

      let trainNos: string[] = [];
      if (options.trains) {
        trainNos = options.trains.split(',').map((s: string) => s.trim());
      }

      const delays = await api.getTrainDelays(trainNos);

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          query: {
            trains: trainNos.length > 0 ? trainNos : 'all',
          },
          count: delays.length,
          delays: delays.map(formatDelayForJson),
        }, null, 2));
      } else {
        printDelaysTable(delays, trainNos);
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
 * 格式化即時看板為 JSON 輸出
 */
function formatLiveBoardForJson(liveBoard: TrainLiveBoard): {
  trainNo: string;
  trainType: string;
  currentStation: {
    id: string;
    name: string;
  };
  delayTime: number;
  delayStatus: string;
  updateTime: string;
} {
  return {
    trainNo: liveBoard.TrainNo,
    trainType: liveBoard.TrainTypeName.Zh_tw,
    currentStation: {
      id: liveBoard.StationID,
      name: liveBoard.StationName.Zh_tw,
    },
    delayTime: liveBoard.DelayTime,
    delayStatus: formatDelayStatus(liveBoard.DelayTime),
    updateTime: liveBoard.UpdateTime,
  };
}

/**
 * 格式化延誤資訊為 JSON 輸出
 */
function formatDelayForJson(delay: TrainDelay): {
  trainNo: string;
  delayTime: number;
  delayStatus: string;
  updateTime: string;
} {
  return {
    trainNo: delay.TrainNo,
    delayTime: delay.DelayTime,
    delayStatus: formatDelayStatus(delay.DelayTime),
    updateTime: delay.UpdateTime,
  };
}

/**
 * 格式化延誤狀態
 */
function formatDelayStatus(delayTime: number): string {
  if (delayTime === 0) return '準時';
  if (delayTime > 0) return `晚 ${delayTime} 分`;
  return `早 ${Math.abs(delayTime)} 分`;
}

/**
 * 印出即時看板
 */
function printLiveBoard(liveBoard: TrainLiveBoard): void {
  console.log(`\n車次 ${liveBoard.TrainNo} 即時資訊\n`);
  console.log(`車種：${liveBoard.TrainTypeName.Zh_tw}`);
  console.log(`目前位置：${liveBoard.StationName.Zh_tw}`);
  console.log(`延誤狀態：${formatDelayStatus(liveBoard.DelayTime)}`);
  console.log(`更新時間：${liveBoard.UpdateTime}`);
}

/**
 * tra live station <station>
 */
liveCommand
  .command('station <station>')
  .description('查詢車站即時到離站資訊')
  .option('--direction <dir>', '方向篩選：0=順行（南下）、1=逆行（北上）')
  .option('--limit <number>', '限制顯示數量', '20')
  .option('--watch', '持續監控模式')
  .option('--interval <seconds>', '監控更新間隔（秒）', '30')
  .action(async (station, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const watch = options.watch || false;
    const interval = parseInt(options.interval, 10);

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

    const fetchAndDisplay = async () => {
      const api = getApiClient();
      let liveBoards = await api.getStationLiveBoard(stationInfo.id);

      // 方向篩選
      if (options.direction !== undefined) {
        const dir = parseInt(options.direction, 10);
        if (dir === 0 || dir === 1) {
          liveBoards = liveBoards.filter((board) => board.Direction === dir);
        }
      }

      // 限制數量
      const limit = parseInt(options.limit, 10);
      if (limit > 0 && liveBoards.length > limit) {
        liveBoards = liveBoards.slice(0, limit);
      }

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          station: stationInfo,
          count: liveBoards.length,
          liveBoards: liveBoards.map(formatStationLiveBoardForJson),
        }, null, 2));
      } else {
        printStationLiveBoard(stationInfo, liveBoards);
      }
    };

    try {
      await runWithWatch(fetchAndDisplay, watch, {
        interval,
        clearScreen: format !== 'json',
        showUpdateTime: format !== 'json',
      });
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
 * 格式化車站即時看板為 JSON 輸出
 */
function formatStationLiveBoardForJson(board: StationLiveBoard): {
  trainNo: string;
  trainType: string;
  endingStation: string;
  direction: string;
  arrivalTime: string | null;
  departureTime: string | null;
  delayTime: number;
  delayStatus: string;
  platform: string | null;
  updateTime: string;
} {
  return {
    trainNo: board.TrainNo,
    trainType: board.TrainTypeName.Zh_tw,
    endingStation: board.EndingStationName.Zh_tw,
    direction: board.Direction === 0 ? '順行' : '逆行',
    arrivalTime: board.ScheduleArrivalTime || null,
    departureTime: board.ScheduleDepartureTime || null,
    delayTime: board.DelayTime,
    delayStatus: formatDelayStatus(board.DelayTime),
    platform: board.Platform || null,
    updateTime: board.UpdateTime,
  };
}

/**
 * 印出車站即時看板
 */
function printStationLiveBoard(
  station: { name: string; id: string },
  liveBoards: StationLiveBoard[]
): void {
  console.log(`\n${station.name} 即時到離站資訊\n`);

  if (liveBoards.length === 0) {
    console.log('目前無列車資訊');
    return;
  }

  console.log('車次\t車種\t\t終點站\t\t到站\t\t發車\t\t狀態');
  console.log('─'.repeat(80));

  for (const board of liveBoards) {
    const trainType = board.TrainTypeName.Zh_tw.padEnd(6, '　');
    const endStation = board.EndingStationName.Zh_tw.padEnd(4, '　');
    const arrival = board.ScheduleArrivalTime || '--:--';
    const departure = board.ScheduleDepartureTime || '--:--';
    const status = formatDelayStatus(board.DelayTime);

    console.log(
      `${board.TrainNo}\t${trainType}\t\t${endStation}\t\t${arrival}\t\t${departure}\t\t${status}`
    );
  }

  console.log(`\n共 ${liveBoards.length} 班次`);
}

/**
 * 印出延誤列表
 */
function printDelaysTable(delays: TrainDelay[], queriedTrains: string[]): void {
  if (queriedTrains.length > 0) {
    console.log(`\n查詢車次：${queriedTrains.join(', ')}\n`);
  } else {
    console.log('\n全線延誤列車\n');
  }

  if (delays.length === 0) {
    console.log('目前無延誤資訊');
    return;
  }

  console.log('車次\t\t延誤\t\t更新時間');
  console.log('─'.repeat(50));

  // 依延誤時間排序（大到小）
  const sorted = [...delays].sort((a, b) => b.DelayTime - a.DelayTime);

  for (const delay of sorted) {
    const status = formatDelayStatus(delay.DelayTime);
    const time = delay.UpdateTime.split('T')[1]?.substring(0, 5) || delay.UpdateTime;
    console.log(`${delay.TrainNo}\t\t${status}\t\t${time}`);
  }

  console.log(`\n共 ${delays.length} 列車`);
}
