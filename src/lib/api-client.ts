/**
 * API Client Helper
 * 提供共用的 TDXApiClient 建立函數
 */

import { TDXApiClient } from '../services/api.js';
import { getConfigService } from '../services/config.js';

let cachedClient: TDXApiClient | null = null;
let cachedKeysFingerprint: string | null = null;

export function getApiClient(): TDXApiClient {
  const config = getConfigService();
  const keys = config.getApiKeys();

  if (keys.length === 0) {
    console.error('錯誤：尚未設定 TDX API 憑證');
    console.error('請設定環境變數 TDX_CLIENT_ID 和 TDX_CLIENT_SECRET');
    console.error('或執行 tra config init 進行設定');
    process.exit(1);
  }

  const fingerprint = JSON.stringify(keys.map(k => k.clientId));
  if (!cachedClient || cachedKeysFingerprint !== fingerprint) {
    cachedClient = new TDXApiClient(keys);
    cachedKeysFingerprint = fingerprint;
  }

  return cachedClient;
}

/**
 * 清除快取的 Client（用於測試）
 */
export function clearApiClientCache(): void {
  cachedClient = null;
  cachedKeysFingerprint = null;
}

/**
 * 取得 API 容量資訊
 */
export function getApiCapacity(): { available: number; max: number; keyCount: number } {
  const client = getApiClient();
  const capacity = client.getPoolCapacity();
  return {
    ...capacity,
    keyCount: client.getPoolMetrics().length,
  };
}
