/**
 * Stations Command
 * 車站查詢指令
 */

import { Command } from 'commander';
import { StationResolver } from '../lib/station-resolver.js';
import { getApiClient } from '../lib/api-client.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';
import { padEnd } from '../lib/display-width.js';
import type { Station } from '../types/station.js';
import type { StationExit, StationExitInfo } from '../types/api.js';

// 初始化 StationResolver
const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);

export const stationsCommand = new Command('stations')
  .description('車站查詢');

/**
 * tra stations list
 */
stationsCommand
  .command('list')
  .description('列出所有車站')
  .option('--id-only', '只顯示車站 ID')
  .option('--name-only', '只顯示車站名稱')
  .action((options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const stations = resolver.getAllStations();

    if (options.idOnly) {
      if (format === 'json') {
        console.log(JSON.stringify(stations.map((s) => s.id)));
      } else {
        console.log(stations.map((s) => s.id).join('\n'));
      }
      return;
    }

    if (options.nameOnly) {
      if (format === 'json') {
        console.log(JSON.stringify(stations.map((s) => s.name)));
      } else {
        console.log(stations.map((s) => s.name).join('\n'));
      }
      return;
    }

    if (format === 'json') {
      console.log(JSON.stringify(stations, null, 2));
    } else {
      console.log('ID\t名稱\t\t緯度\t\t經度');
      console.log('─'.repeat(60));
      for (const station of stations) {
        console.log(`${station.id}\t${station.name}\t\t${station.lat}\t\t${station.lon}`);
      }
      console.log(`\n共 ${stations.length} 個車站`);
    }
  });

/**
 * tra stations search <query>
 */
stationsCommand
  .command('search <query>')
  .description('搜尋車站（支援模糊搜尋）')
  .option('-l, --limit <number>', '限制結果數量', '10')
  .action((query, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const limit = parseInt(options.limit, 10);

    const results = resolver.search(query, limit);

    if (format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else {
      if (results.length === 0) {
        console.log(`找不到符合「${query}」的車站`);
        return;
      }

      console.log(`搜尋「${query}」的結果：\n`);
      console.log('ID\t名稱\t\t緯度\t\t經度');
      console.log('─'.repeat(60));
      for (const station of results) {
        console.log(`${station.id}\t${station.name}\t\t${station.lat}\t\t${station.lon}`);
      }
      console.log(`\n共 ${results.length} 個結果`);
    }
  });

/**
 * tra stations info <station>
 */
stationsCommand
  .command('info <station>')
  .description('取得車站詳細資訊（支援 ID、名稱、別名）')
  .action((stationInput, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const result = resolver.resolve(stationInput);

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (!result.success) {
        console.error(`錯誤：${result.error.message}`);
        if (result.error.suggestion) {
          console.log(`建議：${result.error.suggestion}`);
        }
        if (result.error.candidates.length > 0) {
          console.log(`相似車站：${result.error.candidates.join('、')}`);
        }
        process.exit(1);
      }

      const station = result.station;
      console.log(`車站資訊：${station.name}\n`);
      console.log(`  ID：${station.id}`);
      console.log(`  名稱：${station.name}`);
      console.log(`  緯度：${station.lat}`);
      console.log(`  經度：${station.lon}`);
      console.log(`  信心度：${result.confidence}`);
    }
  });

/**
 * tra stations resolve <station>
 */
stationsCommand
  .command('resolve <station>')
  .description('解析車站名稱為 ID（用於腳本整合）')
  .action((stationInput, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const result = resolver.resolve(stationInput);

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (!result.success) {
        console.error(result.error.message);
        process.exit(1);
      }
      console.log(result.station.id);
    }
  });

/**
 * tra stations exits <station>
 */
