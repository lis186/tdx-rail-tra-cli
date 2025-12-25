/**
 * Output Formatter Module
 * 輸出格式化模組 - 支援 JSON、Table、CSV 格式
 */

/**
 * 欄位定義
 */
export interface ColumnDef<T> {
  key: keyof T | string;
  label: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: unknown, row: T) => string;
}

/**
 * 表格選項
 */
export interface TableOptions {
  showHeader?: boolean;
  showBorder?: boolean;
  compact?: boolean;
}

/**
 * 取得值（支援巢狀路徑）
 */
function getValue<T>(obj: T, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * 計算字串顯示寬度（處理中文全形字元）
 */
export function getDisplayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    // CJK 字元佔 2 個寬度
    if (char.charCodeAt(0) > 0x7F) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * 填充字串到指定寬度
 */
export function padString(
  str: string,
  width: number,
  align: 'left' | 'right' | 'center' = 'left'
): string {
  const displayWidth = getDisplayWidth(str);
  const padding = Math.max(0, width - displayWidth);

  if (padding === 0) return str;

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + str;
    case 'center': {
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return ' '.repeat(left) + str + ' '.repeat(right);
    }
    default:
      return str + ' '.repeat(padding);
  }
}

/**
 * 截斷字串到指定寬度
 */
export function truncateString(str: string, maxWidth: number): string {
  if (getDisplayWidth(str) <= maxWidth) return str;

  let width = 0;
  let result = '';
  for (const char of str) {
    const charWidth = char.charCodeAt(0) > 0x7F ? 2 : 1;
    if (width + charWidth + 1 > maxWidth) {
      return result + '…';
    }
    result += char;
    width += charWidth;
  }
  return result;
}

/**
 * 格式化表格
 */
export function formatTable<T extends Record<string, unknown>>(
  data: T[],
  columns: ColumnDef<T>[],
  options: TableOptions = {}
): string {
  const { showHeader = true, showBorder = true, compact = false } = options;

  if (data.length === 0) {
    return '';
  }

  // 計算每列的實際寬度
  const widths = columns.map((col) => {
    if (col.width) return col.width;

    // 計算資料中最寬的值
    let maxWidth = getDisplayWidth(col.label);
    for (const row of data) {
      const value = col.format
        ? col.format(getValue(row, String(col.key)), row)
        : String(getValue(row, String(col.key)) ?? '');
      maxWidth = Math.max(maxWidth, getDisplayWidth(value));
    }
    return maxWidth;
  });

  const lines: string[] = [];

  // 表頭
  if (showHeader) {
    const headerCells = columns.map((col, i) =>
      padString(col.label, widths[i], col.align || 'left')
    );

    if (showBorder) {
      lines.push('┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐');
      lines.push('│ ' + headerCells.join(' │ ') + ' │');
      lines.push('├' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤');
    } else {
      lines.push(headerCells.join(compact ? '\t' : '  '));
      lines.push('─'.repeat(headerCells.join('  ').length));
    }
  }

  // 資料列
  for (const row of data) {
    const cells = columns.map((col, i) => {
      const value = col.format
        ? col.format(getValue(row, String(col.key)), row)
        : String(getValue(row, String(col.key)) ?? '');
      return padString(truncateString(value, widths[i]), widths[i], col.align || 'left');
    });

    if (showBorder) {
      lines.push('│ ' + cells.join(' │ ') + ' │');
    } else {
      lines.push(cells.join(compact ? '\t' : '  '));
    }
  }

  // 表格底線
  if (showBorder) {
    lines.push('└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘');
  }

  return lines.join('\n');
}

/**
 * 格式化 CSV
 */
export function formatCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: ColumnDef<T>[]
): string {
  if (data.length === 0) {
    return '';
  }

  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const lines: string[] = [];

  // 表頭
  lines.push(columns.map((col) => escapeCSV(col.label)).join(','));

  // 資料列
  for (const row of data) {
    const cells = columns.map((col) => {
      const value = col.format
        ? col.format(getValue(row, String(col.key)), row)
        : String(getValue(row, String(col.key)) ?? '');
      return escapeCSV(value);
    });
    lines.push(cells.join(','));
  }

  return lines.join('\n');
}

/**
 * 格式化 JSON
 */
export function formatJSON<T>(
  data: T,
  pretty: boolean = true
): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

/**
 * 輸出格式類型
 */
export type OutputFormat = 'json' | 'table' | 'csv';

/**
 * 通用輸出函數
 */
export function output<T extends Record<string, unknown>>(
  data: T[],
  columns: ColumnDef<T>[],
  format: OutputFormat = 'json',
  options: TableOptions = {}
): string {
  switch (format) {
    case 'table':
      return formatTable(data, columns, options);
    case 'csv':
      return formatCSV(data, columns);
    case 'json':
    default:
      return formatJSON(data);
  }
}
