/**
 * Watch Mode Utility
 * 即時監控模式工具 - 提供定期更新顯示功能
 */

/**
 * Watch 選項
 */
export interface WatchOptions {
  /** 更新間隔（秒），預設 30 */
  interval?: number;
  /** 清除畫面，預設 true */
  clearScreen?: boolean;
  /** 顯示更新時間，預設 true */
  showUpdateTime?: boolean;
}

/**
 * Watch 回呼函數類型
 */
export type WatchCallback = () => Promise<void>;

/**
 * 清除終端畫面
 */
export function clearScreen(): void {
  // ANSI escape codes for clearing screen and moving cursor to top-left
  process.stdout.write('\x1B[2J\x1B[0f');
}

/**
 * 格式化現在時間
 */
export function formatNow(): string {
  return new Date().toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * 執行 Watch 模式
 * @param callback 每次更新時執行的回呼函數
 * @param options Watch 選項
 * @returns 停止 watch 的函數
 */
export function startWatch(
  callback: WatchCallback,
  options: WatchOptions = {}
): () => void {
  const {
    interval = 30,
    clearScreen: shouldClear = true,
    showUpdateTime = true,
  } = options;

  let isRunning = true;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const run = async () => {
    if (!isRunning) return;

    try {
      if (shouldClear) {
        clearScreen();
      }

      if (showUpdateTime) {
        console.log(`🕐 更新時間：${formatNow()}`);
        console.log(`   下次更新：${interval} 秒後（按 Ctrl+C 停止）\n`);
      }

      await callback();
    } catch (error) {
      console.error(`\n更新失敗：${error instanceof Error ? error.message : String(error)}`);
    }

    if (isRunning) {
      timeoutId = setTimeout(run, interval * 1000);
    }
  };

  // 處理 SIGINT (Ctrl+C)
  const handleSignal = () => {
    isRunning = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    console.log('\n\n👋 已停止監控模式');
    process.exit(0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  // 開始第一次執行
  run();

  // 回傳停止函數
  return () => {
    isRunning = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
  };
}

/**
 * 簡單的 watch 包裝器（用於單次執行場景）
 */
export async function runWithWatch(
  callback: WatchCallback,
  watch: boolean,
  options: WatchOptions = {}
): Promise<void> {
  if (watch) {
    startWatch(callback, options);
    // 在 watch 模式下不會結束，除非收到信號
  } else {
    await callback();
  }
}
