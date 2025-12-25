/**
 * Book Command
 * 訂票連結生成指令
 */

import { Command } from 'commander';
import { StationResolver } from '../lib/station-resolver.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';

// 初始化
const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);

/**
 * 票券類型
 */
const TICKET_TYPES: Record<string, { id: number; name: string }> = {
  '1': { id: 1, name: '一般' },
  '2': { id: 2, name: '騰雲座艙' },
  '3': { id: 3, name: '兩鐵' },
  general: { id: 1, name: '一般' },
  business: { id: 2, name: '騰雲座艙' },
  bike: { id: 3, name: '兩鐵' },
};

/**
 * 生成網頁訂票連結
 */
function generateWebBookingUrl(params: {
  trainNo: string;
  fromStationId: string;
  toStationId: string;
  date: string;
  ticketType: number;
  quantity: number;
}): string {
  const { trainNo, fromStationId, toStationId, date, ticketType, quantity } = params;

  // 台鐵網頁訂票連結格式
  const baseUrl = 'https://tip.railway.gov.tw/tra-tip-web/tip/tip001/tip123/query';
  const searchParams = new URLSearchParams({
    startStation: fromStationId,
    endStation: toStationId,
    rideDate: date.replace(/-/g, '/'),
    trainNo: trainNo,
    ticketType: String(ticketType),
    ticketQty: String(quantity),
  });

  return `${baseUrl}?${searchParams.toString()}`;
}

/**
 * 生成 APP 深度連結
 */
function generateAppDeeplink(params: {
  trainNo: string;
  fromStationId: string;
  toStationId: string;
  date: string;
  ticketType: number;
  quantity: number;
}): string {
  const { trainNo, fromStationId, toStationId, date, ticketType, quantity } = params;

  // 台鐵 APP 深度連結格式
  const baseUrl = 'traticket://booking';
  const searchParams = new URLSearchParams({
    from: fromStationId,
    to: toStationId,
    date: date,
    train: trainNo,
    type: String(ticketType),
    qty: String(quantity),
  });

  return `${baseUrl}?${searchParams.toString()}`;
}

export const bookCommand = new Command('book')
  .description('生成訂票連結')
  .requiredOption('--train <trainNo>', '車次號碼')
  .requiredOption('--from <station>', '起站')
  .requiredOption('--to <station>', '迄站')
  .requiredOption('--date <YYYY-MM-DD>', '乘車日期')
  .option('--type <type>', '票券類型：1=一般(預設) 2=騰雲座艙 3=兩鐵', '1')
  .option('--quantity <number>', '票券數量（1-9）', '1')
  .option('--app', '生成 APP 深度連結（而非網頁連結）')
  .option('--open', '自動開啟瀏覽器')
  .action(async (options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    // 解析車站
    const fromResult = resolver.resolve(options.from);
    if (!fromResult.success) {
      if (format === 'json') {
        console.log(JSON.stringify({ success: false, error: fromResult.error }));
      } else {
        console.error(`錯誤：無法解析起站「${options.from}」`);
        if (fromResult.error.suggestion) {
          console.error(`建議：${fromResult.error.suggestion}`);
        }
      }
      process.exit(1);
    }

    const toResult = resolver.resolve(options.to);
    if (!toResult.success) {
      if (format === 'json') {
        console.log(JSON.stringify({ success: false, error: toResult.error }));
      } else {
        console.error(`錯誤：無法解析迄站「${options.to}」`);
        if (toResult.error.suggestion) {
          console.error(`建議：${toResult.error.suggestion}`);
        }
      }
      process.exit(1);
    }

    const fromStation = fromResult.station;
    const toStation = toResult.station;

    // 解析票券類型
    const ticketTypeInfo = TICKET_TYPES[options.type] || TICKET_TYPES['1'];

    // 解析數量
    const quantity = Math.max(1, Math.min(9, parseInt(options.quantity, 10) || 1));

    // 驗證日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(options.date)) {
      if (format === 'json') {
        console.log(JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_DATE',
            message: '日期格式錯誤，請使用 YYYY-MM-DD 格式',
          },
        }));
      } else {
        console.error('錯誤：日期格式錯誤，請使用 YYYY-MM-DD 格式');
      }
      process.exit(1);
    }

    // 生成連結
    const params = {
      trainNo: options.train,
      fromStationId: fromStation.id,
      toStationId: toStation.id,
      date: options.date,
      ticketType: ticketTypeInfo.id,
      quantity,
    };

    const url = options.app
      ? generateAppDeeplink(params)
      : generateWebBookingUrl(params);

    const linkType = options.app ? 'app' : 'web';

    if (format === 'json') {
      console.log(JSON.stringify({
        success: true,
        data: {
          url,
          type: linkType,
          trainNo: options.train,
          origin: fromStation.name,
          destination: toStation.name,
          date: options.date,
          ticketType: ticketTypeInfo.id,
          ticketTypeName: ticketTypeInfo.name,
          quantity,
        },
      }, null, 2));
    } else {
      console.log(`\n訂票連結（${linkType === 'app' ? 'APP' : '網頁'}）\n`);
      console.log(`車次：${options.train}`);
      console.log(`路線：${fromStation.name} → ${toStation.name}`);
      console.log(`日期：${options.date}`);
      console.log(`票種：${ticketTypeInfo.name}`);
      console.log(`數量：${quantity} 張`);
      console.log(`\n連結：${url}`);
    }

    // 自動開啟瀏覽器
    if (options.open && !options.app) {
      try {
        const { exec } = await import('child_process');
        const platform = process.platform;
        const command = platform === 'darwin'
          ? `open "${url}"`
          : platform === 'win32'
            ? `start "${url}"`
            : `xdg-open "${url}"`;

        exec(command);

        if (format !== 'json') {
          console.log('\n已開啟瀏覽器');
        }
      } catch {
        if (format !== 'json') {
          console.error('\n無法開啟瀏覽器，請手動複製連結');
        }
      }
    }
  });
