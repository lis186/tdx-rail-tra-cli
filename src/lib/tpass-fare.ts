/**
 * TPASS Cross-Region Fare Calculator
 * 跨區 TPASS 票價計算模組
 */

import { TPASS_REGIONS, type TpassRegion } from '../data/tpass-regions.js';
import { TRA_STATIONS } from '../data/stations.js';

/**
 * Fare option types
 */
export type FareOptionType = 'direct' | 'tpass_free' | 'tpass_partial';

/**
 * A fare option for cross-region travel
 */
export interface FareOption {
  type: FareOptionType;
  description: string;
  transferStation?: string;
  transferStationName?: string;
  tpassSegment?: {
    from: string;
    fromName?: string;
    to: string;
    toName?: string;
    fare: number;
  };
  paidSegment?: {
    from: string;
    fromName?: string;
    to: string;
    toName?: string;
    fare: number;
  };
  totalFare: number;
  savings: number;
  recommended?: boolean;
}

/**
 * Result of cross-region fare calculation
 */
export interface CrossRegionFareResult {
  fromStation: string;
  fromStationName?: string;
  toStation: string;
  toStationName?: string;
  regionId: string;
  regionName: string;
  crossRegion: boolean;
  directFare: number;
  options: FareOption[];
}

/**
 * Boundary station info
 */
export interface BoundaryStation {
  stationId: string;
  stationName?: string;
  distanceToDestination?: number;
}

/**
 * Get station name by ID
 */
function getStationName(stationId: string): string | undefined {
  const station = TRA_STATIONS.find(s => s.id === stationId);
  return station?.name;
}

/**
 * Check if a station is in a specific region
 */
function isStationInRegion(stationId: string, regionId: string): boolean {
  const region = TPASS_REGIONS.find(r => r.id === regionId);
  return region ? region.stationIds.includes(stationId) : false;
}

/**
 * Get region by ID
 */
function getRegion(regionId: string): TpassRegion | undefined {
  return TPASS_REGIONS.find(r => r.id === regionId);
}

/**
 * Find boundary stations for a region going towards a destination
 *
 * Returns stations at the edge of the region that are closest to the destination.
 * These are potential transfer points where user exits TPASS and buys a ticket.
 */
export function findBoundaryStations(
  regionId: string,
  destinationId: string
): BoundaryStation[] {
  const region = getRegion(regionId);
  if (!region) return [];

  // If destination is within the region, no boundary needed
  if (region.stationIds.includes(destinationId)) {
    return [];
  }

  const destIdNum = parseInt(destinationId, 10);

  // Get all stations in the region with their numeric IDs
  // Filter to only include main line stations (4-digit IDs starting with 1-5 or 0)
  // This excludes branch lines (7xxx for 宜蘭線, 6xxx for 臺東線, etc.)
  const mainLineStations = region.stationIds
    .map(id => ({
      stationId: id,
      stationName: getStationName(id),
      idNum: parseInt(id, 10),
    }))
    .filter(s => {
      if (isNaN(s.idNum)) return false;
      const firstDigit = s.stationId.charAt(0);
      // Include main line stations: 0xxx (基隆側), 1xxx-5xxx (西幹線)
      return s.stationId.length === 4 && ['0', '1', '2', '3', '4', '5'].includes(firstDigit);
    });

  if (mainLineStations.length === 0) return [];

  // Calculate distance to destination for each station
  // Sort by distance (closest first)
  const sorted = [...mainLineStations]
    .map(s => ({
      ...s,
      distanceToDestination: Math.abs(s.idNum - destIdNum),
    }))
    .sort((a, b) => a.distanceToDestination - b.distanceToDestination);

  // Return top 3 closest stations as boundary options
  return sorted.slice(0, 3).map(s => ({
    stationId: s.stationId,
    stationName: s.stationName,
    distanceToDestination: s.distanceToDestination,
  }));
}

/**
 * Calculate cross-region fare options
 *
 * @param fromId - Origin station ID
 * @param toId - Destination station ID
 * @param regionId - TPASS region ID the user holds
 * @param getFare - Function to lookup fare between two stations
 */
export async function calculateCrossRegionOptions(
  fromId: string,
  toId: string,
  regionId: string,
  getFare: (from: string, to: string) => Promise<number>
): Promise<CrossRegionFareResult> {
  const region = getRegion(regionId);
  const fromName = getStationName(fromId);
  const toName = getStationName(toId);

  const result: CrossRegionFareResult = {
    fromStation: fromId,
    fromStationName: fromName,
    toStation: toId,
    toStationName: toName,
    regionId,
    regionName: region?.name || regionId,
    crossRegion: false,
    directFare: 0,
    options: [],
  };

  // Check if destination is within the same region
  if (isStationInRegion(toId, regionId)) {
    result.crossRegion = false;
    result.options.push({
      type: 'tpass_free',
      description: 'TPASS 免費搭乘',
      totalFare: 0,
      savings: 0,
      recommended: true,
    });
    return result;
  }

  result.crossRegion = true;

  // Get direct fare
  try {
    result.directFare = await getFare(fromId, toId);
  } catch {
    result.directFare = 0;
  }

  // Add direct option
  result.options.push({
    type: 'direct',
    description: '直接購票',
    totalFare: result.directFare,
    savings: 0,
  });

  // Find boundary stations and calculate partial TPASS options
  const boundaries = findBoundaryStations(regionId, toId);

  for (const boundary of boundaries) {
    try {
      const paidFare = await getFare(boundary.stationId, toId);
      const savings = result.directFare - paidFare;

      result.options.push({
        type: 'tpass_partial',
        description: `TPASS 到${boundary.stationName || boundary.stationId}，購票到${toName || toId}`,
        transferStation: boundary.stationId,
        transferStationName: boundary.stationName,
        tpassSegment: {
          from: fromId,
          fromName,
          to: boundary.stationId,
          toName: boundary.stationName,
          fare: 0,
        },
        paidSegment: {
          from: boundary.stationId,
          fromName: boundary.stationName,
          to: toId,
          toName,
          fare: paidFare,
        },
        totalFare: paidFare,
        savings: savings > 0 ? savings : 0,
      });
    } catch {
      // Skip this boundary if fare lookup fails
      continue;
    }
  }

  // Sort by total fare and mark the best option
  result.options.sort((a, b) => a.totalFare - b.totalFare);

  // Mark recommended option (lowest fare, prefer TPASS over direct if same)
  if (result.options.length > 0) {
    const minFare = result.options[0].totalFare;
    const bestOptions = result.options.filter(o => o.totalFare === minFare);

    // Prefer TPASS options over direct
    const recommended = bestOptions.find(o => o.type === 'tpass_partial' || o.type === 'tpass_free')
      || bestOptions[0];
    recommended.recommended = true;
  }

  return result;
}

/**
 * Get the best fare option from a list
 */
export function getBestFareOption(options: FareOption[]): FareOption {
  if (options.length === 0) {
    throw new Error('No fare options provided');
  }

  // Sort by fare, then prefer TPASS options
  const sorted = [...options].sort((a, b) => {
    if (a.totalFare !== b.totalFare) {
      return a.totalFare - b.totalFare;
    }
    // Prefer TPASS options
    const typeOrder = { tpass_free: 0, tpass_partial: 1, direct: 2 };
    return (typeOrder[a.type] || 2) - (typeOrder[b.type] || 2);
  });

  return sorted[0];
}
