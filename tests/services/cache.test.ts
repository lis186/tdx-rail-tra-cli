import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheService } from '../../src/services/cache.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('CacheService', () => {
  let cacheService: CacheService;
  let testCacheDir: string;

  beforeEach(() => {
    testCacheDir = path.join(os.tmpdir(), `tdx-tra-cache-test-${Date.now()}`);
    cacheService = new CacheService(testCacheDir);
  });

  afterEach(() => {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true });
    }
  });

  describe('set/get', () => {
    it('should store and retrieve data', () => {
      const data = { name: '臺北', id: '1000' };
      cacheService.set('stations', data);

      const retrieved = cacheService.get('stations');
      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent key', () => {
      expect(cacheService.get('non-existent')).toBeNull();
    });

    it('should persist data to file', () => {
      const data = { test: true };
      cacheService.set('test-data', data);

      // 建立新實例讀取同一目錄
      const newService = new CacheService(testCacheDir);
      expect(newService.get('test-data')).toEqual(data);
    });

    it('should handle nested keys with slashes', () => {
      const data = { trains: ['123', '456'] };
      cacheService.set('timetable/od-1000-4400-2025-01-01', data);

      const retrieved = cacheService.get('timetable/od-1000-4400-2025-01-01');
      expect(retrieved).toEqual(data);
    });
  });

  describe('TTL', () => {
    it('should return data within TTL', () => {
      const data = { value: 'valid' };
      cacheService.set('ttl-test', data, 10000); // 10 秒 TTL

      expect(cacheService.get('ttl-test')).toEqual(data);
    });

    it('should return null after TTL expires', async () => {
      const data = { value: 'expired' };
      cacheService.set('ttl-expired', data, 100); // 100ms TTL

      // 等待過期
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cacheService.get('ttl-expired')).toBeNull();
    });

    it('should use default TTL when not specified', () => {
      const data = { value: 'default' };
      cacheService.set('default-ttl', data);

      // 應該立即可用（預設 TTL 較長）
      expect(cacheService.get('default-ttl')).toEqual(data);
    });
  });

  describe('delete', () => {
    it('should delete cached data', () => {
      cacheService.set('to-delete', { value: true });
      expect(cacheService.get('to-delete')).not.toBeNull();

      cacheService.delete('to-delete');
      expect(cacheService.get('to-delete')).toBeNull();
    });

    it('should handle non-existent key gracefully', () => {
      expect(() => cacheService.delete('non-existent')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all cached data', () => {
      cacheService.set('key1', { a: 1 });
      cacheService.set('key2', { b: 2 });

      cacheService.clear();

      expect(cacheService.get('key1')).toBeNull();
      expect(cacheService.get('key2')).toBeNull();
    });

    it('should clear only specific prefix', () => {
      cacheService.set('timetable/od-1', { a: 1 });
      cacheService.set('timetable/od-2', { b: 2 });
      cacheService.set('stations', { c: 3 });

      cacheService.clear('timetable');

      expect(cacheService.get('timetable/od-1')).toBeNull();
      expect(cacheService.get('timetable/od-2')).toBeNull();
      expect(cacheService.get('stations')).toEqual({ c: 3 });
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      cacheService.set('exists', { value: true });
      expect(cacheService.has('exists')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cacheService.has('not-exists')).toBe(false);
    });

    it('should return false for expired key', async () => {
      cacheService.set('expires', { value: true }, 100);
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cacheService.has('expires')).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return cache status', () => {
      cacheService.set('key1', { a: 1 });
      cacheService.set('key2', { b: 2 });

      const status = cacheService.getStatus();

      expect(status.cacheDir).toBe(testCacheDir);
      expect(status.fileCount).toBe(2);
      expect(status.totalSize).toBeGreaterThan(0);
    });

    it('should return zero for empty cache', () => {
      const status = cacheService.getStatus();

      expect(status.fileCount).toBe(0);
      expect(status.totalSize).toBe(0);
    });
  });

  describe('getCacheDir', () => {
    it('should return the cache directory', () => {
      expect(cacheService.getCacheDir()).toBe(testCacheDir);
    });
  });
});
