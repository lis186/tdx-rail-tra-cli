# tdx-rail-tra-cli

> Taiwan Railway (TRA) CLI tool powered by TDX API

A command-line tool for querying Taiwan Railway information, including stations, timetables, fares, and real-time train status. Designed for AI agents (Claude Code, Gemini CLI), automation tools (n8n), and power users.

## Features

- **Station Search**: Fuzzy search with typo correction and variant character support (台/臺)
- **Timetable Query**: Daily timetables, train schedules, and station departures
- **Advanced Filtering**: Filter by time, train type, bike/wheelchair service, TPASS eligibility
- **Journey Planner**: Plan trips with transfers, find optimal routes
- **Real-time Info**: Live train positions and delay information
- **Fare Query**: Ticket prices between stations
- **TPASS Support**: Check TPASS monthly pass eligibility for routes
- **Booking Links**: Generate TRA booking URLs
- **Multi-language**: Supports zh-TW, en, ja, ko
- **Offline Capable**: Cached station data for offline use
- **AI-First Design**: JSON output by default, structured errors

## Installation

### npm (Recommended)

```bash
npm install -g tdx-rail-tra-cli
```

### Binary Download

Pre-compiled binaries available for:
- macOS (ARM64, x64)
- Linux (ARM64, x64)
- Windows (x64)

