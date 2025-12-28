/**
 * Output Formatter
 * 統一輸出格式處理：json | table | toon
 */

import { toToon, measureTokenSavings } from './toon-formatter.js';

export type OutputFormat = 'json' | 'table' | 'toon';

/**
 * 格式化輸出資料
 */
export function formatOutput(
  data: unknown,
  format: OutputFormat = 'json'
): string {
  switch (format) {
    case 'toon':
      return toToon(data as Parameters<typeof toToon>[0]);
    case 'json':
    default:
      return JSON.stringify(data, null, 2);
  }
}

/**
 * 輸出資料到 console
 * @param data 要輸出的資料
 * @param format 輸出格式
 * @param tableRenderer 若為 table 格式，使用此函數渲染
 */
export function outputData(
  data: unknown,
  format: OutputFormat = 'json',
  tableRenderer?: () => void
): void {
  switch (format) {
    case 'toon':
      console.log(toToon(data as Parameters<typeof toToon>[0]));
      break;
    case 'table':
      if (tableRenderer) {
        tableRenderer();
      } else {
        // 若無 table renderer，fallback 到 JSON
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    case 'json':
    default:
      console.log(JSON.stringify(data, null, 2));
      break;
  }
}

/**
 * 取得格式化後的輸出（不直接輸出到 console）
 */
export function getFormattedOutput(
  data: unknown,
  format: OutputFormat = 'json'
): string {
  return formatOutput(data, format);
}

/**
 * 驗證輸出格式是否有效
 */
export function isValidFormat(format: string): format is OutputFormat {
  return ['json', 'table', 'toon'].includes(format);
}

/**
 * 顯示 token 節省統計（僅用於 debug/verbose 模式）
 */
export function showTokenSavings(data: unknown): void {
  const result = measureTokenSavings(data as Parameters<typeof measureTokenSavings>[0]);
  console.log('\n--- Token Savings ---');
  console.log(`JSON tokens: ${result.jsonTokens}`);
  console.log(`TOON tokens: ${result.toonTokens}`);
  console.log(`Saved: ${result.savedTokens} tokens (${result.savingsPercent}%)`);
}
