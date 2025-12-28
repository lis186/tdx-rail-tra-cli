/**
 * ConfigService Multi-Key Tests
 * 測試多組 API Key 配置讀取
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigService } from '../../src/services/config.js';

describe('ConfigService Multi-Key', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // 清空環境變數
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.TDX_CLIENT_ID;
    delete process.env.TDX_CLIENT_SECRET;
    delete process.env.TDX_KEY_LABEL;
    for (let i = 2; i <= 10; i++) {
      delete process.env[`TDX_CLIENT_ID_${i}`];
      delete process.env[`TDX_CLIENT_SECRET_${i}`];
      delete process.env[`TDX_KEY_LABEL_${i}`];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getApiKeys', () => {
    it('should return empty array when no keys configured', () => {
      const config = new ConfigService('/tmp/nonexistent-config.json');
      expect(config.getApiKeys()).toEqual([]);
    });

    it('should return single key when only main key configured', () => {
      process.env.TDX_CLIENT_ID = 'main-id';
      process.env.TDX_CLIENT_SECRET = 'main-secret';

      const config = new ConfigService('/tmp/nonexistent-config.json');
      const keys = config.getApiKeys();

      expect(keys).toHaveLength(1);
      expect(keys[0]).toEqual({
        id: 'key-1',
        clientId: 'main-id',
        clientSecret: 'main-secret',
        label: 'primary',
      });
    });

    it('should use custom label for main key', () => {
      process.env.TDX_CLIENT_ID = 'main-id';
      process.env.TDX_CLIENT_SECRET = 'main-secret';
      process.env.TDX_KEY_LABEL = 'Production';

      const config = new ConfigService('/tmp/nonexistent-config.json');
      const keys = config.getApiKeys();

      expect(keys[0].label).toBe('Production');
    });

    it('should return multiple keys with numbered suffixes', () => {
      process.env.TDX_CLIENT_ID = 'id-1';
      process.env.TDX_CLIENT_SECRET = 'secret-1';
      process.env.TDX_CLIENT_ID_2 = 'id-2';
      process.env.TDX_CLIENT_SECRET_2 = 'secret-2';
      process.env.TDX_CLIENT_ID_3 = 'id-3';
      process.env.TDX_CLIENT_SECRET_3 = 'secret-3';

      const config = new ConfigService('/tmp/nonexistent-config.json');
      const keys = config.getApiKeys();

      expect(keys).toHaveLength(3);
      expect(keys[0].clientId).toBe('id-1');
      expect(keys[1].clientId).toBe('id-2');
      expect(keys[2].clientId).toBe('id-3');
    });

    it('should use custom labels for numbered keys', () => {
      process.env.TDX_CLIENT_ID = 'id-1';
      process.env.TDX_CLIENT_SECRET = 'secret-1';
      process.env.TDX_KEY_LABEL = 'Primary';
      process.env.TDX_CLIENT_ID_2 = 'id-2';
      process.env.TDX_CLIENT_SECRET_2 = 'secret-2';
      process.env.TDX_KEY_LABEL_2 = 'Secondary';

      const config = new ConfigService('/tmp/nonexistent-config.json');
      const keys = config.getApiKeys();

      expect(keys[0].label).toBe('Primary');
      expect(keys[1].label).toBe('Secondary');
    });

    it('should skip incomplete numbered keys (missing secret)', () => {
      process.env.TDX_CLIENT_ID = 'id-1';
      process.env.TDX_CLIENT_SECRET = 'secret-1';
      process.env.TDX_CLIENT_ID_2 = 'id-2';
      // Missing TDX_CLIENT_SECRET_2
      process.env.TDX_CLIENT_ID_3 = 'id-3';
      process.env.TDX_CLIENT_SECRET_3 = 'secret-3';

      const config = new ConfigService('/tmp/nonexistent-config.json');
      const keys = config.getApiKeys();

      // Should only have key 1 and 3 (key 2 is incomplete)
      expect(keys).toHaveLength(2);
      expect(keys[0].clientId).toBe('id-1');
      expect(keys[1].clientId).toBe('id-3');
    });

    it('should support up to 10 keys', () => {
      for (let i = 1; i <= 10; i++) {
        const suffix = i === 1 ? '' : `_${i}`;
        process.env[`TDX_CLIENT_ID${suffix}`] = `id-${i}`;
        process.env[`TDX_CLIENT_SECRET${suffix}`] = `secret-${i}`;
      }

      const config = new ConfigService('/tmp/nonexistent-config.json');
      const keys = config.getApiKeys();

      expect(keys).toHaveLength(10);
      expect(keys[9].clientId).toBe('id-10');
    });

    it('should ignore keys beyond 10', () => {
      process.env.TDX_CLIENT_ID = 'id-1';
      process.env.TDX_CLIENT_SECRET = 'secret-1';
      process.env.TDX_CLIENT_ID_11 = 'id-11';
      process.env.TDX_CLIENT_SECRET_11 = 'secret-11';

      const config = new ConfigService('/tmp/nonexistent-config.json');
      const keys = config.getApiKeys();

      expect(keys).toHaveLength(1);
      expect(keys[0].clientId).toBe('id-1');
    });
  });

  describe('hasMultipleKeys', () => {
    it('should return false when no keys configured', () => {
      const config = new ConfigService('/tmp/nonexistent-config.json');
      expect(config.hasMultipleKeys()).toBe(false);
    });

    it('should return false when only one key configured', () => {
      process.env.TDX_CLIENT_ID = 'id-1';
      process.env.TDX_CLIENT_SECRET = 'secret-1';

      const config = new ConfigService('/tmp/nonexistent-config.json');
      expect(config.hasMultipleKeys()).toBe(false);
    });

    it('should return true when multiple keys configured', () => {
      process.env.TDX_CLIENT_ID = 'id-1';
      process.env.TDX_CLIENT_SECRET = 'secret-1';
      process.env.TDX_CLIENT_ID_2 = 'id-2';
      process.env.TDX_CLIENT_SECRET_2 = 'secret-2';

      const config = new ConfigService('/tmp/nonexistent-config.json');
      expect(config.hasMultipleKeys()).toBe(true);
    });
  });
});
