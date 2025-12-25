/**
 * OData Query Builder Module
 * OData 查詢建構模組 - 建構 TDX API OData 查詢參數
 */

/**
 * OData 查詢選項
 */
export interface ODataQueryOptions {
  filter?: string;
  select?: string[];
  orderby?: string[];
  top?: number;
  skip?: number;
  format?: 'JSON' | 'XML';
}

/**
 * 建構 OData 相等篩選條件
 * @example buildEqualsFilter('TrainNo', '123') => "TrainNo eq '123'"
 */
export function buildEqualsFilter(field: string, value: string | number): string {
  if (typeof value === 'number') {
    return `${field} eq ${value}`;
  }
  return `${field} eq '${value}'`;
}

/**
 * 建構 OData 不等於篩選條件
 * @example buildNotEqualsFilter('Status', 'Cancelled') => "Status ne 'Cancelled'"
 */
export function buildNotEqualsFilter(field: string, value: string | number): string {
  if (typeof value === 'number') {
    return `${field} ne ${value}`;
  }
  return `${field} ne '${value}'`;
}

/**
 * 建構 OData IN 篩選條件（多值匹配）
 * @example buildInFilter('TrainNo', ['123', '456', '789'])
 *          => "TrainNo eq '123' or TrainNo eq '456' or TrainNo eq '789'"
 */
export function buildInFilter(field: string, values: (string | number)[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return buildEqualsFilter(field, values[0]);
  }

  return values.map((v) => buildEqualsFilter(field, v)).join(' or ');
}

/**
 * 建構 OData 數值比較篩選條件
 */
export function buildComparisonFilter(
  field: string,
  operator: 'gt' | 'ge' | 'lt' | 'le',
  value: number
): string {
  return `${field} ${operator} ${value}`;
}

/**
 * 建構 OData 日期篩選條件
 * @example buildDateFilter('TrainDate', 'eq', '2025-01-15') => "TrainDate eq 2025-01-15"
 */
export function buildDateFilter(
  field: string,
  operator: 'eq' | 'gt' | 'ge' | 'lt' | 'le',
  date: string
): string {
  return `${field} ${operator} ${date}`;
}

/**
 * 建構 OData contains 篩選條件
 * @example buildContainsFilter('StationName', '台') => "contains(StationName, '台')"
 */
export function buildContainsFilter(field: string, value: string): string {
  return `contains(${field}, '${value}')`;
}

/**
 * 建構 OData startswith 篩選條件
 */
export function buildStartsWithFilter(field: string, value: string): string {
  return `startswith(${field}, '${value}')`;
}

/**
 * 建構 OData endswith 篩選條件
 */
export function buildEndsWithFilter(field: string, value: string): string {
  return `endswith(${field}, '${value}')`;
}

/**
 * 組合多個篩選條件（AND）
 * @example combineFiltersAnd(['A eq 1', 'B eq 2']) => "(A eq 1) and (B eq 2)"
 */
export function combineFiltersAnd(filters: string[]): string {
  const validFilters = filters.filter((f) => f && f.trim());
  if (validFilters.length === 0) return '';
  if (validFilters.length === 1) return validFilters[0];
  return validFilters.map((f) => `(${f})`).join(' and ');
}

/**
 * 組合多個篩選條件（OR）
 * @example combineFiltersOr(['A eq 1', 'B eq 2']) => "(A eq 1) or (B eq 2)"
 */
export function combineFiltersOr(filters: string[]): string {
  const validFilters = filters.filter((f) => f && f.trim());
  if (validFilters.length === 0) return '';
  if (validFilters.length === 1) return validFilters[0];
  return validFilters.map((f) => `(${f})`).join(' or ');
}

/**
 * 建構 $select 字串
 */
export function buildSelectString(fields: string[]): string {
  return fields.join(',');
}

/**
 * 建構 $orderby 字串
 * @example buildOrderByString([{ field: 'Time', desc: false }]) => "Time"
 * @example buildOrderByString([{ field: 'Time', desc: true }]) => "Time desc"
 */
export function buildOrderByString(
  orders: Array<{ field: string; desc?: boolean }>
): string {
  return orders.map((o) => (o.desc ? `${o.field} desc` : o.field)).join(',');
}

/**
 * 建構完整的 OData 查詢參數物件
 */
export function buildODataQuery(options: ODataQueryOptions): Record<string, string> {
  const query: Record<string, string> = {};

  if (options.filter) {
    query['$filter'] = options.filter;
  }

  if (options.select && options.select.length > 0) {
    query['$select'] = buildSelectString(options.select);
  }

  if (options.orderby && options.orderby.length > 0) {
    query['$orderby'] = options.orderby.join(',');
  }

  if (options.top !== undefined && options.top > 0) {
    query['$top'] = String(options.top);
  }

  if (options.skip !== undefined && options.skip > 0) {
    query['$skip'] = String(options.skip);
  }

  query['$format'] = options.format || 'JSON';

  return query;
}

/**
 * TDX TRA 專用：建構車次查詢篩選條件
 */
export function buildTrainNoFilter(trainNos: string[]): string {
  return buildInFilter('TrainNo', trainNos);
}

/**
 * TDX TRA 專用：建構車站查詢篩選條件
 */
export function buildStationFilter(stationIds: string[]): string {
  return buildInFilter('StationID', stationIds);
}

/**
 * TDX TRA 專用：建構日期查詢篩選條件
 */
export function buildTrainDateFilter(date: string): string {
  return buildDateFilter('TrainDate', 'eq', date);
}
