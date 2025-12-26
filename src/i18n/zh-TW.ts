/**
 * Traditional Chinese translations (Taiwan)
 * 繁體中文翻譯
 */

export const zhTW = {
  // CLI descriptions
  cli: {
    name: 'tra',
    description: '台鐵 CLI 工具，使用 TDX API',
    version: '版本',
  },

  // Command descriptions
  commands: {
    stations: {
      description: '車站查詢',
      list: '列出所有車站',
      get: '查詢車站詳情',
      search: '模糊搜尋車站',
    },
    timetable: {
      description: '時刻表查詢',
      daily: '查詢起訖站每日時刻表',
      train: '查詢車次時刻表',
      station: '查詢車站每日時刻表',
    },
    tpass: {
      description: 'TPASS 月票查詢',
      check: '檢查 TPASS 適用性',
      regions: '列出所有生活圈',
      stations: '列出生活圈車站',
    },
    fare: {
      description: '票價查詢',
    },
    live: {
      description: '即時資訊查詢',
      train: '查詢車次即時位置',
      delays: '查詢列車延誤資訊',
      station: '查詢車站即時到離站',
    },
    book: {
      description: '生成訂票連結',
    },
    lines: {
      description: '路線查詢',
      list: '列出所有路線',
      get: '查詢路線詳情',
      stations: '查詢路線車站',
    },
    cache: {
      description: '快取管理',
      status: '顯示快取狀態',
      update: '更新快取資料',
      clear: '清除快取',
    },
    config: {
      description: '設定管理',
      init: '互動式初始化',
      set: '設定值',
      get: '取得值',
      list: '列出所有設定',
      path: '顯示設定檔路徑',
    },
    completion: {
      description: '產生 Shell 補全腳本',
      bash: '產生 Bash 補全腳本',
      zsh: '產生 Zsh 補全腳本',
      fish: '產生 Fish 補全腳本',
    },
  },

  // Options
  options: {
    format: '輸出格式',
    quiet: '安靜模式',
    verbose: '詳細模式',
    help: '顯示幫助',
    version: '顯示版本',
    date: '查詢日期',
    direction: '方向',
    watch: '持續監控模式',
    interval: '監控更新間隔（秒）',
    tpass: '顯示 TPASS 適用性',
  },

  // Direction labels
  direction: {
    southbound: '順行（南下）',
    northbound: '逆行（北上）',
    all: '全部',
  },

  // Error messages
  errors: {
    noCredentials: '錯誤：尚未設定 TDX API 憑證',
    credentialsHint: '請設定環境變數 TDX_CLIENT_ID 和 TDX_CLIENT_SECRET',
    configHint: '或執行 tra config init 進行設定',
    cannotResolveStation: '錯誤：無法解析車站「{station}」',
    cannotResolveOrigin: '錯誤：無法解析起站「{station}」',
    cannotResolveDestination: '錯誤：無法解析迄站「{station}」',
    suggestion: '建議：{suggestion}',
    notFound: '找不到',
    trainNotFound: '找不到車次 {trainNo}',
    regionNotFound: '錯誤：找不到生活圈「{region}」',
    regionNotFoundHint: '使用 tra tpass regions 查看所有生活圈',
    queryFailed: '查詢失敗：{error}',
    invalidInput: '無效輸入',
  },

  // TPASS messages
  tpass: {
    checking: 'TPASS 適用性檢查：{from} → {to}',
    applicable: '✅ 可使用 TPASS',
    notApplicable: '❌ 無法使用 TPASS',
    applicableRegions: '適用生活圈：',
    applicableTrainTypes: '適用車種：',
    notApplicableTrainTypes: '不適用車種：',
    reason: '原因：{reason}',
    originRegions: '起站「{station}」所屬生活圈：{regions}',
    destinationRegions: '迄站「{station}」所屬生活圈：{regions}',
    none: '無',
    regionsTitle: 'TPASS 生活圈',
    stationsInRegion: '{region}生活圈 ({price})',
    stationList: '車站列表：',
  },

  // Table headers
  headers: {
    trainNo: '車次',
    trainType: '車種',
    from: '起站',
    to: '迄站',
    departure: '出發',
    arrival: '抵達',
    destination: '終點站',
    duration: '行車時間',
    stopSequence: '站序',
    stationName: '站名',
    stationId: '車站代碼',
    code: '代碼',
    name: '名稱',
    price: '票價',
    stationCount: '車站數',
    direction: '方向',
    status: '狀態',
    delay: '延誤',
    platform: '月台',
    remaining: '倒數',
  },

  // Output messages
  output: {
    noResults: '沒有找到班次',
    totalTrains: '共 {count} 班次',
    totalStations: '共 {count} 個車站',
    totalRegions: '共 {count} 個生活圈',
    totalStops: '共 {count} 停靠站',
    stationTimetable: '{station} 時刻表 ({date}){direction}',
    routeTimetable: '{from} → {to} ({date})',
    trainInfo: '車次 {trainNo} - {trainType}',
    trainRoute: '{from} → {to}',
  },

  // Status messages
  status: {
    onTime: '準時',
    delayed: '誤點',
    delayMinutes: '誤點 {minutes} 分',
    cancelled: '取消',
    unknown: '未知',
    approaching: '即將到站',
    arrived: '已到站',
    departed: '已發車',
    remaining: '{time} 後',
    now: '現在',
    passed: '已過',
  },

  // Live updates
  live: {
    lastUpdate: '最後更新：{time}',
    nextUpdate: '下次更新：{seconds} 秒後',
    monitoring: '監控中... 按 Ctrl+C 停止',
  },

  // Time labels
  time: {
    minutes: '分鐘',
    hours: '小時',
    days: '天',
  },

  // Misc
  misc: {
    free: '免費',
    perMonth: '元/月',
    yes: '是',
    no: '否',
    separator: '─',
  },
} as const;

export type TranslationKeys = typeof zhTW;
