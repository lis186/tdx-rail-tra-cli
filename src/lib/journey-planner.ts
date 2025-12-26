/**
 * Journey Planner Module
 * 行程規劃模組 - 支援直達與轉乘規劃
 */

/**
 * Journey segment - a single leg of a journey (one train)
 */
export interface JourneySegment {
  trainNo: string;
  trainType: string;
  trainTypeCode: string;
  fromStation: string;
  fromStationName: string;
  toStation: string;
  toStationName: string;
  departure: string;
  arrival: string;
  bikeFlag?: number;
  wheelChairFlag?: number;
}

/**
 * Journey option - a complete journey (direct or with transfers)
 */
export interface JourneyOption {
  type: 'direct' | 'transfer';
  transfers: number;
  totalDuration: number; // in minutes
  waitTime: number; // total wait time at transfer stations
  departure: string;
  arrival: string;
  transferStation?: string; // station name for display
  segments: JourneySegment[];
}

/**
 * Journey planner options
 */
export interface JourneyPlannerOptions {
  minTransferTime: number; // minimum transfer time in minutes
  maxTransferTime?: number; // maximum wait time at transfer station
  maxTransfers?: number; // maximum number of transfers
}

/**
 * Transfer station leg data for journey planning
 */
export interface TransferLegData {
  transferStation: string;
  firstLeg: JourneySegment[];
  secondLeg: JourneySegment[];
}

/**
 * Major transfer stations on Taiwan Railways
 * 台鐵主要轉乘站
 */
const TRANSFER_STATIONS = [
  '1000', // 台北
  '1020', // 板橋
  '1080', // 桃園
  '1190', // 竹南 (山海線分歧)
  '3300', // 豐原
  '3360', // 台中
  '3390', // 彰化 (山海線匯合)
  '3430', // 員林
  '3500', // 斗六
  '4080', // 嘉義
  '4220', // 台南
  '4350', // 左營
  '4400', // 高雄
  '5000', // 屏東
  '7000', // 花蓮
  '6000', // 台東
  '0900', // 基隆
  '0990', // 瑞芳 (平溪/深澳線分歧)
];

/**
 * Get all major transfer stations
 */
export function getTransferStations(): string[] {
  return [...TRANSFER_STATIONS];
}

/**
 * Calculate transfer time in minutes between two time strings
 * @param arrival - Arrival time at transfer station (HH:MM)
 * @param departure - Departure time from transfer station (HH:MM)
 * @returns Transfer time in minutes (can be negative if missed)
 */
export function calculateTransferTime(arrival: string, departure: string): number {
  const [ah, am] = arrival.split(':').map(Number);
  const [dh, dm] = departure.split(':').map(Number);

  const arrivalMinutes = ah * 60 + am;
  const departureMinutes = dh * 60 + dm;

  let diff = departureMinutes - arrivalMinutes;

  // Handle overnight: only apply if arrival is late night (after 20:00)
  // and departure is early morning (before 07:00)
  // This prevents treating "06:08 departure after 08:12 arrival" as overnight
  if (diff < 0 && ah >= 20 && dh < 7) {
    diff += 24 * 60;
  }

  return diff;
}

/**
 * Check if a transfer is valid (has enough time)
 * @param arrival - Arrival time at transfer station
 * @param departure - Departure time from transfer station
 * @param minTransferTime - Minimum required transfer time in minutes
 * @returns true if the transfer is valid
 */
export function isValidTransfer(
  arrival: string,
  departure: string,
  minTransferTime: number
): boolean {
  const transferTime = calculateTransferTime(arrival, departure);
  return transferTime >= minTransferTime;
}

/**
 * Calculate duration in minutes from departure to arrival
 */
function calculateDuration(departure: string, arrival: string): number {
  const [dh, dm] = departure.split(':').map(Number);
  const [ah, am] = arrival.split(':').map(Number);

  let duration = (ah * 60 + am) - (dh * 60 + dm);

  // Handle overnight trains
  if (duration < 0) {
    duration += 24 * 60;
  }

  return duration;
}

/**
 * Find all valid journey options
 * @param directTrains - Direct trains from origin to destination
 * @param transferLegs - Transfer options with first and second leg trains
 * @param options - Planner options
 * @returns Array of valid journey options
 */
export function findJourneyOptions(
  directTrains: JourneySegment[],
  transferLegs: TransferLegData[],
  options: JourneyPlannerOptions
): JourneyOption[] {
  const journeys: JourneyOption[] = [];

  // Add direct trains
  for (const train of directTrains) {
    const duration = calculateDuration(train.departure, train.arrival);
    journeys.push({
      type: 'direct',
      transfers: 0,
      totalDuration: duration,
      waitTime: 0,
      departure: train.departure,
      arrival: train.arrival,
      segments: [train],
    });
  }

  // Add transfer options
  for (const leg of transferLegs) {
    for (const first of leg.firstLeg) {
      for (const second of leg.secondLeg) {
        // Check if transfer is valid
        if (!isValidTransfer(first.arrival, second.departure, options.minTransferTime)) {
          continue;
        }

        // Check max transfer time if specified
        const waitTime = calculateTransferTime(first.arrival, second.departure);
        if (options.maxTransferTime !== undefined && waitTime > options.maxTransferTime) {
          continue;
        }

        // Calculate total duration (from first departure to last arrival)
        const totalDuration = calculateDuration(first.departure, second.arrival);

        journeys.push({
          type: 'transfer',
          transfers: 1,
          totalDuration,
          waitTime,
          departure: first.departure,
          arrival: second.arrival,
          transferStation: first.toStationName,
          segments: [first, second],
        });
      }
    }
  }

  return journeys;
}

/**
 * Sort journeys by specified field
 * @param journeys - Array of journey options
 * @param sortBy - Sort field
 * @returns Sorted array
 */
export function sortJourneys(
  journeys: JourneyOption[],
  sortBy: 'transfers' | 'duration' | 'departure' | 'arrival' | 'fare'
): JourneyOption[] {
  const sorted = [...journeys];

  switch (sortBy) {
    case 'transfers':
      sorted.sort((a, b) => a.transfers - b.transfers);
      break;

    case 'duration':
      sorted.sort((a, b) => a.totalDuration - b.totalDuration);
      break;

    case 'departure':
      sorted.sort((a, b) => a.departure.localeCompare(b.departure));
      break;

    case 'arrival':
      sorted.sort((a, b) => a.arrival.localeCompare(b.arrival));
      break;

    case 'fare':
      // For now, sort by transfers as a proxy (more transfers usually cheaper)
      // Could be enhanced with actual fare calculation
      sorted.sort((a, b) => a.transfers - b.transfers);
      break;
  }

  return sorted;
}
