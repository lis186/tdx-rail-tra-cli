import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { ConfigService } from '../../src/services/config.js';

describe('Config Command', () => {
  let testConfigPath: string;
  let config: ConfigService;

  beforeEach(() => {
    testConfigPath = path.join(os.tmpdir(), `tdx-config-test-${Date.now()}.json`);
    config = new ConfigService(testConfigPath);
  });

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  describe('set / get', () => {
    it('should set and get lang', () => {
      config.set('lang', 'en');
      expect(config.get('lang')).toBe('en');
    });

    it('should set and get clientId', () => {
      config.set('clientId', 'test-id');
      expect(config.get('clientId')).toBe('test-id');
    });

    it('should return undefined for unset key', () => {
      expect(config.get('format')).toBeUndefined();
    });
  });

  describe('list (getAll)', () => {
    it('should return empty object when nothing configured', () => {
      expect(config.getAll()).toEqual({});
    });

    it('should return all set values', () => {
      config.set('lang', 'en');
      config.set('clientId', 'abc');
      const all = config.getAll();
      expect(all.lang).toBe('en');
      expect(all.clientId).toBe('abc');
    });
  });

  describe('path', () => {
    it('should return the config file path', () => {
      expect(config.getConfigPath()).toBe(testConfigPath);
    });
  });

  describe('hasCredentials', () => {
    let savedId: string | undefined;
    let savedSecret: string | undefined;

    beforeEach(() => {
      savedId = process.env.TDX_CLIENT_ID;
      savedSecret = process.env.TDX_CLIENT_SECRET;
      delete process.env.TDX_CLIENT_ID;
      delete process.env.TDX_CLIENT_SECRET;
    });

    afterEach(() => {
      if (savedId !== undefined) process.env.TDX_CLIENT_ID = savedId;
      else delete process.env.TDX_CLIENT_ID;
      if (savedSecret !== undefined) process.env.TDX_CLIENT_SECRET = savedSecret;
      else delete process.env.TDX_CLIENT_SECRET;
    });

    it('should return false when no credentials', () => {
      expect(config.hasCredentials()).toBe(false);
    });

    it('should return true when both credentials are set', () => {
      config.set('clientId', 'id');
      config.set('clientSecret', 'secret');
      expect(config.hasCredentials()).toBe(true);
    });

    it('should return false with only clientId', () => {
      config.set('clientId', 'id');
      expect(config.hasCredentials()).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should persist values across instances', () => {
      config.set('lang', 'ja');
      const config2 = new ConfigService(testConfigPath);
      expect(config2.get('lang')).toBe('ja');
    });
  });
});
