/**
 * Book Command
 * 訂票連結生成指令
 *
 * 支援兩種模式：
 * 1. 基本模式：生成台鐵官網訂票連結
 * 2. Deeplink 模式 (--deeplink)：使用 MAAS 旅運規劃 API 生成 APP 深度連結
 *
 * MAAS Deeplink 流程：
 * 1. 呼叫旅運規劃 API (/api/maas/routing) 取得路線方案與 UUID
 * 2. 用 UUID 換取 Deeplink URL (/api/maas-tra/booking/deeplink/url/tra)
 * 3. 回傳可直接開啟台鐵 e 訂通 APP 的連結
 *
 * 文件：
 * - Deeplink: https://tdx.transportdata.tw/webapi/File/Swagger/V3/ad884f5e-4692-4600-8662-12abf40e5946
 * - Routing: https://tdx.transportdata.tw/webapi/File/Swagger/V3/4513f9d6-caae-4cf7-a50c-e7887bec804e
 */

import { Command } from 'commander';
import { StationResolver } from '../lib/station-resolver.js';
import { getApiClient } from '../lib/api-client.js';
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
 * Fallback: 生成網頁訂票連結（當 API 失敗時使用）
 */
function generateFallbackWebUrl(params: {
  trainNo: string;
  fromStationName: string;
  toStationName: string;
  date: string;
}): string {
  const { trainNo, date } = params;

  // 台鐵網頁訂票連結格式
  const baseUrl = 'https://tip.railway.gov.tw/tra-tip-web/tip/tip001/tip123/query';
  const searchParams = new URLSearchParams({
    rideDate: date.replace(/-/g, '/'),
    trainNo: trainNo,
  });

  return `${baseUrl}?${searchParams.toString()}`;
}

/**
 * 從車站資料取得經緯度
 */
function getStationCoordinates(stationId: string): { lat: number; lng: number } | null {
  const station = TRA_STATIONS.find(s => s.id === stationId);
  if (!station) return null;
  return { lat: station.lat, lng: station.lon };
}

/**
 * 產生出發時間（ISO 8601 格式）
 */
function generateDepartureTime(date: string, time?: string): string {
  const timeStr = time || '08:00';
  return `${date}T${timeStr}:00+08:00`;
}

