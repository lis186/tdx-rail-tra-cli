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
import type { TrainLiveBoard, TrainDelay } from '../types/api.js';

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
  .action(async (trainNo, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    try {
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
        process.exit(1);
      }

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          train: formatLiveBoardForJson(liveBoard),
        }, null, 2));
      } else {
        printLiveBoard(liveBoard);
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
