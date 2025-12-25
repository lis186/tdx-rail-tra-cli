import { Command } from 'commander';
import { stationsCommand } from './commands/stations.js';

export const cli = new Command();

cli
  .name('tra')
  .description('Taiwan Railway (TRA) CLI tool powered by TDX API')
  .version('0.1.0');

// 全域選項
cli
  .option('-f, --format <format>', '輸出格式: json (default) | table', 'json')
  .option('-q, --quiet', '安靜模式')
  .option('-v, --verbose', '詳細模式');

// 註冊指令
cli.addCommand(stationsCommand);
