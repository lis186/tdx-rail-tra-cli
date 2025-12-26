/**
 * English translations
 */

import type { TranslationKeys } from './zh-TW.js';

export const en: TranslationKeys = {
  // CLI descriptions
  cli: {
    name: 'tra',
    description: 'Taiwan Railway CLI tool powered by TDX API',
    version: 'Version',
  },

  // Command descriptions
  commands: {
    stations: {
      description: 'Station queries',
      list: 'List all stations',
      get: 'Get station details',
      search: 'Fuzzy search stations',
    },
    timetable: {
      description: 'Timetable queries',
      daily: 'Query daily timetable between stations',
      train: 'Query train timetable',
      station: 'Query daily station timetable',
    },
    tpass: {
      description: 'TPASS pass queries',
      check: 'Check TPASS eligibility',
      regions: 'List all living circles',
      stations: 'List stations in a living circle',
    },
    fare: {
      description: 'Fare queries',
    },
    live: {
      description: 'Real-time information',
      train: 'Query train real-time position',
      delays: 'Query train delay information',
      station: 'Query station arrivals/departures',
    },
    book: {
      description: 'Generate booking link',
    },
    lines: {
      description: 'Line queries',
      list: 'List all lines',
      get: 'Get line details',
      stations: 'Query stations on a line',
    },
    cache: {
      description: 'Cache management',
      status: 'Show cache status',
      update: 'Update cache data',
      clear: 'Clear cache',
    },
    config: {
      description: 'Configuration management',
      init: 'Interactive initialization',
      set: 'Set value',
      get: 'Get value',
      list: 'List all settings',
      path: 'Show config file path',
    },
    completion: {
      description: 'Generate shell completion scripts',
      bash: 'Generate Bash completion script',
      zsh: 'Generate Zsh completion script',
      fish: 'Generate Fish completion script',
    },
  },

  // Options
  options: {
    format: 'Output format',
    quiet: 'Quiet mode',
    verbose: 'Verbose mode',
    help: 'Show help',
    version: 'Show version',
    date: 'Query date',
    direction: 'Direction',
    watch: 'Continuous monitoring mode',
    interval: 'Monitoring update interval (seconds)',
    tpass: 'Show TPASS eligibility',
  },

  // Direction labels
  direction: {
    southbound: 'Southbound',
    northbound: 'Northbound',
    all: 'All',
  },

  // Error messages
  errors: {
    noCredentials: 'Error: TDX API credentials not configured',
    credentialsHint: 'Please set environment variables TDX_CLIENT_ID and TDX_CLIENT_SECRET',
    configHint: 'Or run tra config init to configure',
    cannotResolveStation: 'Error: Cannot resolve station "{station}"',
    cannotResolveOrigin: 'Error: Cannot resolve origin station "{station}"',
    cannotResolveDestination: 'Error: Cannot resolve destination station "{station}"',
    suggestion: 'Suggestion: {suggestion}',
    notFound: 'Not found',
    trainNotFound: 'Train {trainNo} not found',
    regionNotFound: 'Error: Living circle "{region}" not found',
    regionNotFoundHint: 'Use tra tpass regions to view all living circles',
    queryFailed: 'Query failed: {error}',
    invalidInput: 'Invalid input',
  },

  // TPASS messages
  tpass: {
    checking: 'TPASS eligibility check: {from} → {to}',
    applicable: '✅ TPASS eligible',
    notApplicable: '❌ TPASS not eligible',
    applicableRegions: 'Eligible living circles:',
    applicableTrainTypes: 'Eligible train types:',
    notApplicableTrainTypes: 'Ineligible train types:',
    reason: 'Reason: {reason}',
    originRegions: 'Origin "{station}" living circles: {regions}',
    destinationRegions: 'Destination "{station}" living circles: {regions}',
    none: 'None',
    regionsTitle: 'TPASS Living Circles',
    stationsInRegion: '{region} Living Circle ({price})',
    stationList: 'Station list:',
  },

  // Table headers
  headers: {
    trainNo: 'Train No.',
    trainType: 'Train Type',
    from: 'From',
    to: 'To',
    departure: 'Departure',
    arrival: 'Arrival',
    destination: 'Destination',
    duration: 'Duration',
    stopSequence: 'Seq',
    stationName: 'Station',
    stationId: 'Station ID',
    code: 'Code',
    name: 'Name',
    price: 'Price',
    stationCount: 'Stations',
    direction: 'Direction',
    status: 'Status',
    delay: 'Delay',
    platform: 'Platform',
    remaining: 'Remaining',
  },

  // Output messages
  output: {
    noResults: 'No trains found',
    totalTrains: 'Total {count} trains',
    totalStations: 'Total {count} stations',
    totalRegions: 'Total {count} living circles',
    totalStops: 'Total {count} stops',
    stationTimetable: '{station} Timetable ({date}){direction}',
    routeTimetable: '{from} → {to} ({date})',
    trainInfo: 'Train {trainNo} - {trainType}',
    trainRoute: '{from} → {to}',
  },

  // Status messages
  status: {
    onTime: 'On time',
    delayed: 'Delayed',
    delayMinutes: 'Delayed {minutes} min',
    cancelled: 'Cancelled',
    unknown: 'Unknown',
    approaching: 'Approaching',
    arrived: 'Arrived',
    departed: 'Departed',
    remaining: 'in {time}',
    now: 'Now',
    passed: 'Passed',
  },

  // Live updates
  live: {
    lastUpdate: 'Last update: {time}',
    nextUpdate: 'Next update in {seconds} seconds',
    monitoring: 'Monitoring... Press Ctrl+C to stop',
  },

  // Time labels
  time: {
    minutes: 'minutes',
    hours: 'hours',
    days: 'days',
  },

  // Misc
  misc: {
    free: 'Free',
    perMonth: '/month',
    yes: 'Yes',
    no: 'No',
    separator: '─',
  },
} as const;
