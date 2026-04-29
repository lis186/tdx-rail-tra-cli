/**
 * Auth Service
 * OAuth2 認證服務 - 處理 TDX API Token 取得與快取
 */

import { ofetch } from 'ofetch';
import * as metrics from '../lib/metrics.js';
import { CacheService } from './cache.js';
import type { TokenResponse, CachedToken } from '../types/auth.js';

const TOKEN_ENDPOINT = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

// Token 提前 60 秒過期，避免邊界問題
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

// Token 快取鍵名
const TOKEN_CACHE_KEY = 'auth/token';

// Token 快取 TTL：24 小時（與 TDX API Token 有效期一致）
const TOKEN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class AuthService {
  private clientId: string;
  private clientSecret: string;
  private cachedToken: CachedToken | null = null;
  private cacheService: CacheService;

  // 🔧 改進（P0 修復）：單一飛行請求（SFR）模式
  // 記錄正在進行的 token 請求，避免並發時重複發起 API 呼叫
  private inFlightTokenPromise: Promise<string> | null = null;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.cacheService = new CacheService();

    // 🔧 改進（P2 優化）：啟動時從磁碟載入 Token
    this.loadTokenFromDisk();
  }

  /**
   * 🔧 新增（P2 優化）：從磁碟載入快取的 Token
   * 這樣每次進程重啟時都可以重用之前的 Token，避免重複認證
   */
  private loadTokenFromDisk(): void {
    try {
      const cached = this.cacheService.get<CachedToken>(TOKEN_CACHE_KEY);
      if (cached && this.isTokenValidStatic(cached)) {
        this.cachedToken = cached;
        // 🔧 記錄磁碟快取命中 (P2 改善)
        metrics.recordAuthCacheHit();
      }
    } catch (error) {
      // 忽略讀取錯誤，繼續使用內存快取
    }
  }

  /**
   * 🔧 新增（P2 優化）：保存 Token 到磁碟
   */
  private saveTokenToDisk(): void {
    if (this.cachedToken) {
      try {
        this.cacheService.set<CachedToken>(
          TOKEN_CACHE_KEY,
          this.cachedToken,
          TOKEN_CACHE_TTL_MS,
          true
        );
      } catch (error) {
        // 忽略保存錯誤，Token 仍在內存中
      }
    }
  }

  /**
   * 取得有效的 Access Token
   * 🔧 改進（P0 修復）：使用單一飛行請求模式
   * - 快取有效：直接返回
   * - 有請求進行中：等待進行中的請求
   * - 快取無效：發起新請求並保存 Promise
   */
  async getToken(): Promise<string> {
    // 1️⃣ 檢查快取是否有效
    if (this.isTokenValid()) {
      // 🔧 記錄快取命中 (P2 改善)
      metrics.recordAuthCacheHit();
      return this.cachedToken!.accessToken;
    }

    // 記錄快取未命中
    metrics.recordAuthCacheMiss();

    // 2️⃣ 檢查是否有正在進行的請求
    if (this.inFlightTokenPromise) {
      // 其他請求正在取得 token，我們等待它而不是再發一個
      return this.inFlightTokenPromise;
    }

    // 3️⃣ 發起新的 token 請求（並保存 Promise）
    this.inFlightTokenPromise = this.requestTokenWithCache();

    try {
      // 等待請求完成
      const token = await this.inFlightTokenPromise;
      return token;
    } finally {
      // 清除飛行中的標記（這樣下一個請求可以發起新的）
      this.inFlightTokenPromise = null;
    }
  }

  /**
   * 🔧 新增（P0 修復）：帶快取的 token 請求
   * 🔧 改進（P2 優化）：現在保存 Token 到磁碟
   */
  private async requestTokenWithCache(): Promise<string> {
    // 再檢查一次快取（有可能其他請求在我們等待時已經更新了）
    if (this.isTokenValid()) {
      metrics.recordAuthCacheHit();
      return this.cachedToken!.accessToken;
    }

    // 請求新的 token
    try {
      const response = await this.requestToken();

      // 計算過期時間（提前 buffer 秒過期）
      const expiresAt = Date.now() + (response.expires_in * 1000) - TOKEN_EXPIRY_BUFFER_MS;

      this.cachedToken = {
        accessToken: response.access_token,
        expiresAt,
      };

      // 🔧 改進（P2 優化）：保存 Token 到磁碟
      this.saveTokenToDisk();

      // 🔧 記錄 token 請求成功 (P2 改善)
      metrics.recordAuthTokenRequest(true);

      return this.cachedToken.accessToken;
    } catch (error) {
      // 🔧 記錄 token 請求失敗 (P2 改善)
      const reason = error instanceof Error ? error.message : 'unknown';
      metrics.recordAuthTokenRequest(false);
      metrics.recordAuthFailure(reason);
      throw error;
    }
  }

  /**
   * 檢查快取的 token 是否有效
   */
  isTokenValid(): boolean {
    if (!this.cachedToken) {
      return false;
    }
    return Date.now() < this.cachedToken.expiresAt;
  }

  /**
   * 🔧 新增（P2 優化）：靜態驗證方法
   * 用於驗證從磁碟讀取的 Token，無需依賴 this.cachedToken
   */
  private isTokenValidStatic(token: CachedToken | null): boolean {
    if (!token) {
      return false;
    }
    return Date.now() < token.expiresAt;
  }

  /**
   * 清除快取的 token
   */
  clearCache(): void {
    this.cachedToken = null;
    // 注意：不清除 inFlightTokenPromise
    // 如果有請求在進行，讓它繼續（不要中斷）
  }

  /**
   * 🔧 新增（調試用）：檢查是否有飛行中的請求
   */
  hasInflightRequest(): boolean {
    return this.inFlightTokenPromise !== null;
  }

  /**
   * 請求新的 token
   */
  private async requestToken(): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    }).toString();

    const response = await ofetch<TokenResponse>(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    return response;
  }
}
