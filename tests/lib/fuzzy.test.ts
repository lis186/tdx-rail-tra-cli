import { describe, it, expect } from 'vitest';
import { levenshteinDistance, findBestMatch } from '../../src/lib/fuzzy.js';

describe('Fuzzy Search', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('臺北', '臺北')).toBe(0);
      expect(levenshteinDistance('', '')).toBe(0);
      expect(levenshteinDistance('test', 'test')).toBe(0);
    });

    it('should return string length for empty comparison', () => {
      expect(levenshteinDistance('', '臺北')).toBe(2);
      expect(levenshteinDistance('高雄', '')).toBe(2);
    });

    it('should calculate correct distance for single character difference', () => {
      expect(levenshteinDistance('臺北', '台北')).toBe(1);
      expect(levenshteinDistance('基隆', '基龍')).toBe(1);
    });

    it('should handle insertions', () => {
      expect(levenshteinDistance('台北', '台北站')).toBe(1);
      expect(levenshteinDistance('高雄', '高雄市')).toBe(1);
    });

    it('should handle deletions', () => {
      expect(levenshteinDistance('台北站', '台北')).toBe(1);
      expect(levenshteinDistance('高雄市', '高雄')).toBe(1);
    });

    it('should handle substitutions', () => {
      expect(levenshteinDistance('瑞芳', '瑞方')).toBe(1);
      expect(levenshteinDistance('板橋', '版橋')).toBe(1);
    });

    it('should handle mixed operations', () => {
      expect(levenshteinDistance('新竹', '新筑站')).toBe(2);
    });
  });

  describe('findBestMatch', () => {
    const candidates = ['臺北', '臺中', '臺南', '高雄', '基隆', '新竹', '板橋'];

    it('should return exact match with distance 0', () => {
      const result = findBestMatch('臺北', candidates);
      expect(result).not.toBeNull();
      expect(result?.match).toBe('臺北');
      expect(result?.distance).toBe(0);
      expect(result?.confidence).toBe('exact');
    });

    it('should return high confidence for distance 1', () => {
      const result = findBestMatch('台北', candidates);
      expect(result).not.toBeNull();
      expect(result?.match).toBe('臺北');
      expect(result?.distance).toBe(1);
      expect(result?.confidence).toBe('high');
    });

    it('should return medium confidence for distance 2', () => {
      // "新筑站" vs "新竹" - 2 operations: 筑→竹, 刪除站
      const result = findBestMatch('新筑站', candidates);
      expect(result).not.toBeNull();
      expect(result?.match).toBe('新竹');
      expect(result?.distance).toBe(2);
      expect(result?.confidence).toBe('medium');
    });

    it('should return null for distance > 2', () => {
      const result = findBestMatch('完全不同的字串', candidates);
      expect(result).toBeNull();
    });

    it('should return closest match among multiple candidates', () => {
      const result = findBestMatch('臺東', candidates);
      // 臺東 vs 臺北=1, 臺中=1, 臺南=1 - any of these is valid
      expect(result).not.toBeNull();
      expect(result?.distance).toBe(1);
    });

    it('should handle empty candidates array', () => {
      const result = findBestMatch('臺北', []);
      expect(result).toBeNull();
    });
  });
});
