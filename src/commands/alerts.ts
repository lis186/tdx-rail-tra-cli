/**
 * Alerts Command
 * 阻通資訊查詢指令
 */

import { Command } from 'commander';
import { TDXApiClient } from '../services/api.js';
import { AlertService, NormalizedAlert } from '../services/alert.js';
import { ConfigService } from '../services/config.js';
import { StationResolver } from '../lib/station-resolver.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';

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

export const alertsCommand = new Command('alerts')
  .description('阻通資訊查詢')
  .option('--line <lineId>', '篩選特定路線 (如: PX, JJ)')
  .option('--station <station>', '篩選特定站點')
  .option('--no-cache', '不使用快取')
  .action(async (options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    try {
      const api = getApiClient();
      const alertService = new AlertService(api);

      let alerts = await alertService.getActiveAlerts({
        forceRefresh: !options.cache,
      });

      // 篩選路線
      if (options.line) {
        alerts = alerts.filter((alert) =>
          alert.affectedLineIds.has(options.line.toUpperCase())
        );
      }

      // 篩選站點
      if (options.station) {
        const result = resolver.resolve(options.station);

        if (!result || !result.success || !result.station) {
          if (format === 'json') {
            console.log(
              JSON.stringify({
                success: false,
                error: {
                  code: 'STATION_NOT_FOUND',
                  message: `找不到站點：${options.station}`,
                },
              })
            );
          } else {
            console.error(`找不到站點：${options.station}`);
          }
          process.exit(1);
        }

        alerts = alerts.filter((alert) => alert.affectedStationIds.has(result.station.id));
      }

      if (format === 'json') {
        console.log(
          JSON.stringify(
            {
              success: true,
              count: alerts.length,
              alerts: alerts.map(formatAlertForJson),
            },
            null,
            2
          )
        );
      } else {
        printAlertsTable(alerts);
      }
    } catch (error) {
      if (format === 'json') {
        console.log(
          JSON.stringify({
            success: false,
            error: {
              code: 'API_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
          })
        );
      } else {
        console.error(`查詢失敗：${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(1);
    }
  });

/**
 * 格式化 Alert 為 JSON 輸出
 */
function formatAlertForJson(alert: NormalizedAlert): {
  id: string;
  title: string;
  description: string;
  status: string;
  affectedLines: Array<{ id: string; name: string }>;
  affectedStations: Array<{ id: string; name: string }>;
  alternativeTransport?: string;
} {
  const affectedLines: Array<{ id: string; name: string }> = [];
  for (const [id, name] of alert.affectedLineNames) {
    affectedLines.push({ id, name });
  }

  const affectedStations: Array<{ id: string; name: string }> = [];
  for (const [id, name] of alert.affectedStationNames) {
    affectedStations.push({ id, name });
  }

  return {
    id: alert.id,
    title: alert.title,
    description: alert.description,
    status: alert.status,
    affectedLines,
    affectedStations,
    alternativeTransport: alert.alternativeTransport,
  };
}

/**
 * 印出阻通資訊表格
 */
function printAlertsTable(alerts: NormalizedAlert[]): void {
  if (alerts.length === 0) {
    console.log('\n✅ 目前沒有阻通資訊\n');
    return;
  }

  console.log(`\n🚨 阻通資訊 (${alerts.length} 筆)\n`);

  for (const alert of alerts) {
    // 取得路線名稱
    const lineNames = Array.from(alert.affectedLineNames.values()).join(', ') || '未知路線';

    // 取得站點範圍
    const stationNames = Array.from(alert.affectedStationNames.values());
    const stationRange =
      stationNames.length > 0
        ? `${stationNames[0]} ↔ ${stationNames[stationNames.length - 1]}`
        : '未知區間';

    console.log('─'.repeat(60));
    console.log(`📢 ${alert.title}`);
    console.log(`路線: ${lineNames}`);
    console.log(`區間: ${stationRange} (${stationNames.length} 站)`);
    console.log(`狀態: ${alert.status === 'active' ? '🔴 進行中' : '🟢 已解除'}`);
    console.log(`說明: ${alert.description}`);
    if (alert.alternativeTransport) {
      console.log(`替代: ${alert.alternativeTransport}`);
    }
  }

  console.log('─'.repeat(60));
  console.log('');
}
