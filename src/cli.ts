import { Command } from 'commander';

export const cli = new Command();

cli
  .name('tra')
  .description('Taiwan Railway (TRA) CLI tool powered by TDX API')
  .version('0.1.0');

// Commands will be registered here
