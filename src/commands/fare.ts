/**
 * Fare Command
 * 票價查詢指令
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
import type { ODFare } from '../types/api.js';
import { padEnd } from '../lib/display-width.js';

// 初始化
const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);
const config = new ConfigService();

/**
 * 票種對應表
 */
const TICKET_TYPES: Record<number, string> = {
  1: '一般',
  2: '來回',
  3: '電子票證',
  4: '定期',
  5: '學生',
};

/**
 * 票價類別對應表
 */
const FARE_CLASSES: Record<number, string> = {
  1: '成人',
  2: '孩童',
  3: '敬老',
  4: '愛心',
  5: '學生',
  6: '團體',
  7: '愛心陪伴',
};

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

export const fareCommand = new Command('fare')
  .description('票價查詢')
  .argument('<from>', '起站')
  .argument('<to>', '迄站')
  .option('--no-cache', '不使用快取')
  .action(async (from, to, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

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
      const fare = await api.getODFare(fromStation.id, toStation.id);

      if (!fare) {
        if (format === 'json') {
          console.log(JSON.stringify({
            success: false,
            error: {
              code: 'FARE_NOT_FOUND',
              message: `找不到 ${fromStation.name} 到 ${toStation.name} 的票價資訊`,
            },
          }));
        } else {
          console.error(`找不到 ${fromStation.name} 到 ${toStation.name} 的票價資訊`);
        }
        process.exit(1);
      }

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          query: {
            from: fromStation,
            to: toStation,
          },
          fare: formatFareForJson(fare),
        }, null, 2));
      } else {
        printFareTable(fare, fromStation, toStation);
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
 * 格式化票價為 JSON 輸出
 */
function formatFareForJson(fare: ODFare): {
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  fares: Array<{
    ticketType: number;
    ticketTypeName: string;
    fareClass: number;
    fareClassName: string;
    price: number;
  }>;
} {
  return {
    origin: {
      id: fare.OriginStationID,
      name: fare.OriginStationName.Zh_tw,
    },
    destination: {
      id: fare.DestinationStationID,
      name: fare.DestinationStationName.Zh_tw,
    },
    fares: fare.Fares.map((f) => ({
      ticketType: f.TicketType,
      ticketTypeName: TICKET_TYPES[f.TicketType] || `類型${f.TicketType}`,
      fareClass: f.FareClass,
      fareClassName: FARE_CLASSES[f.FareClass] || `類別${f.FareClass}`,
      price: f.Price,
    })),
  };
}

/**
 * 印出票價表格
 */
function printFareTable(
  fare: ODFare,
  from: { name: string; id: string },
  to: { name: string; id: string }
): void {
  console.log(`\n${from.name} → ${to.name} 票價\n`);

  const COL = { ticketType: 10, fareClass: 10, price: 8 };
  console.log([
    padEnd('票種', COL.ticketType),
    padEnd('類別', COL.fareClass),
    '票價',
  ].join('  '));
  console.log('─'.repeat(32));

  // 按票種分組顯示
  const faresByType = new Map<number, typeof fare.Fares>();
  for (const f of fare.Fares) {
    if (!faresByType.has(f.TicketType)) {
      faresByType.set(f.TicketType, []);
    }
    faresByType.get(f.TicketType)!.push(f);
  }

  for (const [ticketType, fares] of faresByType) {
    const typeName = TICKET_TYPES[ticketType] || `類型${ticketType}`;
    for (const f of fares) {
      const className = FARE_CLASSES[f.FareClass] || `類別${f.FareClass}`;
      console.log([
        padEnd(typeName, COL.ticketType),
        padEnd(className, COL.fareClass),
        `$${f.Price}`,
      ].join('  '));
    }
  }

  console.log(`\n共 ${fare.Fares.length} 種票價`);
}
