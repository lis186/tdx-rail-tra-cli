import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StructuredLogger,
  LogLevel,
  loggers,
  createRequestContext,
  generateSpanId,
  hashContent,
  formatDuration,
  formatBytes
} from '../../src/lib/logger.js';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let consoleSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    logger = new StructuredLogger('TestComponent');
    // 監視 console 輸出
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Basic Logging', () => {
    it('should log info messages', () => {
      logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalledOnce();
      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Test message');
      expect(parsed.component).toBe('TestComponent');
      expect(parsed.timestamp).toBeDefined();
    });

    it('should log with context', () => {
      logger.info('API Request', {
        requestId: 'req-123',
        method: 'GET',
        url: '/api/stations'
      });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.context.requestId).toBe('req-123');
      expect(parsed.context.method).toBe('GET');
      expect(parsed.context.url).toBe('/api/stations');
    });

    it('should log with metadata', () => {
      logger.info('User action', { requestId: 'req-123' }, {
        userId: 'user-456',
        action: 'login'
      });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.metadata.userId).toBe('user-456');
      expect(parsed.metadata.action).toBe('login');
    });
  });

  describe('Log Levels', () => {
    it('should respect log level filtering', () => {
      const debugLogger = new StructuredLogger('Test', { minLevel: 'warn' });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      debugLogger.debug('Debug message');
      debugLogger.info('Info message');
      debugLogger.warn('Warn message');
      debugLogger.error('Error message');

      // 只有 warn 和 error 應該被記錄
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should use correct console methods for each level', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.warn('Warning message');
      logger.error('Error message');

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Error Logging', () => {
    it('should log error with stack trace', () => {
      const error = new Error('Test error');
      error.name = 'CustomError';
      (error as any).code = 'TEST_CODE';

      logger.error('Operation failed', error, { operation: 'fetch' });

      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.error.name).toBe('CustomError');
      expect(parsed.error.message).toBe('Test error');
      expect(parsed.error.code).toBe('TEST_CODE');
      expect(parsed.error.stack).toBeDefined();
      expect(parsed.level).toBe('error');
    });

    it('should not include stack trace when disabled', () => {
      const logger2 = new StructuredLogger('Test', { includeStack: false });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('Test error');
      logger2.error('Operation failed', error);

      const parsed = JSON.parse(spy.mock.calls[0][0]);
      expect(parsed.error.stack).toBeUndefined();

      spy.mockRestore();
    });

    it('should handle null error', () => {
      logger.error('Operation failed', null);

      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.error).toBeUndefined();
      expect(parsed.level).toBe('error');
    });
  });

  describe('RequestId Tracking', () => {
    it('should generate requestId', () => {
      const requestId = logger.generateRequestId();
      expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should track requestId in logs', () => {
      const requestId = logger.generateRequestId();
      logger.info('Test message');

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.context.requestId).toBe(requestId);
    });

    it('should support requestId stack', () => {
      const id1 = logger.pushRequestId();
      expect(logger.getCurrentRequestId()).toBe(id1);

      const id2 = logger.pushRequestId();
      expect(logger.getCurrentRequestId()).toBe(id2);

      logger.popRequestId();
      expect(logger.getCurrentRequestId()).toBe(id1);

      logger.popRequestId();
      expect(logger.getCurrentRequestId()).toBeUndefined();
    });

    it('should accept custom requestId', () => {
      const customId = 'custom-123';
      logger.pushRequestId(customId);

      expect(logger.getCurrentRequestId()).toBe(customId);
      logger.popRequestId();
    });
  });

  describe('Async Tracking', () => {
    it('should track async operations', async () => {
      const result = await logger.trackAsync(
        'Fetch stations',
        async () => {
          // 模擬延遲
          await new Promise(resolve => setTimeout(resolve, 50));
          return ['station1', 'station2'];
        },
        { url: '/api/stations' }
      );

      expect(result).toEqual(['station1', 'station2']);

      // 應該記錄完成的日誌
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.message).toContain('完成');
      expect(parsed.context.duration).toBeGreaterThanOrEqual(50);
    });

    it('should log async operation failures', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('Fetch failed');

      await expect(
        logger.trackAsync(
          'Fetch stations',
          async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            throw error;
          }
        )
      ).rejects.toThrow('Fetch failed');

      const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(parsed.message).toContain('失敗');
      expect(parsed.error.message).toBe('Fetch failed');
      expect(parsed.context.duration).toBeGreaterThanOrEqual(30);

      errorSpy.mockRestore();
    });
  });

  describe('Sync Tracking', () => {
    it('should track sync operations', () => {
      const result = logger.trackSync(
        'Parse data',
        () => {
          return JSON.parse('{"key": "value"}');
        },
        { dataType: 'json' }
      );

      expect(result).toEqual({ key: 'value' });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.message).toContain('完成');
      expect(parsed.context.duration).toBeDefined();
    });

    it('should log sync operation failures', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        logger.trackSync(
          'Parse data',
          () => {
            throw new Error('Invalid JSON');
          }
        );
      }).toThrow('Invalid JSON');

      const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(parsed.message).toContain('失敗');

      errorSpy.mockRestore();
    });
  });

  describe('Log Level Management', () => {
    it('should change minimum log level', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logger.setMinLevel('warn');
      logger.info('Info message');
      logger.warn('Warn message');

      // 只應記錄 warn
      expect(warnSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
    });
  });

  describe('Custom Formatter', () => {
    it('should use custom formatter', () => {
      const customFormatter = (entry: any) => `[${entry.level}] ${entry.message}`;
      const logger2 = new StructuredLogger('Test', { formatter: customFormatter });
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger2.info('Test message');

      expect(spy).toHaveBeenCalledWith('[info] Test message');

      spy.mockRestore();
    });
  });

  describe('Timestamp Format', () => {
    it('should use ISO 8601 format for timestamps', () => {
      logger.info('Test message');

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      const timestamp = new Date(parsed.timestamp);

      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });
});

