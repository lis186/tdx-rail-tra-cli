/**
 * Structured Logger - 結構化日誌系統
 * 🔧 P1 改善：JSON 格式日誌，支持 ELK、DataDog 等中央日誌系統
 * 特性：
 *   - JSON 格式輸出（易於機器解析）
 *   - 日誌級別控制
 *   - requestId 追蹤
 *   - 性能監控 (duration)
 *   - 錯誤堆棧記錄
 *   - 自定義上下文
 */

import { createHash, randomUUID } from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** 請求唯一識別碼，用於追蹤一個請求的完整生命週期 */
  requestId?: string;
  /** 用戶識別碼 */
  userId?: string;
  /** 操作類型 (GET, POST, 等) */
  method?: string;
  /** 請求 URL 或端點 */
  url?: string;
  /** 執行時間（毫秒） */
  duration?: number;
  /** 返回狀態碼 */
  statusCode?: number;
  /** 響應大小（字節） */
  responseSize?: number;
  /** 自定義數據 */
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

export interface LoggerConfig {
  /** 最小日誌級別 (default: 'info') */
  minLevel?: LogLevel;
  /** 是否輸出到控制台 (default: true) */
  console?: boolean;
  /** 是否輸出到文件 (default: false) */
  file?: boolean;
  /** 日誌文件路徑 */
  filePath?: string;
  /** 自定義格式化函數 */
  formatter?: (entry: LogEntry) => string;
  /** 是否包含堆棧追蹤 (default: true) */
  includeStack?: boolean;
}

/** 日誌級別優先級 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * 結構化日誌記錄器
 * 所有日誌都以 JSON 格式輸出，便於中央日誌系統解析
 */
export class StructuredLogger {
  private component: string;
  private config: Required<LoggerConfig>;
  private requestIdStack: string[] = [];

  constructor(
    component: string,
    config: LoggerConfig = {}
  ) {
    this.component = component;
    this.config = {
      minLevel: config.minLevel || 'info',
      console: config.console !== false,
      file: config.file || false,
      filePath: config.filePath || '',
      formatter: config.formatter || this.defaultFormatter,
      includeStack: config.includeStack !== false
    };
  }

  /**
   * 預設的日誌格式化函數
   */
  private defaultFormatter = (entry: LogEntry): string => {
    return JSON.stringify(entry);
  };

  /**
   * 檢查是否應該記錄此日誌
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * 輸出日誌
   */
  private output(entry: LogEntry): void {
    const formatted = this.config.formatter(entry);

    if (this.config.console) {
      // 根據日誌級別選擇輸出方法
      switch (entry.level) {
        case 'error':
          console.error(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'debug':
          console.debug(formatted);
          break;
        case 'info':
        default:
          console.log(formatted);
      }
    }

    // 日誌文件功能可在此實現
    // if (this.config.file && this.config.filePath) {
    //   appendFileSync(this.config.filePath, formatted + '\n');
    // }
  }

  /**
   * 記錄 DEBUG 級別日誌
   */
  debug(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (!this.shouldLog('debug')) return;

    this.log('debug', message, context, metadata);
  }

  /**
   * 記錄 INFO 級別日誌
   */
  info(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (!this.shouldLog('info')) return;

    this.log('info', message, context, metadata);
  }

  /**
   * 記錄 WARN 級別日誌
   */
  warn(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (!this.shouldLog('warn')) return;

    this.log('warn', message, context, metadata);
  }

  /**
   * 記錄 ERROR 級別日誌
   */
  error(
    message: string,
    error?: Error | null,
    context?: LogContext,
    metadata?: Record<string, any>
  ): void {
    if (!this.shouldLog('error')) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      component: this.component,
      context: this.enrichContext(context),
      metadata
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        code: (error as any).code,
        stack: this.config.includeStack ? error.stack : undefined
      };
    }

    this.output(entry);
  }

  /**
   * 通用日誌方法
   */
  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    metadata?: Record<string, any>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: this.component,
      context: this.enrichContext(context),
      metadata
    };

    this.output(entry);
  }

  /**
   * 增強上下文信息
   * 自動添加 requestId（如果存在）
   */
  private enrichContext(context?: LogContext): LogContext | undefined {
    if (!context) {
      // 如果沒有提供上下文但有 requestId 棧，添加當前的 requestId
      if (this.requestIdStack.length > 0) {
        return {
          requestId: this.requestIdStack[this.requestIdStack.length - 1]
        };
      }
      return undefined;
    }

    // 如果沒有提供 requestId，使用棧中的當前值
    if (!context.requestId && this.requestIdStack.length > 0) {
      context.requestId = this.requestIdStack[this.requestIdStack.length - 1];
    }

    return context;
  }

  /**
   * 生成或設定 requestId
   */
  generateRequestId(): string {
    const requestId = randomUUID();
    this.requestIdStack.push(requestId);
    return requestId;
  }

  /**
   * 推入新的 requestId（支持嵌套請求）
   */
  pushRequestId(requestId?: string): string {
    const id = requestId || randomUUID();
    this.requestIdStack.push(id);
    return id;
  }

  /**
   * 彈出當前的 requestId
   */
  popRequestId(): string | undefined {
    return this.requestIdStack.pop();
  }

  /**
   * 取得當前的 requestId
   */
  getCurrentRequestId(): string | undefined {
    return this.requestIdStack[this.requestIdStack.length - 1];
  }

  /**
   * 設定日誌最小級別
   */
  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  /**
   * 執行帶日誌的非同步操作
   */
  async trackAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Omit<LogContext, 'duration'>
  ): Promise<T> {
    const startTime = Date.now();
    const requestId = this.getCurrentRequestId();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.info(`${operation} 完成`, {
        ...context,
        requestId,
        duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.error(
        `${operation} 失敗`,
        error instanceof Error ? error : new Error(String(error)),
        {
          ...context,
          requestId,
          duration
        }
      );

      throw error;
    }
  }

  /**
   * 執行帶日誌的同步操作
   */
  trackSync<T>(
    operation: string,
    fn: () => T,
    context?: Omit<LogContext, 'duration'>
  ): T {
    const startTime = Date.now();
    const requestId = this.getCurrentRequestId();

    try {
      const result = fn();
      const duration = Date.now() - startTime;

      this.info(`${operation} 完成`, {
        ...context,
        requestId,
        duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.error(
        `${operation} 失敗`,
        error instanceof Error ? error : new Error(String(error)),
        {
          ...context,
          requestId,
          duration
        }
      );

      throw error;
    }
  }
}

/**
 * 預設的日誌記錄器實例
 * 按組件分類，便於按服務過濾日誌
 */
export const loggers = {
  api: new StructuredLogger('API', { minLevel: 'info' }),
  auth: new StructuredLogger('Auth', { minLevel: 'info' }),
  cache: new StructuredLogger('Cache', { minLevel: 'debug' }),
  rateLimit: new StructuredLogger('RateLimit', { minLevel: 'warn' }),
  circuitBreaker: new StructuredLogger('CircuitBreaker', { minLevel: 'info' }),
  retry: new StructuredLogger('Retry', { minLevel: 'debug' })
};

/**
 * 建立追蹤上下文（用於 Express/HTTP 中間件）
 */
export function createRequestContext(): LogContext {
  const requestId = randomUUID();
  return {
    requestId,
    method: undefined,
    url: undefined
  };
}

/**
 * 生成跨度 ID（用於分散追蹤）
 */
export function generateSpanId(): string {
  return randomUUID();
}

/**
 * 計算內容的哈希值（用於去重）
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 8);
}

/**
 * 時間格式化輔助函數
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 大小格式化輔助函數
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
}
