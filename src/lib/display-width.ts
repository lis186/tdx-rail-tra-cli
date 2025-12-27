/**
 * Display Width Utilities
 * 顯示寬度處理工具 - 處理中英文混合對齊
 */

/**
 * 計算字串的顯示寬度（中文字元寬度為 2）
 */
export function getDisplayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.charCodeAt(0);
    // CJK characters, fullwidth forms, and some symbols
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3000 && code <= 0x303f) || // CJK Punctuation
      (code >= 0xff00 && code <= 0xffef) || // Fullwidth Forms
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff)    // Katakana
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * 將字串填充到指定顯示寬度
 */
export function padEnd(str: string, targetWidth: number, fillChar = ' '): string {
  const currentWidth = getDisplayWidth(str);
  if (currentWidth >= targetWidth) return str;
  return str + fillChar.repeat(targetWidth - currentWidth);
}

/**
 * 將字串填充到指定顯示寬度（左對齊）
 */
export function padStart(str: string, targetWidth: number, fillChar = ' '): string {
  const currentWidth = getDisplayWidth(str);
  if (currentWidth >= targetWidth) return str;
  return fillChar.repeat(targetWidth - currentWidth) + str;
}
