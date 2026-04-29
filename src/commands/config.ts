import { Command } from 'commander';
import { input, password, confirm } from '@inquirer/prompts';
import { getConfigService } from '../services/config.js';
import type { ConfigKey } from '../types/config.js';

const VALID_KEYS: ConfigKey[] = ['clientId', 'clientSecret', 'lang', 'format', 'cacheTtl'];

export const configCommand = new Command('config')
  .description('設定管理');

configCommand
  .command('init')
  .description('互動式初始化設定')
  .action(async () => {
    const config = getConfigService();
    const existing = config.getAll();

    console.log('TDX API 設定初始化');
    console.log('─'.repeat(40));
    console.log('請至 https://tdx.transportdata.tw 申請 API 憑證\n');

    const clientId = await input({
      message: 'TDX Client ID:',
      default: existing.clientId || '',
      validate: (v) => v.trim().length > 0 || 'Client ID 不能為空',
    });

    const clientSecret = await password({
      message: 'TDX Client Secret:',
      mask: '*',
      validate: (v) => v.trim().length > 0 || 'Client Secret 不能為空',
    });

    config.set('clientId', clientId.trim());
    config.set('clientSecret', clientSecret.trim());

    const ok = await confirm({ message: '設定完成，儲存？', default: true });
    if (!ok) {
      console.log('已取消');
      process.exit(0);
    }

    console.log(`\n✓ 設定已儲存至 ${config.getConfigPath()}`);
  });

configCommand
  .command('set <key> <value>')
  .description(`設定值 (可用 key: ${VALID_KEYS.join(', ')})`)
  .action((key: string, value: string) => {
    if (!VALID_KEYS.includes(key as ConfigKey)) {
      console.error(`錯誤：未知的設定鍵 "${key}"`);
      console.error(`可用的 key: ${VALID_KEYS.join(', ')}`);
      process.exit(1);
    }

    const config = getConfigService();
    config.set(key as ConfigKey, value as never);
    console.log(`✓ ${key} = ${key === 'clientSecret' ? '***' : value}`);
  });

configCommand
  .command('get <key>')
  .description('讀取設定值')
  .action((key: string) => {
    if (!VALID_KEYS.includes(key as ConfigKey)) {
      console.error(`錯誤：未知的設定鍵 "${key}"`);
      process.exit(1);
    }

    const config = getConfigService();
    const value = config.get(key as ConfigKey);

    if (value === undefined) {
      console.log(`(未設定)`);
    } else if (key === 'clientSecret') {
      console.log('***');
    } else {
      console.log(String(value));
    }
  });

configCommand
  .command('list')
  .description('列出所有設定')
  .action(() => {
    const config = getConfigService();
    const all = config.getAll();

    if (Object.keys(all).length === 0) {
      console.log('(尚無設定)');
      return;
    }

    for (const [k, v] of Object.entries(all)) {
      const display = k === 'clientSecret' ? '***' : String(v);
      console.log(`${k} = ${display}`);
    }
  });

configCommand
  .command('path')
  .description('顯示設定檔路徑')
  .action(() => {
    const config = getConfigService();
    console.log(config.getConfigPath());
  });
