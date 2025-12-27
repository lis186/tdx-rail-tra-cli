/**
 * Station Timetable Matcher
 * 車站時刻表比對器 - 用於支線行程規劃
 *
 * 透過比對起訖站時刻表找出共同車次，解決 TDX OD API 不支援支線的問題
 */

import type { DailyStationTimetable } from '../types/api.js';
import type { JourneySegment } from './journey-planner.js';

/**
 * 比對結果
 */
export interface MatchedTrain {
  trainNo: string;
  trainType: string;
  trainTypeCode: string;
  departure: string; // 起站發車時間
  arrival: string; // 迄站到達時間
  endingStationName: string;
}

/**
 * 驗證列車方向是否正確
 * 確保出發時間在到達時間之前
 *
 * @param departure - 起站發車時間 (HH:MM)
 * @param arrival - 迄站到達時間 (HH:MM)
 * @returns 是否為正確方向
 */
export function validateTrainDirection(
  departure: string,
  arrival: string
): boolean {
  if (!departure || !arrival) return false;

  const [depHour, depMin] = departure.split(':').map(Number);
  const [arrHour, arrMin] = arrival.split(':').map(Number);

  const depMinutes = depHour * 60 + depMin;
  const arrMinutes = arrHour * 60 + arrMin;

  // 相同時間視為無效
  if (depMinutes === arrMinutes) return false;

  // 正常情況：到達時間 > 出發時間
  if (arrMinutes > depMinutes) return true;

  // 跨日情況：出發在深夜（如 23:30），到達在凌晨（如 00:30）
  // 判斷標準：出發在 20:00 後，到達在 06:00 前
  if (depHour >= 20 && arrHour < 6) {
    return true;
  }

  // 其他情況視為反方向
  return false;
}

/**
 * 從車站時刻表中找出共同車次
 *
 * @param originTimetables - 起站時刻表
 * @param destTimetables - 迄站時刻表
 * @param originStationId - 起站 ID
 * @param destStationId - 迄站 ID
 * @returns 匹配的列車列表
 */
export function findMatchingTrains(
  originTimetables: DailyStationTimetable[],
  destTimetables: DailyStationTimetable[],
  originStationId: string,
  destStationId: string
): MatchedTrain[] {
  const matches: MatchedTrain[] = [];

  // 建立迄站車次索引 (trainNo -> timetable entry)
  const destTrainMap = new Map<
    string,
    {
      arrivalTime: string;
      trainType: string;
      endingStationName: string;
    }
  >();

  for (const timetable of destTimetables) {
    if (timetable.StationID !== destStationId) continue;

    for (const train of timetable.TimeTables) {
      // 使用 ArrivalTime，如果沒有則使用 DepartureTime（起點站情況）
      const arrivalTime = train.ArrivalTime || train.DepartureTime;
      if (!arrivalTime) continue;

      destTrainMap.set(train.TrainNo, {
        arrivalTime,
        trainType: train.TrainTypeName.Zh_tw,
        endingStationName: train.EndingStationName.Zh_tw,
      });
    }
  }

  // 遍歷起站時刻表，找出在迄站也有停靠的車次
  for (const timetable of originTimetables) {
    if (timetable.StationID !== originStationId) continue;

    for (const train of timetable.TimeTables) {
      // 使用 DepartureTime，如果沒有則使用 ArrivalTime（終點站情況）
      const departureTime = train.DepartureTime || train.ArrivalTime;
      if (!departureTime) continue;

      const destInfo = destTrainMap.get(train.TrainNo);
      if (!destInfo) continue;

      // 驗證方向正確（出發時間 < 到達時間）
      if (!validateTrainDirection(departureTime, destInfo.arrivalTime)) {
        continue;
      }

      matches.push({
        trainNo: train.TrainNo,
        trainType: train.TrainTypeName.Zh_tw,
        trainTypeCode: getTrainTypeCode(train.TrainTypeName.Zh_tw),
        departure: departureTime,
        arrival: destInfo.arrivalTime,
        endingStationName: destInfo.endingStationName,
      });
    }
  }

  // 按出發時間排序
  matches.sort((a, b) => {
    const [aHour, aMin] = a.departure.split(':').map(Number);
    const [bHour, bMin] = b.departure.split(':').map(Number);
    return aHour * 60 + aMin - (bHour * 60 + bMin);
  });

  return matches;
}

/**
 * 從車種名稱取得車種代碼
 */
function getTrainTypeCode(trainTypeName: string): string {
  if (trainTypeName.includes('太魯閣')) return '1';
  if (trainTypeName.includes('普悠瑪')) return '2';
  if (trainTypeName.includes('EMU3000')) return '3';
  if (trainTypeName.includes('自強')) return '4';
  if (trainTypeName.includes('莒光')) return '5';
  if (trainTypeName.includes('復興')) return '6';
  if (trainTypeName.includes('區間快')) return '7';
  if (trainTypeName.includes('區間')) return '8';
  return '9'; // 其他
}

/**
 * 車站時刻表比對器
 * 封裝比對邏輯，提供 JourneySegment 格式輸出
 */
export class StationTimetableMatcher {
  /**
   * 比對車站時刻表並轉換為 JourneySegment 格式
   *
   * @param originTimetables - 起站時刻表
   * @param destTimetables - 迄站時刻表
   * @param originStationId - 起站 ID
   * @param destStationId - 迄站 ID
   * @param originStationName - 起站名稱
   * @param destStationName - 迄站名稱
   * @returns JourneySegment 陣列
   */
  toJourneySegments(
    originTimetables: DailyStationTimetable[],
    destTimetables: DailyStationTimetable[],
    originStationId: string,
    destStationId: string,
    originStationName: string,
    destStationName: string
  ): JourneySegment[] {
    const matches = findMatchingTrains(
      originTimetables,
      destTimetables,
      originStationId,
      destStationId
    );

    return matches.map((match) => ({
      trainNo: match.trainNo,
      trainType: match.trainType,
      trainTypeCode: match.trainTypeCode,
      fromStation: originStationId,
      fromStationName: originStationName,
      toStation: destStationId,
      toStationName: destStationName,
      departure: match.departure,
      arrival: match.arrival,
    }));
  }
}
