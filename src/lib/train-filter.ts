/**
 * Train Filter Module
 * 班次篩選模組
 */

/**
 * Train entry interface for filtering
 */
export interface TrainEntry {
  trainNo: string;
  trainType: string;
  trainTypeCode: string;
  departure: string;
  arrival: string;
  bikeFlag?: number;
  wheelChairFlag?: number;
  duration?: number; // minutes
}

/**
 * Train filter options
 */
export interface TrainFilterOptions {
  // Time range
  departAfter?: string;
  departBefore?: string;
  arriveBy?: string;
  // Train types
  includeTypes?: string[];
  excludeTypes?: string[];
  tpassOnly?: boolean;
  // Services
  bikeOnly?: boolean;
  wheelchairOnly?: boolean;
}

/**
 * Train type mapping
 */
interface TrainTypeInfo {
  code: string;
  name: string;
  aliases: string[];
  fareRank: number; // Lower = cheaper
  tpassEligible: boolean;
}

/**
 * Train type definitions with codes, aliases, and fare ranking
 */
const TRAIN_TYPES: TrainTypeInfo[] = [
  { code: '1', name: '太魯閣', aliases: ['taroko', 'tze'], fareRank: 6, tpassEligible: false },
  { code: '2', name: '普悠瑪', aliases: ['puyuma', 'pyu'], fareRank: 6, tpassEligible: false },
  { code: '3', name: '新自強3000', aliases: ['emu3000', 'e3k', '自強3000'], fareRank: 6, tpassEligible: false },
  { code: '4', name: '自強', aliases: ['tzechiang', 'tc'], fareRank: 5, tpassEligible: true },
  { code: '5', name: '莒光', aliases: ['chukuang', 'ck'], fareRank: 4, tpassEligible: true },
  { code: '6', name: '復興', aliases: ['fuhsing', 'fh'], fareRank: 3, tpassEligible: true },
  { code: '7', name: '區間快', aliases: ['localexpress', 'le'], fareRank: 2, tpassEligible: true },
  { code: '8', name: '區間', aliases: ['local', 'loc'], fareRank: 1, tpassEligible: true },
];

// Pre-built lookup maps for performance
const TYPE_BY_CODE = new Map<string, TrainTypeInfo>();
const TYPE_BY_NAME = new Map<string, TrainTypeInfo>();
const TYPE_BY_ALIAS = new Map<string, TrainTypeInfo>();

// Initialize lookup maps
for (const type of TRAIN_TYPES) {
  TYPE_BY_CODE.set(type.code, type);
  TYPE_BY_NAME.set(type.name.toLowerCase(), type);
  for (const alias of type.aliases) {
    TYPE_BY_ALIAS.set(alias.toLowerCase(), type);
  }
}

/**
 * Filter trains by time range
 */
export function filterByTimeRange(
  trains: TrainEntry[],
  options: Pick<TrainFilterOptions, 'departAfter' | 'departBefore' | 'arriveBy'>
): TrainEntry[] {
  const { departAfter, departBefore, arriveBy } = options;

  return trains.filter((train) => {
    // Depart after filter
    if (departAfter && train.departure < departAfter) {
      return false;
    }

    // Depart before filter
    if (departBefore && train.departure > departBefore) {
      return false;
    }

    // Arrive by filter
    if (arriveBy && train.arrival > arriveBy) {
      return false;
    }

    return true;
  });
}

/**
 * Check if train type matches the target
 * Handles API train type names like "自強(3000)(EMU3000 型電車)" matching "自強"
 */