describe('Predefined Loggers', () => {
  it('should have predefined loggers for different components', () => {
    expect(loggers.api).toBeInstanceOf(StructuredLogger);
    expect(loggers.auth).toBeInstanceOf(StructuredLogger);
    expect(loggers.cache).toBeInstanceOf(StructuredLogger);
    expect(loggers.rateLimit).toBeInstanceOf(StructuredLogger);
    expect(loggers.circuitBreaker).toBeInstanceOf(StructuredLogger);
    expect(loggers.retry).toBeInstanceOf(StructuredLogger);
  });

  it('should have correct component names', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    loggers.api.info('Test');
    let parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.component).toBe('API');

    loggers.auth.info('Test');
    parsed = JSON.parse(spy.mock.calls[1][0]);
    expect(parsed.component).toBe('Auth');

    spy.mockRestore();
  });
});

describe('Helper Functions', () => {
  it('should create request context', () => {
    const context = createRequestContext();

    expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(context.method).toBeUndefined();
    expect(context.url).toBeUndefined();
  });

  it('should generate unique span IDs', () => {
    const span1 = generateSpanId();
    const span2 = generateSpanId();

    expect(span1).not.toBe(span2);
    expect(span1).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should hash content', () => {
    const hash1 = hashContent('test content');
    const hash2 = hashContent('test content');
    const hash3 = hashContent('different content');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(8);
  });

  it('should format duration', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(0)).toBe('0ms');
  });

  it('should format bytes', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(500)).toBe('500B');
    expect(formatBytes(1024)).toBe('1KB');
    expect(formatBytes(1024 * 1024)).toBe('1MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1GB');
  });
});

describe('JSON Output Format', () => {
  let logger: StructuredLogger;
  let consoleSpy: any;

  beforeEach(() => {
    logger = new StructuredLogger('TestComponent');
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should output valid JSON', () => {
    logger.info('Test message', { requestId: 'req-123' });

    const logOutput = consoleSpy.mock.calls[0][0];
    expect(() => JSON.parse(logOutput)).not.toThrow();
  });

  it('should include all required fields', () => {
    logger.info('Test message', { requestId: 'req-123' });

    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);

    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('level');
    expect(parsed).toHaveProperty('message');
    expect(parsed).toHaveProperty('component');
  });

  it('should omit undefined fields', () => {
    logger.info('Test message');

    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);

    // context 應該是 undefined 而不是 null
    expect(Object.keys(parsed)).not.toContain('metadata');
  });
});