stationsCommand
  .command('exits <station>')
  .description('查詢車站出口資訊')
  .option('--elevator', '僅顯示有電梯的出口')
  .option('--map', '顯示平面圖連結')
  .option('--no-cache', '不使用快取')
  .action(async (stationInput, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    // 解析車站
    const result = resolver.resolve(stationInput);
    if (!result.success) {
      if (format === 'json') {
        console.log(JSON.stringify({ success: false, error: result.error }));
      } else {
        console.error(`錯誤：無法解析車站「${stationInput}」`);
        if (result.error.suggestion) {
          console.error(`建議：${result.error.suggestion}`);
        }
      }
      process.exit(1);
    }

    const stationInfo = result.station;

    try {
      const api = getApiClient();
      const exits = await api.getStationExits(stationInfo.id, {
        skipCache: !options.cache,
      });

      if (exits.length === 0) {
        if (format === 'json') {
          console.log(JSON.stringify({
            success: false,
            error: {
              code: 'NO_EXIT_DATA',
              message: `找不到 ${stationInfo.name} 的出口資訊`,
            },
          }));
        } else {
          console.error(`找不到 ${stationInfo.name} 的出口資訊`);
        }
        process.exit(1);
      }

      const stationExit = exits[0];
      let filteredExits = stationExit.Exits;

      // 篩選有電梯的出口
      if (options.elevator) {
        filteredExits = filteredExits.filter((e) => e.Elevator);
      }

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          station: {
            id: stationExit.StationID,
            name: stationExit.StationName.Zh_tw,
          },
          exitCount: filteredExits.length,
          exits: filteredExits.map(formatExitForJson),
          maps: options.map ? stationExit.ExitMapURLs.map((m) => ({
            name: m.MapName.Zh_tw || m.MapName.En || '平面圖',
            url: m.MapURL,
            floor: m.FloorLevel || null,
          })) : undefined,
        }, null, 2));
      } else {
        printExitsTable(stationExit, filteredExits, options.map);
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
 * 格式化出口為 JSON 輸出
 */
function formatExitForJson(exit: StationExitInfo): {
  id: string;
  name: string;
  address: string;
  position: { lat: number; lon: number };
  accessibility: { stair: boolean; escalator: number; elevator: boolean };
} {
  return {
    id: exit.ExitID,
    name: exit.ExitName.Zh_tw || exit.ExitName.En || exit.ExitID,
    address: exit.LocationDescription,
    position: {
      lat: exit.ExitPosition.PositionLat,
      lon: exit.ExitPosition.PositionLon,
    },
    accessibility: {
      stair: exit.Stair,
      escalator: exit.Escalator,
      elevator: exit.Elevator,
    },
  };
}

/**
 * 印出出口表格
 */
function printExitsTable(
  stationExit: StationExit,
  exits: StationExitInfo[],
  showMaps: boolean
): void {
  console.log(`\n${stationExit.StationName.Zh_tw}站 出口資訊\n`);

  if (exits.length === 0) {
    console.log('無符合條件的出口');
    return;
  }

  const COL = { name: 8, address: 24, escalator: 6, elevator: 4 };
  console.log([
    padEnd('出口', COL.name),
    padEnd('地址', COL.address),
    padEnd('電扶梯', COL.escalator),
    '電梯',
  ].join('  '));
  console.log('─'.repeat(48));

  for (const exit of exits) {
    const name = exit.ExitName.Zh_tw || exit.ExitName.En || '--';
    const address = exit.LocationDescription || '--';
    const escalator = exit.Escalator > 0 ? String(exit.Escalator) : '--';
    const elevator = exit.Elevator ? '✓' : '--';

    console.log([
      padEnd(name, COL.name),
      padEnd(address.length > 22 ? address.substring(0, 20) + '..' : address, COL.address),
      padEnd(escalator, COL.escalator),
      elevator,
    ].join('  '));
  }

  console.log(`\n共 ${exits.length} 個出口`);

  // 顯示平面圖
  if (showMaps && stationExit.ExitMapURLs.length > 0) {
    console.log('\n平面圖：');
    for (const map of stationExit.ExitMapURLs) {
      const mapName = map.MapName.Zh_tw || map.MapName.En || '平面圖';
      if (map.MapURL && map.MapURL.length > 10) {
        console.log(`  - ${mapName}: ${map.MapURL}`);
      }
    }
  }
}