export const bookCommand = new Command('book')
  .description('生成訂票連結')
  .requiredOption('--train <trainNo>', '車次號碼')
  .requiredOption('--from <station>', '起站')
  .requiredOption('--to <station>', '迄站')
  .requiredOption('--date <YYYY-MM-DD>', '乘車日期')
  .option('--time <HH:MM>', '出發時間（用於 --deeplink 模式）', '08:00')
  .option('--type <type>', '票券類型：1=一般(預設) 2=騰雲座艙 3=兩鐵', '1')
  .option('--quantity <number>', '票券數量（1-9）', '1')
  .option('--app', '生成 APP 深度連結（而非網頁連結）')
  .option('--deeplink', '使用 MAAS Deeplink 流程（需要 MAAS 權限，產生可直接開啟 APP 的連結）')
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

    // 透過 TDX API 取得訂票連結
    let url: string;
    let usedApi = true;
    let linkType = options.app ? 'app' : 'web';
    let expiresAt: string | undefined;
    let uuid: string | undefined;

    try {
      const api = getApiClient();

      // MAAS Deeplink 流程（新功能）
      if (options.deeplink) {
        linkType = 'deeplink';

        // Step 1: 取得車站經緯度
        const fromCoords = getStationCoordinates(fromStation.id);
        const toCoords = getStationCoordinates(toStation.id);

        if (!fromCoords || !toCoords) {
          throw new Error('無法取得車站經緯度');
        }

        // Step 2: 呼叫旅運規劃 API
        const departureTime = generateDepartureTime(options.date, options.time);
        const tripResult = await api.getTripPlanning({
          originLat: fromCoords.lat,
          originLng: fromCoords.lng,
          destLat: toCoords.lat,
          destLng: toCoords.lng,
          departureTime,
          transit: '4', // 台鐵
          top: 10,
        });

        if (tripResult.result !== 'success' || !tripResult.data?.routes?.length) {
          throw new Error(tripResult.error?.msg || '旅運規劃 API 無回傳路線');
        }

        // Step 3: 從路線中找到符合的車次並取得 UUID
        let foundUuid: string | undefined;

        for (const route of tripResult.data.routes) {
          for (const section of route.sections) {
            if (section.transport?.mode === 'TRA' && section.transport.uuid) {
              // 檢查車次是否匹配（從 name 或 shortName 中提取）
              const trainInfo = section.transport.name || section.transport.shortName || '';
              if (trainInfo.includes(options.train)) {
                foundUuid = section.transport.uuid;
                break;
              }
            }
          }
          if (foundUuid) break;
        }

        // 如果沒找到指定車次，使用第一個台鐵路線的 UUID
        if (!foundUuid) {
          for (const route of tripResult.data.routes) {
            for (const section of route.sections) {
              if (section.transport?.mode === 'TRA' && section.transport.uuid) {
                foundUuid = section.transport.uuid;
                break;
              }
            }
            if (foundUuid) break;
          }
        }

        if (!foundUuid) {
          throw new Error('無法從旅運規劃結果中取得 UUID');
        }

        uuid = foundUuid;

        // Step 4: 用 UUID 換取 Deeplink URL
        const deeplinkResult = await api.getDeeplinkByUuid(uuid, 'TRA');

        if (deeplinkResult.result !== 'success' || !deeplinkResult.data?.length) {
          throw new Error(deeplinkResult.error?.msg || '無法取得 Deeplink URL');
        }

        url = deeplinkResult.data[0].deeplink;
        expiresAt = deeplinkResult.data[0].expired;

      } else if (options.app) {
        // APP 深度連結（直接方式）
        const result = await api.getBookingDeeplink({
          startStation: fromStation.name,
          endStation: toStation.name,
          date: options.date,
          trainNumber: options.train,
        });
        url = result.url;
      } else {
        // 網頁訂票連結
        const result = await api.getBookingWebUrl({
          startStation: fromStation.name,
          endStation: toStation.name,
          date: options.date,
          trainNumber: options.train,
          ticketType: ticketTypeInfo.id,
          ticketCount: quantity,
        });
        url = result.url;
      }
    } catch (error) {
      // API 失敗時使用 fallback
      usedApi = false;
      linkType = 'fallback';
      url = generateFallbackWebUrl({
        trainNo: options.train,
        fromStationName: fromStation.name,
        toStationName: toStation.name,
        date: options.date,
      });

      // 在非 JSON 模式下顯示錯誤訊息
      if (format !== 'json' && options.deeplink) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`警告：MAAS Deeplink 流程失敗 (${errorMsg})，改用基本連結`);
      }
    }

    // 輸出結果
    if (format === 'json') {
      const result: Record<string, unknown> = {
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
          apiUsed: usedApi,
        },
      };

      // Deeplink 額外資訊
      if (linkType === 'deeplink') {
        (result.data as Record<string, unknown>).uuid = uuid;
        (result.data as Record<string, unknown>).expiresAt = expiresAt;
        if (expiresAt) {
          const expiresDate = new Date(expiresAt.replace(' ', 'T') + '+08:00');
          const now = new Date();
          const expiresIn = Math.max(0, Math.floor((expiresDate.getTime() - now.getTime()) / 1000));
          (result.data as Record<string, unknown>).expiresIn = expiresIn;
        }
      }

      console.log(JSON.stringify(result, null, 2));
    } else {
      const typeLabel = linkType === 'deeplink' ? 'APP Deeplink'
        : linkType === 'app' ? 'APP'
        : linkType === 'fallback' ? '基本連結'
        : '網頁';

      console.log(`\n訂票連結（${typeLabel}）\n`);
      console.log(`車次：${options.train}`);
      console.log(`路線：${fromStation.name} → ${toStation.name}`);
      console.log(`日期：${options.date}`);
      console.log(`票種：${ticketTypeInfo.name}`);
      console.log(`數量：${quantity} 張`);
      console.log(`\n連結：${url}`);

      if (linkType === 'deeplink' && expiresAt) {
        console.log(`\n⚠️  此連結將於 ${expiresAt} 過期（約 3 分鐘）`);
        console.log('請在手機上點擊連結開啟台鐵 e 訂通 APP');
      }

      if (linkType === 'fallback') {
        console.log('\n(使用基本連結，部分參數可能需手動填寫)');
      }
    }

    // 自動開啟瀏覽器
    if (options.open && linkType !== 'app') {
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
