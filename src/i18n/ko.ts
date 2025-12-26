/**
 * Korean translations
 * 한국어 번역
 */

import type { TranslationKeys } from './zh-TW.js';

export const ko: TranslationKeys = {
  // CLI descriptions
  cli: {
    name: 'tra',
    description: '대만철도 CLI 도구 (TDX API 기반)',
    version: '버전',
  },

  // Command descriptions
  commands: {
    stations: {
      description: '역 조회',
      list: '모든 역 목록',
      get: '역 상세 조회',
      search: '역 검색',
    },
    timetable: {
      description: '시간표 조회',
      daily: '구간별 시간표 조회',
      train: '열차 시간표 조회',
      station: '역 시간표 조회',
    },
    tpass: {
      description: 'TPASS 정기권 조회',
      check: 'TPASS 적용 확인',
      regions: '모든 생활권 목록',
      stations: '생활권 역 목록',
    },
    fare: {
      description: '운임 조회',
    },
    live: {
      description: '실시간 정보',
      train: '열차 실시간 위치 조회',
      delays: '열차 지연 정보 조회',
      station: '역 도착/출발 조회',
    },
    book: {
      description: '예약 링크 생성',
    },
    lines: {
      description: '노선 조회',
      list: '모든 노선 목록',
      get: '노선 상세 조회',
      stations: '노선 역 조회',
    },
    cache: {
      description: '캐시 관리',
      status: '캐시 상태 확인',
      update: '캐시 업데이트',
      clear: '캐시 삭제',
    },
    config: {
      description: '설정 관리',
      init: '대화형 초기화',
      set: '값 설정',
      get: '값 조회',
      list: '모든 설정 목록',
      path: '설정 파일 경로 표시',
    },
    completion: {
      description: '쉘 자동완성 스크립트 생성',
      bash: 'Bash 자동완성 스크립트 생성',
      zsh: 'Zsh 자동완성 스크립트 생성',
      fish: 'Fish 자동완성 스크립트 생성',
    },
  },

  // Options
  options: {
    format: '출력 형식',
    quiet: '조용한 모드',
    verbose: '상세 모드',
    help: '도움말 표시',
    version: '버전 표시',
    date: '조회 날짜',
    direction: '방향',
    watch: '지속 모니터링 모드',
    interval: '모니터링 업데이트 간격 (초)',
    tpass: 'TPASS 적용 표시',
  },

  // Direction labels
  direction: {
    southbound: '남행',
    northbound: '북행',
    all: '전체',
  },

  // Error messages
  errors: {
    noCredentials: '오류: TDX API 인증 정보가 설정되지 않았습니다',
    credentialsHint: '환경 변수 TDX_CLIENT_ID와 TDX_CLIENT_SECRET을 설정하세요',
    configHint: '또는 tra config init으로 설정하세요',
    cannotResolveStation: '오류: 역 "{station}"을 찾을 수 없습니다',
    cannotResolveOrigin: '오류: 출발역 "{station}"을 찾을 수 없습니다',
    cannotResolveDestination: '오류: 도착역 "{station}"을 찾을 수 없습니다',
    suggestion: '제안: {suggestion}',
    notFound: '찾을 수 없음',
    trainNotFound: '열차 {trainNo}을 찾을 수 없습니다',
    regionNotFound: '오류: 생활권 "{region}"을 찾을 수 없습니다',
    regionNotFoundHint: 'tra tpass regions로 모든 생활권을 확인하세요',
    queryFailed: '조회 실패: {error}',
    invalidInput: '잘못된 입력',
  },

  // TPASS messages
  tpass: {
    checking: 'TPASS 적용 확인: {from} → {to}',
    applicable: '✅ TPASS 적용 가능',
    notApplicable: '❌ TPASS 적용 불가',
    applicableRegions: '적용 생활권:',
    applicableTrainTypes: '적용 열차 종류:',
    notApplicableTrainTypes: '비적용 열차 종류:',
    reason: '사유: {reason}',
    originRegions: '출발역 "{station}" 생활권: {regions}',
    destinationRegions: '도착역 "{station}" 생활권: {regions}',
    none: '없음',
    regionsTitle: 'TPASS 생활권',
    stationsInRegion: '{region} 생활권 ({price})',
    stationList: '역 목록:',
  },

  // Table headers
  headers: {
    trainNo: '열차번호',
    trainType: '열차종류',
    from: '출발',
    to: '도착',
    departure: '출발',
    arrival: '도착',
    destination: '종점',
    duration: '소요시간',
    stopSequence: '순서',
    stationName: '역명',
    stationId: '역 코드',
    code: '코드',
    name: '이름',
    price: '요금',
    stationCount: '역 수',
    direction: '방향',
    status: '상태',
    delay: '지연',
    platform: '플랫폼',
    remaining: '남은 시간',
  },

  // Output messages
  output: {
    noResults: '열차를 찾을 수 없습니다',
    totalTrains: '총 {count}편',
    totalStations: '총 {count}개 역',
    totalRegions: '총 {count}개 생활권',
    totalStops: '총 {count}개 정차역',
    stationTimetable: '{station} 시간표 ({date}){direction}',
    routeTimetable: '{from} → {to} ({date})',
    trainInfo: '열차 {trainNo} - {trainType}',
    trainRoute: '{from} → {to}',
  },

  // Status messages
  status: {
    onTime: '정시',
    delayed: '지연',
    delayMinutes: '{minutes}분 지연',
    cancelled: '운휴',
    unknown: '알 수 없음',
    approaching: '곧 도착',
    arrived: '도착',
    departed: '출발',
    remaining: '{time} 후',
    now: '지금',
    passed: '지남',
  },

  // Live updates
  live: {
    lastUpdate: '마지막 업데이트: {time}',
    nextUpdate: '다음 업데이트: {seconds}초 후',
    monitoring: '모니터링 중... Ctrl+C로 중지',
  },

  // Time labels
  time: {
    minutes: '분',
    hours: '시간',
    days: '일',
  },

  // Misc
  misc: {
    free: '무료',
    perMonth: '원/월',
    yes: '예',
    no: '아니오',
    separator: '─',
  },
} as const;
