/**
 * Lines Command
 * 路線查詢指令
 */

import { Command } from 'commander';
import { TDXApiClient } from '../services/api.js';
import { ConfigService } from '../services/config.js';
import type { Line, StationOfLine } from '../types/api.js';
import { padEnd } from '../lib/display-width.js';

// 初始化
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

export const linesCommand = new Command('lines')
  .description('路線查詢');

/**
 * tra lines list
 */
linesCommand
  .command('list')
  .description('列出所有路線')
  .option('--no-cache', '不使用快取')
  .action(async (options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    try {
      const api = getApiClient();
      const lines = await api.getLines({ skipCache: !options.cache });

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          count: lines.length,
          lines: lines.map(formatLineForJson),
        }, null, 2));
      } else {
        printLinesTable(lines);
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
 * tra lines get <lineId>
 */
linesCommand
  .command('get <lineId>')
  .description('查詢路線詳情')
  .option('--no-cache', '不使用快取')
  .action(async (lineId, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    try {
      const api = getApiClient();
      const lines = await api.getLines({ skipCache: !options.cache });
      const line = lines.find((l) => l.LineID === lineId);

      if (!line) {
        if (format === 'json') {
          console.log(JSON.stringify({
            success: false,
            error: {
              code: 'LINE_NOT_FOUND',
              message: `找不到路線 ${lineId}`,
            },
          }));
        } else {
          console.error(`找不到路線 ${lineId}`);
        }
        process.exit(1);
      }

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          line: formatLineForJson(line),
        }, null, 2));
      } else {
        console.log(`\n路線 ${line.LineID}`);
        console.log(`名稱：${line.LineName.Zh_tw}`);
        console.log(`英文：${line.LineName.En}`);
        if (line.LineSectionName) {
          console.log(`區段：${line.LineSectionName.Zh_tw}`);
        }
        if (line.IsBranch !== undefined) {
          console.log(`支線：${line.IsBranch ? '是' : '否'}`);
        }
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
 * tra lines stations <lineId>
 */
linesCommand
  .command('stations <lineId>')
  .description('查詢路線經過的車站')
  .option('--no-cache', '不使用快取')
  .action(async (lineId, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    try {
      const api = getApiClient();
      const stationOfLine = await api.getStationsOfLine(lineId, { skipCache: !options.cache });

      if (!stationOfLine) {
        if (format === 'json') {
          console.log(JSON.stringify({
            success: false,
            error: {
              code: 'LINE_NOT_FOUND',
              message: `找不到路線 ${lineId} 的車站資料`,
            },
          }));
        } else {
          console.error(`找不到路線 ${lineId} 的車站資料`);
        }
        process.exit(1);
      }

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          lineId: stationOfLine.LineID,
          count: stationOfLine.Stations.length,
          stations: stationOfLine.Stations.map((s) => ({
            sequence: s.Sequence,
            stationId: s.StationID,
            stationName: s.StationName.Zh_tw,
            stationNameEn: s.StationName.En,
            distance: s.CumulativeDistance,
          })),
        }, null, 2));
      } else {
        printStationsOfLineTable(lineId, stationOfLine);
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
 * 格式化路線為 JSON 輸出
 */
function formatLineForJson(line: Line): {
  lineId: string;
  lineName: string;
  lineNameEn: string;
  sectionName?: string;
  isBranch?: boolean;
} {
  return {
    lineId: line.LineID,
    lineName: line.LineName.Zh_tw,
    lineNameEn: line.LineName.En,
    sectionName: line.LineSectionName?.Zh_tw,
    isBranch: line.IsBranch,
  };
}

/**
 * 印出路線列表表格
 */
function printLinesTable(lines: Line[]): void {
  console.log('\nTRA 路線列表\n');

  if (lines.length === 0) {
    console.log('沒有找到路線資料');
    return;
  }

  const COL = { lineId: 10, name: 14, section: 10, branch: 4 };
  console.log([
    padEnd('路線ID', COL.lineId),
    padEnd('名稱', COL.name),
    padEnd('區段', COL.section),
    '支線',
  ].join('  '));
  console.log('─'.repeat(44));

  for (const line of lines) {
    const name = line.LineName.Zh_tw;
    const section = line.LineSectionName?.Zh_tw || '--';
    const isBranch = line.IsBranch ? '是' : '否';

    console.log([
      padEnd(line.LineID, COL.lineId),
      padEnd(name, COL.name),
      padEnd(section, COL.section),
      isBranch,
    ].join('  '));
  }

  console.log(`\n共 ${lines.length} 條路線`);
}

/**
 * 印出路線車站表格
 */
function printStationsOfLineTable(lineId: string, stationOfLine: StationOfLine): void {
  console.log(`\n路線 ${lineId} 車站列表\n`);

  if (stationOfLine.Stations.length === 0) {
    console.log('沒有車站資料');
    return;
  }

  const COL = { seq: 4, stationId: 8, name: 10, distance: 10 };
  console.log([
    padEnd('序號', COL.seq),
    padEnd('站ID', COL.stationId),
    padEnd('站名', COL.name),
    '里程(km)',
  ].join('  '));
  console.log('─'.repeat(38));

  for (const station of stationOfLine.Stations) {
    const name = station.StationName.Zh_tw;
    const distance = station.CumulativeDistance !== undefined
      ? `${(station.CumulativeDistance / 1000).toFixed(1)}`
      : '--';

    console.log([
      padEnd(String(station.Sequence), COL.seq),
      padEnd(station.StationID, COL.stationId),
      padEnd(name, COL.name),
      distance,
    ].join('  '));
  }

  console.log(`\n共 ${stationOfLine.Stations.length} 站`);
}
