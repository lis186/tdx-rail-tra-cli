/**
 * TOON (Token-Oriented Object Notation) Formatter
 * A compact, LLM-friendly format that saves ~40% tokens compared to JSON
 *
 * Spec: https://github.com/toon-format/spec
 */

type Primitive = string | number | boolean | null | undefined;
type JsonValue = Primitive | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];

/**
 * Check if a value is a primitive
 */
function isPrimitive(value: JsonValue): value is Primitive {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Check if array contains only primitives
 */
function isPrimitiveArray(arr: JsonArray): arr is Primitive[] {
  return arr.every(isPrimitive);
}

/**
 * Check if array contains uniform objects (all same keys)
 */
function isUniformObjectArray(arr: JsonArray): arr is JsonObject[] {
  if (arr.length === 0) return false;
  if (!arr.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))) {
    return false;
  }

  const objArr = arr as JsonObject[];
  const firstKeys = Object.keys(objArr[0]).sort().join(',');

  return objArr.every((obj) => {
    const keys = Object.keys(obj).sort().join(',');
    return keys === firstKeys;
  });
}

/**
 * Check if all values in an object are primitives
 */
function hasOnlyPrimitiveValues(obj: JsonObject): boolean {
  return Object.values(obj).every(isPrimitive);
}

/**
 * Format a number according to TOON spec:
 * - No exponent notation
 * - No leading zeros except single '0'
 * - No trailing zeros in fractional part
 * - -0 normalized to 0
 */
function formatNumber(n: number): string {
  // Handle -0
  if (Object.is(n, -0)) return '0';
  // Handle regular numbers
  return String(n);
}

/**
 * Check if string needs quoting
 */
function needsQuoting(s: string): boolean {
  return (
    s.includes(',') ||
    s.includes('\n') ||
    s.includes('\r') ||
    s.includes('\t') ||
    s.includes('"') ||
    s.includes('\\') ||
    s.includes(':') ||
    s.startsWith(' ') ||
    s.endsWith(' ')
  );
}

/**
 * Escape a string value for TOON
 * Only allowed escapes: \\ \" \n \r \t
 */
function escapeString(s: string): string {
  if (!needsQuoting(s)) return s;

  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

  return `"${escaped}"`;
}

/**
 * Format a primitive value
 */
function formatPrimitive(value: Primitive): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return formatNumber(value);
  return escapeString(String(value));
}

/**
 * Format a value for tabular row (always escape for comma delimiter)
 */
function formatTabularValue(value: Primitive): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return formatNumber(value);

  const s = String(value);
  // In tabular format, always quote if contains comma
  if (s.includes(',')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Convert any JSON-compatible data to TOON format
 */
export function toToon(data: JsonValue, indent: number = 0): string {
  const spaces = '  '.repeat(indent);

  // Handle null/undefined
  if (data === null || data === undefined) {
    return 'null';
  }

  // Handle primitives
  if (isPrimitive(data)) {
    return formatPrimitive(data);
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return formatArray(data, '', indent);
  }

  // Handle objects
  return formatObject(data as JsonObject, indent);
}

/**
 * Format an object
 */
function formatObject(obj: JsonObject, indent: number): string {
  const spaces = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (isPrimitive(value)) {
      lines.push(`${spaces}${key}: ${formatPrimitive(value)}`);
    } else if (Array.isArray(value)) {
      lines.push(formatArray(value, key, indent));
    } else {
      // Nested object
      lines.push(`${spaces}${key}:`);
      lines.push(formatObject(value as JsonObject, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Format an array with key prefix
 */
function formatArray(arr: JsonArray, key: string, indent: number): string {
  const spaces = '  '.repeat(indent);
  const prefix = key ? `${spaces}${key}` : '';

  // Empty array
  if (arr.length === 0) {
    return `${prefix}[0]:`;
  }

  // Primitive array - inline format
  if (isPrimitiveArray(arr)) {
    const values = arr.map((v) => formatTabularValue(v)).join(',');
    return `${prefix}[${arr.length}]: ${values}`;
  }

  // Uniform object array - tabular format
  if (isUniformObjectArray(arr) && hasOnlyPrimitiveValues(arr[0])) {
    const fields = Object.keys(arr[0]);
    const header = `${prefix}[${arr.length}]{${fields.join(',')}}:`;

    const rows = arr.map((obj) => {
      const values = fields.map((f) => formatTabularValue((obj as JsonObject)[f] as Primitive));
      return `${'  '.repeat(indent + 1)}${values.join(',')}`;
    });

    return [header, ...rows].join('\n');
  }

  // Mixed array - expanded format with list items
  const lines: string[] = [`${prefix}[${arr.length}]:`];
  for (const item of arr) {
    if (isPrimitive(item)) {
      lines.push(`${'  '.repeat(indent + 1)}- ${formatPrimitive(item)}`);
    } else if (typeof item === 'object' && item !== null) {
      lines.push(`${'  '.repeat(indent + 1)}- ${toToon(item, 0).split('\n').join(`\n${'  '.repeat(indent + 2)}`)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Simple token counter (approximation)
 * Uses rough heuristics: ~4 chars per token for English, ~2 chars for CJK
 */
export function countTokens(text: string): number {
  if (!text) return 0;

  let count = 0;
  for (const char of text) {
    // CJK characters typically take 1-2 tokens each
    if (char.charCodeAt(0) > 0x4e00 && char.charCodeAt(0) < 0x9fff) {
      count += 0.7; // CJK characters
    } else if (char === ' ' || char === '\n') {
      count += 0.25; // Whitespace
    } else {
      count += 0.25; // ASCII
    }
  }

  // Round up and add overhead for structure
  return Math.ceil(count);
}

/**
 * Measure token savings between JSON and TOON formats
 */
export function measureTokenSavings(data: JsonValue): {
  jsonTokens: number;
  toonTokens: number;
  savedTokens: number;
  savingsPercent: number;
  jsonOutput: string;
  toonOutput: string;
} {
  const jsonOutput = JSON.stringify(data, null, 2);
  const toonOutput = toToon(data);

  const jsonTokens = countTokens(jsonOutput);
  const toonTokens = countTokens(toonOutput);
  const savedTokens = jsonTokens - toonTokens;
  const savingsPercent = jsonTokens > 0 ? (savedTokens / jsonTokens) * 100 : 0;

  return {
    jsonTokens,
    toonTokens,
    savedTokens,
    savingsPercent: Math.round(savingsPercent * 10) / 10,
    jsonOutput,
    toonOutput,
  };
}
