/**
 * 設定檔結構
 */
export interface AppConfig {
  /** TDX API Client ID */
  clientId?: string;
  /** TDX API Client Secret */
  clientSecret?: string;
  /** 預設輸出語言 */
  lang?: 'zh-TW' | 'en' | 'ja' | 'ko';
  /** 預設輸出格式 */
  format?: 'json' | 'table' | 'csv';
  /** 快取 TTL（秒） */
  cacheTtl?: number;
}

/**
 * 設定鍵值
 */
export type ConfigKey = keyof AppConfig;
