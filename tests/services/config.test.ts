import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigService } from '../../src/services/config.js';
import type { AppConfig } from '../../src/types/config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ConfigService', () => {
  let configService: ConfigService;
  let testConfigDir: string;
  let testConfigPath: string;

  beforeEach(() => {
    // 清除環境變數以隔離測試
    vi.stubEnv('TDX_CLIENT_ID', '');
    vi.stubEnv('TDX_CLIENT_SECRET', '');

    // 使用暫時目錄進行測試
    testConfigDir = path.join(os.tmpdir(), `tdx-tra-test-${Date.now()}`);
    testConfigPath = path.join(testConfigDir, 'config.json');
    configService = new ConfigService(testConfigPath);
  });

  afterEach(() => {
    // 清理測試目錄
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('get/set', () => {
    it('should return undefined for non-existent key', () => {
      expect(configService.get('clientId')).toBeUndefined();
    });

    it('should set and get a value', () => {
      configService.set('clientId', 'test-id');
      expect(configService.get('clientId')).toBe('test-id');
    });

    it('should persist values to file', () => {
      configService.set('clientId', 'persistent-id');

      // 建立新的 service 實例讀取同一檔案
      const newService = new ConfigService(testConfigPath);
      expect(newService.get('clientId')).toBe('persistent-id');
    });

    it('should handle all config keys', () => {
      configService.set('clientId', 'id');
      configService.set('clientSecret', 'secret');
      configService.set('lang', 'en');
      configService.set('format', 'table');
      configService.set('cacheTtl', 3600);

      expect(configService.get('clientId')).toBe('id');
      expect(configService.get('clientSecret')).toBe('secret');
      expect(configService.get('lang')).toBe('en');
      expect(configService.get('format')).toBe('table');
      expect(configService.get('cacheTtl')).toBe(3600);
    });
  });

  describe('getAll', () => {
    it('should return empty object when no config', () => {
      expect(configService.getAll()).toEqual({});
    });

    it('should return all config values', () => {
      configService.set('clientId', 'id');
      configService.set('lang', 'ja');

      const all = configService.getAll();
      expect(all.clientId).toBe('id');
      expect(all.lang).toBe('ja');
    });
  });

  describe('delete', () => {
    it('should delete a config value', () => {
      configService.set('clientId', 'to-delete');
      expect(configService.get('clientId')).toBe('to-delete');

      configService.delete('clientId');
      expect(configService.get('clientId')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all config values', () => {
      configService.set('clientId', 'id');
      configService.set('clientSecret', 'secret');

      configService.clear();

      expect(configService.get('clientId')).toBeUndefined();
      expect(configService.get('clientSecret')).toBeUndefined();
    });
  });

  describe('getConfigPath', () => {
    it('should return the config file path', () => {
      expect(configService.getConfigPath()).toBe(testConfigPath);
    });
  });

  describe('credentials from environment', () => {
    it('should read TDX_CLIENT_ID from environment', () => {
      vi.stubEnv('TDX_CLIENT_ID', 'env-client-id');

      const service = new ConfigService(testConfigPath);
      expect(service.getClientId()).toBe('env-client-id');
    });

    it('should read TDX_CLIENT_SECRET from environment', () => {
      vi.stubEnv('TDX_CLIENT_SECRET', 'env-client-secret');

      const service = new ConfigService(testConfigPath);
      expect(service.getClientSecret()).toBe('env-client-secret');
    });

    it('should prefer environment over config file', () => {
      configService.set('clientId', 'config-id');
      vi.stubEnv('TDX_CLIENT_ID', 'env-id');

      const service = new ConfigService(testConfigPath);
      expect(service.getClientId()).toBe('env-id');
    });

    it('should fall back to config file when env not set', () => {
      configService.set('clientId', 'config-id');
      vi.stubEnv('TDX_CLIENT_ID', '');

      const service = new ConfigService(testConfigPath);
      expect(service.getClientId()).toBe('config-id');
    });
  });

  describe('hasCredentials', () => {
    it('should return false when no credentials', () => {
      expect(configService.hasCredentials()).toBe(false);
    });

    it('should return false when only clientId is set', () => {
      configService.set('clientId', 'id');
      expect(configService.hasCredentials()).toBe(false);
    });

    it('should return true when both credentials are set', () => {
      configService.set('clientId', 'id');
      configService.set('clientSecret', 'secret');
      expect(configService.hasCredentials()).toBe(true);
    });

    it('should return true when credentials are from environment', () => {
      vi.stubEnv('TDX_CLIENT_ID', 'env-id');
      vi.stubEnv('TDX_CLIENT_SECRET', 'env-secret');

      const service = new ConfigService(testConfigPath);
      expect(service.hasCredentials()).toBe(true);
    });
  });
});
