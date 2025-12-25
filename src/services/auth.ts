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

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * 取得有效的 Access Token
   * 如果快取中有有效 token 則返回，否則請求新的
   */
  async getToken(): Promise<string> {
    // 檢查快取是否有效
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
