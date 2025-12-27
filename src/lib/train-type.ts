/**
 * Train Type Utilities
 * 車種名稱處理工具
 */

/**
 * 簡化車種名稱（用於表格顯示）
 */
export function simplifyTrainType(fullName: string): string {
  // 移除重複描述
  if (fullName === '普悠瑪(普悠瑪)') return '普悠瑪';

  // 自強系列
  if (fullName.includes('EMU3000')) return '新自強';
  if (fullName.includes('DMU3100')) return '自強';
  if (fullName.includes('商務專開')) return '商務';
  if (fullName.includes('推拉式')) return '自強';

  // 莒光系列 - 合併有/無身障
  if (fullName.startsWith('莒光')) return '莒光';

  // 區間系列
  if (fullName === '區間快') return '區間快';
  if (fullName === '區間') return '區間';

  // 其他情況：取括號前的部分
  const match = fullName.match(/^([^(]+)/);
  return match ? match[1].trim() : fullName;
}