function isExactTrainTypeMatch(
  trainType: string,
  trainTypeCode: string,
  target: { code: string; name: string }
): boolean {
  // Match by code first (most reliable)
  if (trainTypeCode && trainTypeCode === target.code) {
    return true;
  }

  const normalizedTrain = trainType.toLowerCase().trim();
  const normalizedTarget = target.name.toLowerCase().trim();

  // Exact match
  if (normalizedTrain === normalizedTarget) {
    return true;
  }

  // Special case: "區間" should not match "區間快"
  if (normalizedTarget === '區間') {
    // Match "區間" or "區間車" but not "區間快"
    return normalizedTrain === '區間' ||
           normalizedTrain.startsWith('區間車') ||
           (normalizedTrain.startsWith('區間') && !normalizedTrain.includes('快'));
  }

  // Special case: "區間快" should match "區間快" variants
  if (normalizedTarget === '區間快') {
    return normalizedTrain.includes('區間快');
  }

  // For other train types, check if the train type starts with the target name
  // This handles cases like "自強(3000)" matching "自強"
  if (normalizedTrain.startsWith(normalizedTarget)) {
    return true;
  }

  // Also check if train type contains the target as a word (for complex names)
  // e.g., "普悠瑪(普悠瑪)" should match "普悠瑪"
  if (normalizedTrain.includes(normalizedTarget)) {
    return true;
  }

  return false;
}

/**
 * Filter trains by train type
 */
