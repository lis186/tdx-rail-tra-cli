/**
 * Japanese translations
 * 日本語翻訳
 */

import type { TranslationKeys } from './zh-TW.js';

export const ja: TranslationKeys = {
  // CLI descriptions
  cli: {
    name: 'tra',
    description: '台湾鉄道 CLI ツール（TDX API 使用）',
    version: 'バージョン',
  },

  // Command descriptions
  commands: {
    stations: {
      description: '駅情報検索',
      list: '全駅を表示',
      get: '駅詳細を表示',
      search: '駅名でファジー検索',
    },
    timetable: {
      description: '時刻表検索',
      daily: '駅間の時刻表を検索',
      train: '列車時刻表を検索',
      station: '駅の時刻表を検索',
    },
    tpass: {
      description: 'TPASS 定期券検索',
      check: 'TPASS 適用を確認',
      regions: '全生活圏を表示',
      stations: '生活圏の駅を表示',
    },
    fare: {
      description: '運賃検索',
    },
    live: {
      description: 'リアルタイム情報',
      train: '列車のリアルタイム位置を検索',
      delays: '列車遅延情報を検索',
      station: '駅の発着情報を検索',
    },
    book: {
      description: '予約リンクを生成',
    },
    lines: {
      description: '路線検索',
      list: '全路線を表示',
      get: '路線詳細を表示',
      stations: '路線の駅を検索',
    },
    cache: {
      description: 'キャッシュ管理',
      status: 'キャッシュ状態を表示',
      update: 'キャッシュを更新',
      clear: 'キャッシュをクリア',
    },
    config: {
      description: '設定管理',
      init: '対話式初期化',
      set: '値を設定',
      get: '値を取得',
      list: '全設定を表示',
      path: '設定ファイルパスを表示',
    },
    completion: {
      description: 'シェル補完スクリプトを生成',
      bash: 'Bash 補完スクリプトを生成',
      zsh: 'Zsh 補完スクリプトを生成',
      fish: 'Fish 補完スクリプトを生成',
    },
  },

  // Options
  options: {
    format: '出力形式',
    quiet: '静音モード',
    verbose: '詳細モード',
    help: 'ヘルプを表示',
    version: 'バージョンを表示',
    date: '検索日',
    direction: '方向',
    watch: '継続監視モード',
    interval: '監視更新間隔（秒）',
    tpass: 'TPASS 適用を表示',
  },

  // Direction labels
  direction: {
    southbound: '南行き',
    northbound: '北行き',
    all: '全て',
  },

  // Error messages
  errors: {
    noCredentials: 'エラー：TDX API 認証情報が設定されていません',
    credentialsHint: '環境変数 TDX_CLIENT_ID と TDX_CLIENT_SECRET を設定してください',
    configHint: 'または tra config init で設定してください',
    cannotResolveStation: 'エラー：駅「{station}」を解決できません',
    cannotResolveOrigin: 'エラー：出発駅「{station}」を解決できません',
    cannotResolveDestination: 'エラー：到着駅「{station}」を解決できません',
    suggestion: '提案：{suggestion}',
    notFound: '見つかりません',
    trainNotFound: '列車 {trainNo} が見つかりません',
    regionNotFound: 'エラー：生活圏「{region}」が見つかりません',
    regionNotFoundHint: 'tra tpass regions で全生活圏を確認してください',
    queryFailed: '検索に失敗しました：{error}',
    invalidInput: '無効な入力',
  },

  // TPASS messages
  tpass: {
    checking: 'TPASS 適用確認：{from} → {to}',
    applicable: '✅ TPASS 適用可能',
    notApplicable: '❌ TPASS 適用不可',
    applicableRegions: '適用生活圏：',
    applicableTrainTypes: '適用列車種別：',
    notApplicableTrainTypes: '非適用列車種別：',
    reason: '理由：{reason}',
    originRegions: '出発駅「{station}」の生活圏：{regions}',
    destinationRegions: '到着駅「{station}」の生活圏：{regions}',
    none: 'なし',
    regionsTitle: 'TPASS 生活圏',
    stationsInRegion: '{region}生活圏（{price}）',
    stationList: '駅一覧：',
  },

  // Table headers
  headers: {
    trainNo: '列車番号',
    trainType: '列車種別',
    from: '出発',
    to: '到着',
    departure: '発車',
    arrival: '到着',
    destination: '終点',
    duration: '所要時間',
    stopSequence: '順序',
    stationName: '駅名',
    stationId: '駅コード',
    code: 'コード',
    name: '名称',
    price: '料金',
    stationCount: '駅数',
    direction: '方向',
    status: '状態',
    delay: '遅延',
    platform: 'ホーム',
    remaining: '残り',
  },

  // Output messages
  output: {
    noResults: '列車が見つかりません',
    totalTrains: '合計 {count} 本',
    totalStations: '合計 {count} 駅',
    totalRegions: '合計 {count} 生活圏',
    totalStops: '合計 {count} 停車駅',
    stationTimetable: '{station} 時刻表（{date}）{direction}',
    routeTimetable: '{from} → {to}（{date}）',
    trainInfo: '列車 {trainNo} - {trainType}',
    trainRoute: '{from} → {to}',
  },

  // Status messages
  status: {
    onTime: '定刻',
    delayed: '遅延',
    delayMinutes: '{minutes} 分遅延',
    cancelled: '運休',
    unknown: '不明',
    approaching: 'まもなく到着',
    arrived: '到着済み',
    departed: '発車済み',
    remaining: '{time} 後',
    now: '今',
    passed: '通過済み',
  },

  // Live updates
  live: {
    lastUpdate: '最終更新：{time}',
    nextUpdate: '次回更新：{seconds} 秒後',
    monitoring: '監視中... Ctrl+C で停止',
  },

  // Time labels
  time: {
    minutes: '分',
    hours: '時間',
    days: '日',
  },

  // Misc
  misc: {
    free: '無料',
    perMonth: '円/月',
    yes: 'はい',
    no: 'いいえ',
    separator: '─',
  },
} as const;
