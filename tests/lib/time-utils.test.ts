import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getToday,
  getCurrentTime,
  parseTimeToMinutes,
  minutesToTimeString,
  calculateDurationMinutes,
  formatDuration,
  calculateRemainingMinutes,
  formatRemainingTime,
  adjustTimeWithDelay,
  formatDelayStatus,
  isTimeInRange,
  compareTime,
} from '../../src/lib/time-utils.js';

describe('Time Utils', () => {
  describe('getToday', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const result = getToday();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return current date', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(getToday()).toBe(today);
    });
  });

  describe('getCurrentTime', () => {
    it('should return time in HH:MM format', () => {
      const result = getCurrentTime();
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('parseTimeToMinutes', () => {
    it('should parse 00:00 to 0', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
    });

    it('should parse 01:30 to 90', () => {
      expect(parseTimeToMinutes('01:30')).toBe(90);
    });

    it('should parse 12:00 to 720', () => {
      expect(parseTimeToMinutes('12:00')).toBe(720);
    });

    it('should parse 23:59 to 1439', () => {
      expect(parseTimeToMinutes('23:59')).toBe(1439);
    });

    it('should throw error for invalid format', () => {
      expect(() => parseTimeToMinutes('invalid')).toThrow();
    });
  });

  describe('minutesToTimeString', () => {
    it('should convert 0 to 00:00', () => {
      expect(minutesToTimeString(0)).toBe('00:00');
    });

    it('should convert 90 to 01:30', () => {
      expect(minutesToTimeString(90)).toBe('01:30');
    });

    it('should convert 720 to 12:00', () => {
      expect(minutesToTimeString(720)).toBe('12:00');
    });

    it('should handle overflow (1500 -> 01:00)', () => {
      expect(minutesToTimeString(1500)).toBe('01:00');
    });

    it('should handle negative values (-60 -> 23:00)', () => {
      expect(minutesToTimeString(-60)).toBe('23:00');
    });
  });

  describe('calculateDurationMinutes', () => {
    it('should calculate normal duration', () => {
      expect(calculateDurationMinutes('08:00', '12:30')).toBe(270);
    });

    it('should calculate same time as 0', () => {
      expect(calculateDurationMinutes('10:00', '10:00')).toBe(0);
    });

    it('should handle cross-midnight (22:00 -> 02:00)', () => {
      expect(calculateDurationMinutes('22:00', '02:00')).toBe(240);
    });

    it('should handle cross-midnight (23:30 -> 00:30)', () => {
      expect(calculateDurationMinutes('23:30', '00:30')).toBe(60);
    });
  });

  describe('formatDuration', () => {
    it('should format minutes only', () => {
      expect(formatDuration(45)).toBe('45m');
    });

    it('should format hours only', () => {
      expect(formatDuration(120)).toBe('2h');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h 30m');
    });

    it('should format large duration', () => {
      expect(formatDuration(270)).toBe('4h 30m');
    });

    it('should return -- for negative', () => {
      expect(formatDuration(-10)).toBe('--');
    });

    it('should format 0 minutes', () => {
      expect(formatDuration(0)).toBe('0m');
    });
  });

  describe('calculateRemainingMinutes', () => {
    it('should calculate positive remaining time', () => {
      expect(calculateRemainingMinutes('10:00', '08:30')).toBe(90);
    });

    it('should calculate 0 when same time', () => {
      expect(calculateRemainingMinutes('10:00', '10:00')).toBe(0);
    });

    it('should return negative for past time', () => {
      expect(calculateRemainingMinutes('08:00', '10:00')).toBe(-120);
    });

    it('should handle cross-midnight (next day)', () => {
      // 23:00 -> 01:00 (next day), should be 120 minutes
      expect(calculateRemainingMinutes('01:00', '23:00')).toBe(120);
    });

    it('should handle far past as past (not next day)', () => {
      // 08:00 ref 20:00, target is 12 hours ago, should be negative
      expect(calculateRemainingMinutes('08:00', '20:00')).toBe(-720);
    });
  });

  describe('formatRemainingTime', () => {
    it('should format minutes', () => {
      expect(formatRemainingTime(30)).toBe('30分後');
    });

    it('should format hours', () => {
      expect(formatRemainingTime(60)).toBe('1h後');
    });

    it('should format hours and minutes', () => {
      expect(formatRemainingTime(90)).toBe('1h 30m後');
    });

    it('should show 已發車 for 0 or negative', () => {
      expect(formatRemainingTime(0)).toBe('已發車');
      expect(formatRemainingTime(-10)).toBe('已發車');
    });
  });

  describe('adjustTimeWithDelay', () => {
    it('should add delay to time', () => {
      expect(adjustTimeWithDelay('08:30', 5)).toBe('08:35');
    });

    it('should handle 0 delay', () => {
      expect(adjustTimeWithDelay('08:30', 0)).toBe('08:30');
    });

    it('should handle negative delay (early)', () => {
      expect(adjustTimeWithDelay('08:30', -5)).toBe('08:25');
    });

    it('should handle cross-midnight', () => {
      expect(adjustTimeWithDelay('23:50', 20)).toBe('00:10');
    });

    it('should handle large delay', () => {
      expect(adjustTimeWithDelay('08:00', 120)).toBe('10:00');
    });
  });

  describe('formatDelayStatus', () => {
    it('should return 準時 for 0', () => {
      expect(formatDelayStatus(0)).toBe('準時');
    });

    it('should return 晚X分 for positive delay', () => {
      expect(formatDelayStatus(5)).toBe('晚5分');
      expect(formatDelayStatus(15)).toBe('晚15分');
    });

    it('should return 早X分 for negative delay', () => {
      expect(formatDelayStatus(-3)).toBe('早3分');
    });
  });

  describe('isTimeInRange', () => {
    it('should return true for time in normal range', () => {
      expect(isTimeInRange('10:00', '08:00', '12:00')).toBe(true);
    });

    it('should return true for time at start', () => {
      expect(isTimeInRange('08:00', '08:00', '12:00')).toBe(true);
    });

    it('should return true for time at end', () => {
      expect(isTimeInRange('12:00', '08:00', '12:00')).toBe(true);
    });

    it('should return false for time outside range', () => {
      expect(isTimeInRange('07:00', '08:00', '12:00')).toBe(false);
      expect(isTimeInRange('13:00', '08:00', '12:00')).toBe(false);
    });

    it('should handle cross-midnight range (23:00-02:00)', () => {
      expect(isTimeInRange('00:00', '23:00', '02:00')).toBe(true);
      expect(isTimeInRange('23:30', '23:00', '02:00')).toBe(true);
      expect(isTimeInRange('01:30', '23:00', '02:00')).toBe(true);
      expect(isTimeInRange('10:00', '23:00', '02:00')).toBe(false);
    });
  });

  describe('compareTime', () => {
    it('should return -1 when a is earlier', () => {
      expect(compareTime('08:00', '10:00')).toBe(-1);
    });

    it('should return 1 when a is later', () => {
      expect(compareTime('12:00', '10:00')).toBe(1);
    });

    it('should return 0 when times are equal', () => {
      expect(compareTime('10:00', '10:00')).toBe(0);
    });
  });
});
