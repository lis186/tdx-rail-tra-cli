/**
 * Config Service
 * 設定管理服務 - 處理設定檔讀寫與環境變數
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AppConfig, ConfigKey } from '../types/config.js';
import type { ApiKeyCredential } from '../types/api-key.js';

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.config', 'tdx-tra');
const DEFAULT_CONFIG_FILE = 'config.json';

export class ConfigService {
  private configPath: string;
  private config: AppConfig;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_FILE);
    this.config = this.load();
  }

  /**
   * 載入設定檔
   */
  private load(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(content) as AppConfig;
      }
    } catch {
      // 忽略讀取錯誤，使用空設定
    }
    return {};
  }

  /**
   * 儲存設定檔
   */
  private save(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  /**
   * 取得設定值
   */
  get<K extends ConfigKey>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * 設定值
   */
  set<K extends ConfigKey>(key: K, value: AppConfig[K]): void {
    this.config[key] = value;
    this.save();
  }

  /**
   * 取得所有設定
   */
  getAll(): AppConfig {
    return { ...this.config };
  }

  /**
   * 刪除設定值
   */
  delete(key: ConfigKey): void {
    delete this.config[key];
    this.save();
  }

  /**
   * 清除所有設定
   */
  clear(): void {
    this.config = {};
    this.save();
  }

  /**
   * 取得設定檔路徑
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 取得 Client ID（優先環境變數）
   */
  getClientId(): string | undefined {
    const envValue = process.env.TDX_CLIENT_ID;
    if (envValue && envValue.length > 0) {
      return envValue;
    }
    return this.config.clientId;
  }

  /**
   * 取得 Client Secret（優先環境變數）
   */
  getClientSecret(): string | undefined {
    const envValue = process.env.TDX_CLIENT_SECRET;
    if (envValue && envValue.length > 0) {
      return envValue;
    }
    return this.config.clientSecret;
  }

  /**
   * 檢查是否有完整的認證資訊
   */
  hasCredentials(): boolean {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();
    return Boolean(clientId && clientSecret);
  }

  /**
   * 取得所有 API Key 憑證
   * 支援編號後綴格式：TDX_CLIENT_ID, TDX_CLIENT_ID_2, ..., TDX_CLIENT_ID_10
   * @returns ApiKeyCredential[] 至少一組（如有設定），否則空陣列
   */
  getApiKeys(): ApiKeyCredential[] {
    const keys: ApiKeyCredential[] = [];
    const maxKeys = 10;

    // 1. 主要 Key（無後綴）
    const mainId = this.getClientId();
    const mainSecret = this.getClientSecret();
    if (mainId && mainSecret) {
      keys.push({
        id: 'key-1',
        clientId: mainId,
        clientSecret: mainSecret,
        label: process.env.TDX_KEY_LABEL || 'primary',
      });
    }

    // 2. 額外 Key（後綴 _2, _3, ..., _10）
    for (let i = 2; i <= maxKeys; i++) {
      const id = process.env[`TDX_CLIENT_ID_${i}`];
      const secret = process.env[`TDX_CLIENT_SECRET_${i}`];

      if (id && secret) {
        keys.push({
          id: `key-${i}`,
          clientId: id,
          clientSecret: secret,
          label: process.env[`TDX_KEY_LABEL_${i}`] || `key-${i}`,
        });
      }
    }

    return keys;
  }

  /**
   * 檢查是否有多組 API Key
   */
  hasMultipleKeys(): boolean {
    return this.getApiKeys().length > 1;
  }
}

// 預設實例
let defaultInstance: ConfigService | null = null;

export function getConfigService(): ConfigService {
  if (!defaultInstance) {
    defaultInstance = new ConfigService();
  }
  return defaultInstance;
}
