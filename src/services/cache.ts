/**
 * Cache Service
 * 檔案快取服務 - 處理資料快取的讀寫與 TTL 管理
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'tdx-tra');
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 小時

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheStatus {
  cacheDir: string;
  fileCount: number;
  totalSize: number;
}

export class CacheService {
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || DEFAULT_CACHE_DIR;
    this.ensureDir(this.cacheDir);
  }

  /**
   * 確保目錄存在
   */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 將 key 轉換為檔案路徑
   */
  private keyToPath(key: string): string {
    // 將 / 轉換為子目錄
    const parts = key.split('/');
    const fileName = `${parts.pop()}.json`;
    const subDir = parts.length > 0 ? path.join(this.cacheDir, ...parts) : this.cacheDir;
    this.ensureDir(subDir);
    return path.join(subDir, fileName);
  }

  /**
   * 儲存資料到快取
   */
  set<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
    const filePath = this.keyToPath(key);
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    };
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8');
  }

  /**
   * 從快取讀取資料
   */
  get<T>(key: string): T | null {
    const filePath = this.keyToPath(key);

    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(content) as CacheEntry<T>;

      // 檢查是否過期
      if (Date.now() > entry.expiresAt) {
        // 過期則刪除
        this.delete(key);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  /**
   * 檢查快取是否存在且有效
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * 刪除快取
   */
  delete(key: string): void {
    const filePath = this.keyToPath(key);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 忽略刪除錯誤
    }
  }

  /**
   * 清除快取
   * @param prefix 只清除特定前綴的快取
   */
  clear(prefix?: string): void {
    if (prefix) {
      // 清除特定前綴
      const prefixDir = path.join(this.cacheDir, prefix);
      if (fs.existsSync(prefixDir)) {
        fs.rmSync(prefixDir, { recursive: true });
      }
    } else {
      // 清除所有
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          const filePath = path.join(this.cacheDir, file);
          fs.rmSync(filePath, { recursive: true });
        }
      }
    }
  }

  /**
   * 取得快取狀態
   */
  getStatus(): CacheStatus {
    let fileCount = 0;
    let totalSize = 0;

    const countFiles = (dir: string): void => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          countFiles(itemPath);
        } else if (item.isFile() && item.name.endsWith('.json')) {
          fileCount++;
          totalSize += fs.statSync(itemPath).size;
        }
      }
    };

    countFiles(this.cacheDir);

    return {
      cacheDir: this.cacheDir,
      fileCount,
      totalSize,
    };
  }

  /**
   * 取得快取目錄
   */
  getCacheDir(): string {
    return this.cacheDir;
  }
}

// 預設實例
let defaultInstance: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!defaultInstance) {
    defaultInstance = new CacheService();
  }
  return defaultInstance;
}
