import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from '../../src/services/auth.js';

// Mock ofetch
vi.mock('ofetch', () => ({
  ofetch: vi.fn(),
}));

// Mock CacheService
vi.mock('../../src/services/cache.js', () => ({
  CacheService: vi.fn(() => ({
    get: vi.fn(() => null), // 預設返回 null，表示無快取
    set: vi.fn(),
  })),
}));

import { ofetch } from 'ofetch';

describe('AuthService', () => {
  let authService: AuthService;
  const mockClientId = 'test-client-id';
  const mockClientSecret = 'test-client-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(mockClientId, mockClientSecret);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getToken', () => {
    it('should request new token when no cached token', async () => {
      const mockToken = {
        access_token: 'new-token-123',
        expires_in: 86400,
        token_type: 'Bearer',
      };

      vi.mocked(ofetch).mockResolvedValueOnce(mockToken);

      const token = await authService.getToken();

      expect(token).toBe('new-token-123');
      expect(ofetch).toHaveBeenCalledTimes(1);
      expect(ofetch).toHaveBeenCalledWith(
        'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should return cached token when valid', async () => {
      const mockToken = {
        access_token: 'cached-token-456',
        expires_in: 86400,
        token_type: 'Bearer',
      };

      vi.mocked(ofetch).mockResolvedValueOnce(mockToken);

      // 第一次呼叫
      const token1 = await authService.getToken();
      expect(token1).toBe('cached-token-456');

      // 第二次呼叫應使用快取
      const token2 = await authService.getToken();
      expect(token2).toBe('cached-token-456');

      // ofetch 只應該被呼叫一次
      expect(ofetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh token when expired', async () => {
      const mockToken1 = {
        access_token: 'first-token',
        expires_in: 1, // 1 秒後過期
        token_type: 'Bearer',
      };

      const mockToken2 = {
        access_token: 'second-token',
        expires_in: 86400,
        token_type: 'Bearer',
      };

      vi.mocked(ofetch)
        .mockResolvedValueOnce(mockToken1)
        .mockResolvedValueOnce(mockToken2);

      // 第一次呼叫
      const token1 = await authService.getToken();
      expect(token1).toBe('first-token');

      // 等待 token 過期
      await new Promise(resolve => setTimeout(resolve, 1100));

      // 第二次呼叫應該請求新 token
      const token2 = await authService.getToken();
      expect(token2).toBe('second-token');

      expect(ofetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error on auth failure', async () => {
      vi.mocked(ofetch).mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(authService.getToken()).rejects.toThrow('Unauthorized');
    });

    it('should send correct form data', async () => {
      const mockToken = {
        access_token: 'token',
        expires_in: 86400,
        token_type: 'Bearer',
      };

      vi.mocked(ofetch).mockResolvedValueOnce(mockToken);

      await authService.getToken();

      expect(ofetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: expect.stringContaining('grant_type=client_credentials'),
        })
      );

      // 檢查 body 包含正確的參數
      const call = vi.mocked(ofetch).mock.calls[0];
      const body = call[1]?.body as string;
      expect(body).toContain(`client_id=${mockClientId}`);
      expect(body).toContain(`client_secret=${mockClientSecret}`);
    });
  });

  describe('clearCache', () => {
    it('should clear cached token', async () => {
      const mockToken = {
        access_token: 'cached-token',
        expires_in: 86400,
        token_type: 'Bearer',
      };

      vi.mocked(ofetch).mockResolvedValue(mockToken);

      await authService.getToken();
      expect(ofetch).toHaveBeenCalledTimes(1);

      authService.clearCache();

      await authService.getToken();
      expect(ofetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('isTokenValid', () => {
    it('should return false when no token', () => {
      expect(authService.isTokenValid()).toBe(false);
    });

    it('should return true when token is valid', async () => {
      const mockToken = {
        access_token: 'valid-token',
        expires_in: 86400,
        token_type: 'Bearer',
      };

      vi.mocked(ofetch).mockResolvedValueOnce(mockToken);

      await authService.getToken();
      expect(authService.isTokenValid()).toBe(true);
    });
  });
});