Download from [Releases](https://github.com/user/tdx-rail-tra-cli/releases).

### From Source

```bash
git clone https://github.com/user/tdx-rail-tra-cli.git
cd tdx-rail-tra-cli
npm install
npm run build
npm link
```

## Prerequisites

### TDX API Credentials

You need TDX API credentials to use this tool. Get them free at [TDX Portal](https://tdx.transportdata.tw/).

Set credentials via environment variables:

```bash
export TDX_CLIENT_ID="your-client-id"
export TDX_CLIENT_SECRET="your-client-secret"
```

Or create a `.env` file:

```bash
cp .env.example .env
# Edit .env with your credentials
```

Or use the config command:

```bash
tra config init
```

## Quick Start

```bash
# Search for a station
tra stations search 台北

# Query timetable from Taipei to Kaohsiung
tra timetable daily --from 台北 --to 高雄

# Query a specific train
tra timetable train 123

# Check fare
tra fare 台北 高雄

# Live train status
tra live train 123

# Check TPASS eligibility
tra tpass check 台北 桃園
```

## Commands

### `tra stations` - Station Query

```bash
# List all stations
tra stations list

# Search stations (fuzzy search)
tra stations search 台北

# Get station info
tra stations info 1000
tra stations info 台北
```

### `tra timetable` - Timetable Query

```bash
# Daily timetable between stations
tra timetable daily 台北 高雄
tra timetable daily 台北 高雄 --date 2025-01-15

# Filter by time range
tra timetable daily 台北 高雄 --depart-after 08:00 --depart-before 12:00
tra timetable daily 台北 高雄 --arrive-by 18:00

# Filter by train type
tra timetable daily 台北 高雄 --type 自強,普悠瑪
tra timetable daily 台北 高雄 --exclude-type 區間
tra timetable daily 台北 高雄 --tpass  # TPASS eligible trains only

# Filter by services
tra timetable daily 台北 高雄 --bike       # Trains with bike service
tra timetable daily 台北 高雄 --wheelchair # Trains with wheelchair service

# Sort results
tra timetable daily 台北 高雄 --sort duration  # Fastest first
tra timetable daily 台北 高雄 --sort fare      # Cheapest first

# Query specific train schedule
tra timetable train 123

# Station timetable
tra timetable station 台北
tra timetable station 台北 --direction 0  # 0=southbound, 1=northbound
```

### `tra journey` - Journey Planner (with Transfers)

```bash
# Plan a journey (finds direct and transfer options)
tra journey 基隆 屏東
tra journey 花蓮 嘉義 --date 2025-01-15

# Filter options
tra journey 台北 高雄 --depart-after 08:00
tra journey 台北 高雄 --arrive-by 18:00

# Transfer settings
tra journey 基隆 屏東 --max-transfers 2      # Allow up to 2 transfers
tra journey 基隆 屏東 --min-transfer-time 15 # Min 15 min between trains
tra journey 基隆 屏東 --max-wait-time 60     # Max 60 min wait at station

# Sort by different criteria
tra journey 基隆 屏東 --sort transfers  # Fewest transfers first
tra journey 基隆 屏東 --sort duration   # Fastest first (default)
tra journey 基隆 屏東 --sort departure  # Earliest departure first

# Table output for better readability
tra journey 基隆 屏東 -f table
```

**Example Output (table format):**
```
行程規劃：基隆 → 屏東 (2025-12-26)

┌────┬──────────────────────────────────────────────────┬────────┬────────┬────────┐
│ #  │ 行程                                             │ 出發   │ 抵達   │ 時長   │
├────┼──────────────────────────────────────────────────┼────────┼────────┼────────┤
│ 1  │ [轉乘] 在臺北轉車 (等15分)                       │ 06:45  │ 11:39  │ 4h54m  │
│    │ ① 1129 區間                                      │        │        │        │
│    │    基隆 06:45 → 臺北 07:30                       │        │        │        │
│    │ ② 107 普悠瑪(普悠瑪)                             │        │        │        │
│    │    臺北 07:45 → 屏東 11:39                       │        │        │        │
└────┴──────────────────────────────────────────────────┴────────┴────────┴────────┘
```

### `tra fare` - Fare Query

```bash
# Query fare between stations
tra fare 台北 高雄
tra fare --from 台北 --to 高雄
```

### `tra live` - Real-time Information

```bash
# Live train position
tra live train 123

# Station live board
tra live station 台北
tra live station 台北 --watch  # Auto-refresh mode

# Multiple train delays
tra live delays --trains 123,456,789
```

### `tra book` - Booking Link Generator

```bash
# Generate web booking link
tra book --train 123 --from 台北 --to 高雄 --date 2025-01-15

# Generate app deep link
tra book --train 123 --from 台北 --to 高雄 --date 2025-01-15 --app

# Open in browser
tra book --train 123 --from 台北 --to 高雄 --date 2025-01-15 --open
```

### `tra tpass` - TPASS Monthly Pass

```bash
# Check if route is TPASS eligible
tra tpass check 台北 桃園

# List all TPASS regions
tra tpass regions

# List stations in a region
tra tpass stations 基北北桃
```

### `tra lines` - Railway Lines

```bash
# List all lines
tra lines list

# Get line info
tra lines info TRA-WestMainLine

# Get stations on a line
tra lines stations TRA-WestMainLine
```

### `tra cache` - Cache Management

```bash
# Show cache status
tra cache status

# Update cached data
tra cache update

# Clear cache
tra cache clear
```

### `tra config` - Configuration

```bash
# Interactive setup
tra config init

# Set config value
tra config set lang en
tra config set default-format table

# Get config value
tra config get lang

# List all config
tra config list

# Show config file path
tra config path
```

### `tra completion` - Shell Completion

```bash
# Generate completion script
tra completion bash >> ~/.bashrc
tra completion zsh >> ~/.zshrc
tra completion fish > ~/.config/fish/completions/tra.fish
```

## Global Options

| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Output format: `json` (default), `table`, `csv` |
| `-l, --lang <lang>` | Language: `zh-TW` (default), `en`, `ja`, `ko` |
| `-q, --quiet` | Suppress non-essential output |
| `-v, --verbose` | Show debug information |
| `--offline` | Use cached data only |
| `-h, --help` | Show help |
| `--version` | Show version |

## Output Formats

### JSON (Default)

```bash
tra stations search 台北 -f json
```

```json
{
  "success": true,
  "data": [
    { "id": "1000", "name": "臺北", "nameEn": "Taipei" }
  ]
}
```

### Table

```bash
tra timetable daily --from 台北 --to 高雄 -f table
```

```
┌──────────┬──────┬────────┬──────────┬──────────┬────────┐
│ Departs  │ No.  │ Type   │ Dep      │ Arr      │ Status │
├──────────┼──────┼────────┼──────────┼──────────┼────────┤
│ 15min    │ 123  │ 自強   │ 08:30    │ 12:45    │ On time│
└──────────┴──────┴────────┴──────────┴──────────┴────────┘
```

## Station Input Flexibility

The CLI accepts multiple station input formats:

```bash
# Station ID
tra fare 1000 4400

# Chinese name
tra fare 台北 高雄

# Traditional Chinese
tra fare 臺北 高雄

# Nicknames
tra fare 北車 高火

# All equivalent
tra timetable daily --from 1000 --to 高雄
tra timetable daily --from 台北 --to 4400
tra timetable daily --from 北車 --to 高火
```

### Supported Nicknames

| Nickname | Station |
|----------|---------|
| 北車 | 臺北 (1000) |
| 高車 | 高雄 (4400) |
| 高火 | 高雄 (4400) |
| 南車 | 臺南 (4220) |
| 左營 | 新左營 (4350) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TDX_CLIENT_ID` | TDX API client ID |
| `TDX_CLIENT_SECRET` | TDX API client secret |
| `TRA_LANG` | Default language |
| `NO_COLOR` | Disable colored output |

## API Compliance

This CLI implements TDX API best practices:

- **Rate Limiting**: Token Bucket algorithm (50 req/s)
- **Retry**: Exponential backoff for transient errors (408, 429, 500, 502, 503, 504)
- **Token Caching**: OAuth2 token cached with 60-second refresh buffer
- **Data Caching**: Timetables (4h), Fares (7d), Static data (24h)

## Development

### Setup

```bash
git clone https://github.com/user/tdx-rail-tra-cli.git
cd tdx-rail-tra-cli
npm install
cp .env.example .env  # Add your TDX credentials
```

### Scripts

```bash
# Development
npm run dev -- stations list

# Build
npm run build

# Build binaries
npm run build:binary        # Current platform
npm run build:binary:all    # All platforms

# Test
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report

# Type check
npm run typecheck
```

### Testing

The project uses Vitest with TDD methodology:

```bash
# Run all 648 tests
npm test

# Run specific test file
npm test -- tests/lib/station-resolver.test.ts

# Watch mode
npm run test:watch
```

Test categories:
- Unit tests: `tests/lib/`, `tests/services/`, `tests/commands/`
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

### Project Structure

```
src/
├── index.ts              # Entry point
├── cli.ts                # CLI setup (Commander)
├── commands/             # Command implementations
├── services/             # API, Auth, Cache services
├── lib/                  # Core logic (station resolver, fuzzy search)
├── i18n/                 # Internationalization
├── data/                 # Embedded fallback data
├── utils/                # Output formatting, errors
└── types/                # TypeScript types
```

## Troubleshooting

### "Invalid credentials" error

1. Check your TDX credentials are correct
2. Ensure environment variables are set:
   ```bash
   echo $TDX_CLIENT_ID
   echo $TDX_CLIENT_SECRET
   ```
3. Try `tra config init` to reconfigure

### "Station not found" error

- Use fuzzy search: `tra stations search <partial-name>`
- Try different character variants (台/臺)
- Check station ID directly: `tra stations list`

### Cache issues

```bash
# Clear all cache
tra cache clear

# Update station data
tra cache update
```

### Rate limit exceeded

The CLI implements automatic rate limiting. If you see rate limit errors:
- Wait a moment and retry
- Reduce request frequency in automation scripts
- Check if multiple instances are running

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests first (TDD)
4. Implement the feature
5. Ensure all tests pass
6. Submit a pull request

## License

MIT

## Links

- [TDX Portal](https://tdx.transportdata.tw/) - Get API credentials
- [TDX API Documentation](https://tdx.transportdata.tw/webapi/File/Swagger/V3/5fa88b0c-120b-43f1-b188-c379ddb2593d) - TRA API Swagger
- [Taiwan Railway](https://www.railway.gov.tw/) - Official TRA website
