/**
 * Time Utils Module
 * 時間工具模組 - 提供時間計算與格式化功能
 */

/**
 * 取得今天的日期字串 (YYYY-MM-DD)
 */
export function getToday(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * 取得現在時間字串 (HH:MM)
 */
export function getCurrentTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * 解析時間字串 (HH:MM) 為分鐘數（從 00:00 起算）
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error(`Invalid time format: ${time}`);
  }
  return hours * 60 + minutes;
}

/**
 * 將分鐘數轉換為時間字串 (HH:MM)
 */
export function minutesToTimeString(minutes: number): string {
  // 處理跨日
  const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalizedMinutes / 60);
  const mins = normalizedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * 計算兩個時間點之間的行車時間（分鐘）
 * 自動處理跨日情況
 */
export function calculateDurationMinutes(departure: string, arrival: string): number {
  const depMinutes = parseTimeToMinutes(departure);
  const arrMinutes = parseTimeToMinutes(arrival);

  let duration = arrMinutes - depMinutes;

  // 跨日處理
  if (duration < 0) {
    duration += 24 * 60;
  }

  return duration;
}

/**
 * 格式化行車時間
 */
export function formatDuration(minutes: number): string {
  if (minutes < 0) {
    return '--';
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * 計算距離指定時間還有多少分鐘
 * 可指定參考時間（預設為現在）
 */
export function calculateRemainingMinutes(
  targetTime: string,
  referenceTime?: string
): number {
  const reference = referenceTime || getCurrentTime();
  const targetMinutes = parseTimeToMinutes(targetTime);
  const refMinutes = parseTimeToMinutes(reference);

  let remaining = targetMinutes - refMinutes;

  // 如果時間已過且差距小於 12 小時，視為已過
  // 如果差距大於 12 小時（負數），視為隔天
  if (remaining < -720) {
    remaining += 24 * 60;
  }

  return remaining;
}

/**
 * 格式化剩餘時間
 */
export function formatRemainingTime(minutes: number): string {
  if (minutes <= 0) {
    return '已發車';
  }

  if (minutes < 60) {
    return `${minutes}分後`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins > 0) {
    return `${hours}h ${mins}m後`;
  }
  return `${hours}h後`;
}

/**
 * 根據延誤時間調整原始時間
 */
export function adjustTimeWithDelay(originalTime: string, delayMinutes: number): string {
  const original = parseTimeToMinutes(originalTime);
  const adjusted = original + delayMinutes;
  return minutesToTimeString(adjusted);
}

/**
 * 格式化延誤狀態文字
 */
export function formatDelayStatus(delayMinutes: number): string {
  if (delayMinutes === 0) {
    return '準時';
  }
  if (delayMinutes > 0) {
    return `晚${delayMinutes}分`;
  }
  return `早${Math.abs(delayMinutes)}分`;
}

/**
 * 判斷時間是否在指定範圍內
 * 支援跨日時段（如 23:00-02:00）
 */
export function isTimeInRange(
  time: string,
  startTime: string,
  endTime: string
): boolean {
  const timeMinutes = parseTimeToMinutes(time);
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes <= endMinutes) {
    // 正常時段（不跨日）
    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  } else {
    // 跨日時段
    return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
  }
}

/**
 * 比較兩個時間字串
 * 回傳 -1（a 較早）、0（相同）、1（a 較晚）
 */
export function compareTime(a: string, b: string): number {
  const aMinutes = parseTimeToMinutes(a);
  const bMinutes = parseTimeToMinutes(b);

  if (aMinutes < bMinutes) return -1;
  if (aMinutes > bMinutes) return 1;
  return 0;
}
