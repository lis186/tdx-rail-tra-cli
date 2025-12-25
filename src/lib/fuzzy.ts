/**
 * Fuzzy search module using Levenshtein distance algorithm
 * 模糊搜尋模組，使用 Levenshtein 編輯距離演算法
 */

export type Confidence = 'exact' | 'high' | 'medium' | 'low';

export interface FuzzyMatchResult {
  match: string;
  distance: number;
  confidence: Confidence;
}

/**
 * 計算兩個字串之間的 Levenshtein 編輯距離
 * @param a 第一個字串
 * @param b 第二個字串
 * @returns 編輯距離
 */
export function levenshteinDistance(a: string, b: string): number {
  // 處理空字串
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 建立距離矩陣
  const matrix: number[][] = [];

  // 初始化第一列
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // 初始化第一行
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // 填充矩陣
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替換
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j] + 1      // 刪除
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 根據距離決定信心等級
 */
function getConfidence(distance: number): Confidence {
  if (distance === 0) return 'exact';
  if (distance === 1) return 'high';
  if (distance === 2) return 'medium';
  return 'low';
}

/**
 * 在候選清單中找出最佳匹配
 * @param input 輸入字串
 * @param candidates 候選清單
 * @param maxDistance 最大允許距離（預設 2）
 * @returns 匹配結果，若無符合條件則回傳 null
 */
export function findBestMatch(
  input: string,
  candidates: string[],
  maxDistance: number = 2
): FuzzyMatchResult | null {
  if (candidates.length === 0) return null;

  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
    // 若找到完全匹配，直接返回
    if (distance === 0) break;
  }

  if (bestMatch === null || bestDistance > maxDistance) {
    return null;
  }

  return {
    match: bestMatch,
    distance: bestDistance,
    confidence: getConfidence(bestDistance),
  };
}

/**
 * 取得距離最近的前 N 個候選
 */
export function getTopCandidates(
  input: string,
  candidates: string[],
  limit: number = 5
): string[] {
  const scored = candidates.map(candidate => ({
    name: candidate,
    distance: levenshteinDistance(input, candidate),
  }));

  scored.sort((a, b) => a.distance - b.distance);

  return scored.slice(0, limit).map(s => s.name);
}
