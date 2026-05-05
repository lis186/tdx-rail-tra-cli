/**
 * Book Command
 * 訂票連結生成指令（呼叫 TDX 導購 API）
 */

import { Command } from 'commander';
import { StationResolver } from '../lib/station-resolver.js';
import { getApiClient } from '../lib/api-client.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';

const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);

const TICKET_TYPES: Record<string, { id: number; name: string }> = {
  '1': { id: 1, name: '一般' },
  '2': { id: 2, name: '騰雲座艙' },
  '3': { id: 3, name: '兩鐵' },
  general: { id: 1, name: '一般' },
  business: { id: 2, name: '騰雲座艙' },
  bike: { id: 3, name: '兩鐵' },
};

export const bookCommand = new Command('book')
  .description('生成訂票連結（透過 TDX 導購 API）')
  .requiredOption('--train <trainNo>', '車次號碼')
  .requiredOption('--from <station>', '起站')
  .requiredOption('--to <station>', '迄站')
  .requiredOption('--date <YYYY-MM-DD>', '乘車日期')
  .option('--type <type>', '票券類型：1=一般(預設) 2=騰雲座艙 3=兩鐵', '1')
  .option('--quantity <number>', '票券數量（1-9）', '1')
  .option('--app', '生成 APP 深度連結（喚起台鐵 e 訂通）')
  .option('--open', '自動開啟瀏覽器')
  .action(async (options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    const fromResult = resolver.resolve(options.from);
    if (!fromResult.success) {
      console.log(JSON.stringify({ success: false, error: fromResult.error }));
      process.exit(1);
    }

    const toResult = resolver.resolve(options.to);
    if (!toResult.success) {
      console.log(JSON.stringify({ success: false, error: toResult.error }));
      process.exit(1);
    }

    const fromStation = fromResult.station;
    const toStation = toResult.station;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(options.date)) {
      console.log(JSON.stringify({
        success: false,
        error: { code: 'INVALID_DATE', message: '日期格式錯誤，請使用 YYYY-MM-DD 格式' },
      }));
      process.exit(1);
    }

    const ticketTypeInfo = TICKET_TYPES[options.type] ?? TICKET_TYPES['1'];
    const quantity = Math.max(1, Math.min(9, parseInt(options.quantity, 10) || 1));

    const api = getApiClient();

    try {
      const linkType = options.app ? 'app' : 'web';
      const { deeplink, expired } = await (options.app
        ? api.bookingDeeplinkDirect({
            startStation: fromStation.name,
            endStation: toStation.name,
            trainDate: options.date,
            trainNumber: options.train,
          })
        : api.bookingDeeplinkWeb({
            startStation: fromStation.name,
            endStation: toStation.name,
            departureDate: options.date,
            departureNumber: options.train,
            ticketType: ticketTypeInfo.id,
            ticketCount: quantity,
          }));

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          data: {
            url: deeplink,
            expired,
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
        console.log(`\n連結：${deeplink}`);
        console.log(`有效至：${expired}`);
      }

      if (options.open && !options.app) {
        try {
          const { exec } = await import('child_process');
          const platform = process.platform;
          const command = platform === 'darwin'
            ? `open "${deeplink}"`
            : platform === 'win32'
              ? `start "${deeplink}"`
              : `xdg-open "${deeplink}"`;
          exec(command);
          if (format !== 'json') console.log('\n已開啟瀏覽器');
        } catch {
          if (format !== 'json') console.error('\n無法開啟瀏覽器，請手動複製連結');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({
        success: false,
        error: { code: 'API_ERROR', message },
      }));
      process.exit(2);
    }
  });
