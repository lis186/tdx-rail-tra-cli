import { Command } from 'commander';
import { stationsCommand } from './commands/stations.js';
import { timetableCommand } from './commands/timetable.js';
import { tpassCommand } from './commands/tpass.js';
import { fareCommand } from './commands/fare.js';
import { liveCommand } from './commands/live.js';
import { bookCommand } from './commands/book.js';
import { linesCommand } from './commands/lines.js';
import { completionCommand } from './commands/completion.js';
import { journeyCommand } from './commands/journey.js';
import { alertsCommand } from './commands/alerts.js';
import { healthCommand } from './commands/health.js';
import { metricsCommand } from './commands/metrics.js';

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
cli.addCommand(timetableCommand);
cli.addCommand(tpassCommand);
cli.addCommand(fareCommand);
cli.addCommand(liveCommand);
cli.addCommand(bookCommand);
cli.addCommand(linesCommand);
cli.addCommand(completionCommand);
cli.addCommand(journeyCommand);
cli.addCommand(alertsCommand);
cli.addCommand(healthCommand);
cli.addCommand(metricsCommand);