export function filterByTrainType(
  trains: TrainEntry[],
  options: Pick<TrainFilterOptions, 'includeTypes' | 'excludeTypes' | 'tpassOnly'>
): TrainEntry[] {
  const { includeTypes, excludeTypes, tpassOnly } = options;

  // Normalize include types (filter out wildcards for separate handling)
  const normalizedIncludes = includeTypes
    ?.filter((t) => !t.endsWith('*'))
    .map((t) => normalizeTrainType(t))
    .filter(Boolean) as Array<{ code: string; name: string; matchByCode?: boolean }> | undefined;

  // Normalize exclude types
  const normalizedExcludes = excludeTypes?.map((t) => normalizeTrainType(t)).filter(Boolean) as Array<{ code: string; name: string; matchByCode?: boolean }> | undefined;

  // Check for wildcard includes
  const includeWildcards = includeTypes?.filter((t) => t.endsWith('*')) || [];
  const wildcardFamilies = includeWildcards.map((t) => t.slice(0, -1).toLowerCase());

  return trains.filter((train) => {
    // TPASS filter - exclude non-eligible train types
    if (tpassOnly) {
      const typeInfo = findTrainType(train.trainType, train.trainTypeCode);
      if (!typeInfo?.tpassEligible) {
        return false;
      }
    }

    // Include filter
    const hasIncludes = (normalizedIncludes && normalizedIncludes.length > 0) || wildcardFamilies.length > 0;
    if (hasIncludes) {
      // Check exact matches
      const exactMatches = normalizedIncludes?.some((inc) => {
        // If matched by code, only use code matching
        if (inc.matchByCode) {
          return train.trainTypeCode === inc.code;
        }
        return isExactTrainTypeMatch(train.trainType, train.trainTypeCode, inc);
      }) ?? false;

      // Check wildcard matches
      const wildcardMatches = wildcardFamilies.some((family) =>
        train.trainType.toLowerCase().includes(family)
      );

      if (!exactMatches && !wildcardMatches) {
        return false;
      }
    }

    // Exclude filter
    if (normalizedExcludes && normalizedExcludes.length > 0) {
      const excluded = normalizedExcludes.some((exc) => {
        if (exc.matchByCode) {
          return train.trainTypeCode === exc.code;
        }
        return isExactTrainTypeMatch(train.trainType, train.trainTypeCode, exc);
      });
      if (excluded) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filter trains by service flags
 */
export function filterByServices(
  trains: TrainEntry[],
  options: Pick<TrainFilterOptions, 'bikeOnly' | 'wheelchairOnly'>
): TrainEntry[] {
  const { bikeOnly, wheelchairOnly } = options;

  return trains.filter((train) => {
    if (bikeOnly && train.bikeFlag !== 1) {
      return false;
    }

    if (wheelchairOnly && train.wheelChairFlag !== 1) {
      return false;
    }

    return true;
  });
}

/**
 * Sort trains by specified field
 */
export function sortTrains(
  trains: TrainEntry[],
  sortBy: 'departure' | 'arrival' | 'duration' | 'fare'
): TrainEntry[] {
  const sorted = [...trains];

  switch (sortBy) {
    case 'departure':
      sorted.sort((a, b) => a.departure.localeCompare(b.departure));
      break;

    case 'arrival':
      sorted.sort((a, b) => a.arrival.localeCompare(b.arrival));
      break;

    case 'duration':
      sorted.sort((a, b) => {
        const durationA = calculateDuration(a.departure, a.arrival);
        const durationB = calculateDuration(b.departure, b.arrival);
        return durationA - durationB;
      });
      break;

    case 'fare':
      sorted.sort((a, b) => {
        const rankA = getTrainTypeFareRank(a.trainType);
        const rankB = getTrainTypeFareRank(b.trainType);
        return rankA - rankB;
      });
      break;
  }

  return sorted;
}

/**
 * Calculate duration in minutes
 */
function calculateDuration(departure: string, arrival: string): number {
  const [dh, dm] = departure.split(':').map(Number);
  const [ah, am] = arrival.split(':').map(Number);
  let duration = (ah * 60 + am) - (dh * 60 + dm);
  if (duration < 0) duration += 24 * 60; // Handle overnight trains
  return duration;
}

/**
 * Parse comma-separated train type input
 */
export function parseTrainTypeInput(input: string): string[] {
  if (!input || input.trim() === '') {
    return [];
  }
  return input.split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * Find train type info by name or code
 */
function findTrainType(trainType: string, trainTypeCode?: string): TrainTypeInfo | null {
  // Try by code first (most reliable)
  if (trainTypeCode) {
    const byCode = TYPE_BY_CODE.get(trainTypeCode);
    if (byCode) return byCode;
  }

  const lowerName = trainType.toLowerCase();

  // Check for EMU3000 / 3000 / 新自強 first (these are NOT TPASS eligible)
  if (lowerName.includes('emu3000') || lowerName.includes('3000') || lowerName.includes('新自強')) {
    return TRAIN_TYPES.find((t) => t.code === '3') || null;
  }

  // Check for 普悠瑪
  if (lowerName.includes('普悠瑪') || lowerName.includes('puyuma')) {
    return TRAIN_TYPES.find((t) => t.code === '2') || null;
  }

  // Check for 太魯閣
  if (lowerName.includes('太魯閣') || lowerName.includes('taroko')) {
    return TRAIN_TYPES.find((t) => t.code === '1') || null;
  }

  // Try by name match (order matters - check longer names first)
  const orderedTypes = [...TRAIN_TYPES].sort((a, b) => b.name.length - a.name.length);
  for (const type of orderedTypes) {
    if (lowerName.includes(type.name.toLowerCase())) {
      return type;
    }
  }

  return null;
}

/**
 * Normalize train type input to code and name
 * Returns matchByCode flag to indicate if exact code matching should be used
 */
export function normalizeTrainType(input: string): { code: string; name: string; matchByCode?: boolean } | null {
  const lower = input.toLowerCase();

  // Try code lookup first (for numeric codes like '4', '5')
  const byCode = TYPE_BY_CODE.get(input);
  if (byCode) {
    // Mark as code match for strict matching
    return { code: byCode.code, name: byCode.name, matchByCode: true };
  }

  // Try exact name lookup
  const byName = TYPE_BY_NAME.get(lower);
  if (byName) {
    return { code: byName.code, name: byName.name };
  }

  // Try alias lookup
  const byAlias = TYPE_BY_ALIAS.get(lower);
  if (byAlias) {
    return { code: byAlias.code, name: byAlias.name };
  }

  // Try partial name match
  for (const type of TRAIN_TYPES) {
    if (type.name.toLowerCase().includes(lower) || lower.includes(type.name.toLowerCase())) {
      return { code: type.code, name: type.name };
    }
  }

  return null;
}

/**
 * Get fare ranking for a train type (lower = cheaper)
 */
export function getTrainTypeFareRank(trainType: string): number {
  const lower = trainType.toLowerCase();

  // Check for EMU3000 variants first
  if (lower.includes('emu3000') || lower.includes('3000') || lower.includes('新自強')) {
    return 6;
  }

  // Check for premium express types
  if (lower.includes('普悠瑪') || lower.includes('puyuma')) {
    return 6;
  }

  if (lower.includes('太魯閣') || lower.includes('taroko')) {
    return 6;
  }

  // Find by type info
  for (const type of TRAIN_TYPES) {
    if (lower.includes(type.name.toLowerCase())) {
      return type.fareRank;
    }
  }

  // Default to mid-range
  return 4;
}
