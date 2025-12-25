/**
 * Stations Command
 * 車站查詢指令
 */

import { Command } from 'commander';
import { StationResolver } from '../lib/station-resolver.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';
import type { Station } from '../types/station.js';

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
