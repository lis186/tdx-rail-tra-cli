/**
 * Auth Service
 * OAuth2 認證服務 - 處理 TDX API Token 取得與快取
 */

import { ofetch } from 'ofetch';
import type { TokenResponse, CachedToken } from '../types/auth.js';

const TOKEN_ENDPOINT = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

// Token 提前 60 秒過期，避免邊界問題
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

export class AuthService {
  private clientId: string;
  private clientSecret: string;
  private cachedToken: CachedToken | null = null;

  // 🔧 改進（P0 修復）：單一飛行請求（SFR）模式
  // 記錄正在進行的 token 請求，避免並發時重複發起 API 呼叫
  private inFlightTokenPromise: Promise<string> | null = null;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
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
      return this.cachedToken!.accessToken;
    }

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
   */
  private async requestTokenWithCache(): Promise<string> {
    // 再檢查一次快取（有可能其他請求在我們等待時已經更新了）
    if (this.isTokenValid()) {
      return this.cachedToken!.accessToken;
    }

    // 請求新的 token
    const response = await this.requestToken();

    // 計算過期時間（提前 buffer 秒過期）
    const expiresAt = Date.now() + (response.expires_in * 1000) - TOKEN_EXPIRY_BUFFER_MS;

    this.cachedToken = {
      accessToken: response.access_token,
      expiresAt,
    };

    return this.cachedToken.accessToken;
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
