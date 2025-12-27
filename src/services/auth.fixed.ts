/**
 * ✅ 修复版本：Auth Service
 * OAuth2 认证服务 - 处理 TDX API Token 取得与快取
 *
 * 改进：单一飞行请求 (Single Flight Request) 模式
 * 避免多个并发 getToken() 重复请求
 */

import { ofetch } from 'ofetch';
import type { TokenResponse, CachedToken } from '../types/auth.js';

const TOKEN_ENDPOINT = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

// Token 提前 60 秒过期，避免邊界問題
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

export class AuthService {
  private clientId: string;
  private clientSecret: string;
  private cachedToken: CachedToken | null = null;

  // ✅ 新增：单一飞行请求（SFR）缓存
  // 当正在获取 token 时，保存这个 Promise
  // 其他并发请求会等待这个 Promise 而不是发起新请求
  private inFlightTokenPromise: Promise<string> | null = null;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * ✅ 取得有效的 Access Token (FIXED)
   * 改进：使用单一飞行请求模式
   * - 第一个请求：发起 API 调用
   * - 并发请求：等待第一个请求的结果
   * - 缓存有效：直接返回缓存
   */
  async getToken(): Promise<string> {
    // 1️⃣ 检查缓存是否有效
    if (this.isTokenValid()) {
      return this.cachedToken!.accessToken;
    }

    // 2️⃣ ✅ 检查是否有正在进行的请求
    if (this.inFlightTokenPromise) {
      // 其他请求正在获取 token，我们等待它
      return this.inFlightTokenPromise;
    }

    // 3️⃣ ✅ 发起新的 token 请求（并保存 Promise）
    this.inFlightTokenPromise = this.requestTokenWithCache();

    try {
      // 等待请求完成
      const token = await this.inFlightTokenPromise;
      return token;
    } finally {
      // 清除飞行中的标记（这样下一个请求可以发起新的）
      this.inFlightTokenPromise = null;
    }
  }

  /**
   * ✅ 新增：带缓存的 token 请求
   */
  private async requestTokenWithCache(): Promise<string> {
    // 再检查一次缓存（有可能其他请求在我们等待时已经更新了）
    if (this.isTokenValid()) {
      return this.cachedToken!.accessToken;
    }

    // 请求新的 token
    const response = await this.requestToken();

    // 计算过期时间（提前 buffer 秒过期）
    const expiresAt = Date.now() + (response.expires_in * 1000) - TOKEN_EXPIRY_BUFFER_MS;

    this.cachedToken = {
      accessToken: response.access_token,
      expiresAt,
    };

    return this.cachedToken.accessToken;
  }

  /**
   * 检查缓存的 token 是否有效
   */
  isTokenValid(): boolean {
    if (!this.cachedToken) {
      return false;
    }
    return Date.now() < this.cachedToken.expiresAt;
  }

  /**
   * 清除缓存的 token
   */
  clearCache(): void {
    this.cachedToken = null;
    // ✅ 注意：不清除 inFlightTokenPromise
    // 如果有请求在进行，让它继续（不要中断）
  }

  /**
   * 请求新的 token
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

  /**
   * ✅ 新增：调试用 - 查看是否有飞行中的请求
   */
  hasInflightRequest(): boolean {
    return this.inFlightTokenPromise !== null;
  }
}
