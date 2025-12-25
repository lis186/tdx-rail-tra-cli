/**
 * TPASS Command
 * TPASS 月票查詢指令
 */

import { Command } from 'commander';
import { StationResolver } from '../lib/station-resolver.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../data/stations.js';
import {
  checkTpassEligibility,
  getAllRegions,
  getRegionByName,
  getEligibleTrainTypes,
  getExcludedTrainTypes,
} from '../lib/tpass.js';

// Initialize resolver
const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);

export const tpassCommand = new Command('tpass')
  .description('TPASS 月票查詢');

/**
 * tra tpass check <from> <to>
 */
tpassCommand
  .command('check <from> <to>')
  .description('檢查起訖站 TPASS 適用性')
  .action(async (from, to, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    // Resolve stations
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

    // Check TPASS eligibility
    const result = checkTpassEligibility(
      fromStation.id,
      toStation.id,
      fromStation.name,
      toStation.name
    );

    if (format === 'json') {
      if (result.eligible) {
        console.log(JSON.stringify({
          success: true,
          eligible: true,
          regions: result.regions?.map((r) => ({
            id: r.id,
            name: r.name,
            price: r.price,
            priceRange: r.priceRange,
          })),
          eligibleTrainTypes: getEligibleTrainTypes(),
          excludedTrainTypes: getExcludedTrainTypes(),
        }, null, 2));
      } else {
        console.log(JSON.stringify({
          success: true,
          eligible: false,
          reason: result.reason,
          from: result.from,
          to: result.to,
          suggestion: result.suggestion,
        }, null, 2));
      }
    } else {
      if (result.eligible) {
        console.log(`\nTPASS 適用性檢查：${fromStation.name} → ${toStation.name}\n`);
        console.log('✅ 可使用 TPASS\n');
        console.log('適用生活圈：');
        for (const region of result.regions || []) {
          const priceStr = region.priceRange || `$${region.price}`;
          console.log(`  - ${region.name} (${priceStr})`);
        }
        console.log('\n適用車種：');
        for (const trainType of getEligibleTrainTypes()) {
          console.log(`  ✓ ${trainType}`);
        }
        console.log('\n不適用車種：');
        for (const trainType of getExcludedTrainTypes()) {
          console.log(`  ✗ ${trainType}`);
        }
      } else {
        console.log(`\nTPASS 適用性檢查：${fromStation.name} → ${toStation.name}\n`);
        console.log('❌ 無法使用 TPASS\n');
        console.log(`原因：${result.suggestion}`);
        if (result.from && result.to) {
          console.log(`\n起站「${result.from.stationName}」所屬生活圈：${result.from.regions.join('、') || '無'}`);
          console.log(`迄站「${result.to.stationName}」所屬生活圈：${result.to.regions.join('、') || '無'}`);
        }
      }
    }
  });

/**
 * tra tpass regions
 */
tpassCommand
  .command('regions')
  .description('列出所有 TPASS 生活圈')
  .action(async (options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';
    const regions = getAllRegions();

    if (format === 'json') {
      console.log(JSON.stringify({
        success: true,
        count: regions.length,
        regions: regions.map((r) => ({
          id: r.id,
          name: r.name,
          price: r.price,
          priceRange: r.priceRange,
          stationCount: r.stationIds.length,
        })),
      }, null, 2));
    } else {
      console.log('\nTPASS 生活圈\n');
      console.log('代碼\t\t名稱\t\t票價\t\t車站數');
      console.log('─'.repeat(60));
      for (const region of regions) {
        const priceStr = region.priceRange || `$${region.price}`;
        const idPad = region.id.padEnd(8);
        const namePad = region.name.padEnd(10);
        console.log(`${idPad}\t${namePad}\t${priceStr.padEnd(12)}\t${region.stationIds.length}`);
      }
      console.log(`\n共 ${regions.length} 個生活圈`);
    }
  });

/**
 * tra tpass stations <region>
 */
tpassCommand
  .command('stations <region>')
  .description('列出指定生活圈的車站')
  .action(async (regionInput, options, cmd) => {
    const format = cmd.optsWithGlobals().format || 'json';

    const region = getRegionByName(regionInput);
    if (!region) {
      if (format === 'json') {
        console.log(JSON.stringify({
          success: false,
          error: {
            code: 'REGION_NOT_FOUND',
            message: `找不到生活圈「${regionInput}」`,
            suggestion: '使用 tra tpass regions 查看所有生活圈',
          },
        }));
      } else {
        console.error(`錯誤：找不到生活圈「${regionInput}」`);
        console.error('使用 tra tpass regions 查看所有生活圈');
      }
      process.exit(1);
    }

    // Resolve station names from IDs
    const stations = region.stationIds.map((id) => {
      const station = TRA_STATIONS.find((s) => s.id === id);
      return station ? { id, name: station.name } : { id, name: id };
    });

    if (format === 'json') {
      console.log(JSON.stringify({
        success: true,
        region: {
          id: region.id,
          name: region.name,
          price: region.price,
          priceRange: region.priceRange,
        },
        count: stations.length,
        stations,
      }, null, 2));
    } else {
      const priceStr = region.priceRange || `$${region.price}`;
      console.log(`\n${region.name}生活圈 (${priceStr})\n`);
      console.log('車站列表：');
      console.log('─'.repeat(40));

      // Group stations for display (6 per row)
      const stationNames = stations.map((s) => s.name);
      for (let i = 0; i < stationNames.length; i += 6) {
        const row = stationNames.slice(i, i + 6);
        console.log(row.map((n) => n.padEnd(6)).join('  '));
      }

      console.log(`\n共 ${stations.length} 個車站`);
    }
  });
