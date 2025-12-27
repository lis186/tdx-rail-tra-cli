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
import { simplifyTrainType } from '../lib/train-type.js';
import { padEnd } from '../lib/display-width.js';

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
    trainType: simplifyTrainType(liveBoard.TrainTypeName.Zh_tw),
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
  console.log(`車種：${simplifyTrainType(liveBoard.TrainTypeName.Zh_tw)}`);
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
        const singleDirection = options.direction !== undefined;
        printStationLiveBoard(stationInfo, liveBoards, singleDirection);
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
    trainType: simplifyTrainType(board.TrainTypeName.Zh_tw),
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
  liveBoards: StationLiveBoard[],
  singleDirection = false
): void {
  console.log(`\n${station.name} 即時到離站資訊\n`);

  if (liveBoards.length === 0) {
    console.log('目前無列車資訊');
    return;
  }

  // 欄位寬度
  const COL = {
    trainNo: 6,
    trainType: 6,
    endStation: 6,
    platform: 4,
    time: 8,
    status: 8,
  };

  // 檢查是否有任何班次有月臺資訊
  const hasPlatformInfo = liveBoards.some((b) => b.Platform);

  const printHeader = () => {
    const header = [
      padEnd('車次', COL.trainNo),
      padEnd('車種', COL.trainType),
      padEnd('終點', COL.endStation),
    ];
    if (hasPlatformInfo) header.push(padEnd('月臺', COL.platform));
    header.push(padEnd('到站', COL.time), padEnd('發車', COL.time), '狀態');
    console.log(header.join('  '));
    console.log('─'.repeat(hasPlatformInfo ? 58 : 52));
  };

  const printRow = (board: StationLiveBoard) => {
    const trainType = simplifyTrainType(board.TrainTypeName.Zh_tw);
    const endStation = board.EndingStationName.Zh_tw;
    const arrival = board.ScheduleArrivalTime || '--:--';
    const departure = board.ScheduleDepartureTime || '--:--';
    const status = formatDelayStatus(board.DelayTime);

    const row = [
      padEnd(board.TrainNo, COL.trainNo),
      padEnd(trainType, COL.trainType),
      padEnd(endStation, COL.endStation),
    ];
    if (hasPlatformInfo) {
      row.push(padEnd(board.Platform || '--', COL.platform));
    }
    row.push(padEnd(arrival, COL.time), padEnd(departure, COL.time), status);
    console.log(row.join('  '));
  };

  if (singleDirection) {
    // 已篩選單一方向，直接顯示
    printHeader();
    for (const board of liveBoards) {
      printRow(board);
    }
  } else {
    // 按方向分組顯示
    const southbound = liveBoards.filter((b) => b.Direction === 0);
    const northbound = liveBoards.filter((b) => b.Direction === 1);

    if (southbound.length > 0) {
      console.log('● 順行（方向 0）');
      printHeader();
      for (const board of southbound) {
        printRow(board);
      }
    }

    if (northbound.length > 0) {
      if (southbound.length > 0) console.log('');
      console.log('○ 逆行（方向 1）');
      printHeader();
      for (const board of northbound) {
        printRow(board);
      }
    }
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

  const COL = { trainNo: 6, delay: 8, time: 8 };
  console.log([
    padEnd('車次', COL.trainNo),
    padEnd('延誤', COL.delay),
    '更新時間',
  ].join('  '));
  console.log('─'.repeat(28));

  // 依延誤時間排序（大到小）
  const sorted = [...delays].sort((a, b) => b.DelayTime - a.DelayTime);

  for (const delay of sorted) {
    const status = formatDelayStatus(delay.DelayTime);
    const time = delay.UpdateTime.split('T')[1]?.substring(0, 5) || delay.UpdateTime;
    console.log([
      padEnd(delay.TrainNo, COL.trainNo),
      padEnd(status, COL.delay),
      time,
    ].join('  '));
  }

  console.log(`\n共 ${delays.length} 列車`);
}
