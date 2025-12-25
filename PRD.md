# PRD: tdx-tra CLI

> Taiwan Railway (TRA) CLI tool powered by TDX API
> Version: 1.0
> Date: 2025-12-25

---

## 1. Overview

### 1.1 Purpose

提供一個命令列工具，讓 AI agents（Claude Code、Gemini CLI、n8n）和開發者可以方便地查詢台鐵資料，包含車站、時刻表、票價和即時動態。

### 1.2 Target Users

| 用戶類型 | 使用情境 |
|----------|----------|
| AI Agents | Claude Code/Gemini CLI 自動查詢台鐵資訊 |
| n8n/Automation | 自動化工作流程整合（取代現有 HTTP Request nodes） |
| Developers | 快速查詢、腳本整合 |
| Power Users | 終端機查詢時刻表 |

### 1.3 Design Principles

1. **AI-First**: JSON 預設輸出，結構化錯誤，完整 `--help`
2. **Offline-Capable**: 靜態資料快取，減少 API 依賴
3. **Fuzzy-Friendly**: 車站名稱模糊搜尋，容錯輸入
4. **Predictable**: 資源導向命令結構，一致的 API 設計
5. **n8n-Compatible**: 與現有 n8n workflow 功能對等

---

## 2. Technical Specifications

### 2.1 Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | 型別安全、n8n 生態整合 |
| Runtime | Node.js 20+ / Bun | 跨平台支援 |
| CLI Framework | Commander.js | 成熟、功能完整 |
| HTTP Client | ofetch / ky | 輕量、支援 retry |
| Fuzzy Search | 自製 Levenshtein | 與 n8n workflow 一致 |
| Config Storage | conf | 跨平台設定管理 |
| Output Table | cli-table3 | 終端機表格輸出 |
| Testing | Vitest | 快速、Bun 相容、ESM 支援 |
| Mocking | msw | API mocking for tests |

### 2.2 Package Info

```json
{
  "name": "tdx-rail-tra-cli",
  "bin": {
    "tra": "./dist/index.js"
  }
}
```

### 2.3 Distribution

- npm: `npm install -g tdx-rail-tra-cli`
- Binary: 使用 `bun build --compile` 產生單一執行檔（未來）

---

## 3. API Integration

### 3.1 TDX API Base

- **Base URL**: `https://tdx.transportdata.tw/api/basic`
- **Auth Endpoint**: `https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token`
- **Auth Method**: OAuth2 Client Credentials Flow

### 3.2 Endpoints（基於 n8n Workflow 分析）

#### 核心 API（與現有 n8n Workflow 對齊）

| Endpoint | Version | 說明 | CLI Command |
|----------|---------|------|-------------|
| Token | - | OAuth2 認證 | (internal) |
| `Rail/TRA/DailyTrainTimetable/OD/{from}/to/{to}/{date}` | v3 | 起訖站每日時刻表 | `tra timetable daily` |
| `Rail/TRA/GeneralTrainTimetable/TrainNo/{no}` | v3 | 車次一般時刻表 | `tra timetable train` |
| `Rail/TRA/TrainLiveBoard/TrainNo/{no}` | v3 | 車次即時位置 | `tra live train` |
| `Rail/TRA/LiveTrainDelay` | v2 | 列車延誤資訊 | `tra live delays` |
| `Rail/TRA/ODFare/{from}/to/{to}` | v3 | 起訖站票價 | `tra fare` |
| `/booking/deeplink/web/tra` | v3 | 網頁訂票連結 | `tra book` |
| `/booking/deeplink/direct/tra` | v3 | APP 訂票深度鏈結 | `tra book --app` |

#### 擴充 API（Phase 2+）

| Endpoint | Version | 說明 | CLI Command |
|----------|---------|------|-------------|
| `Rail/TRA/Station` | v3 | 車站資料 | `tra stations list` |
| `Rail/TRA/Line` | v3 | 路線資料 | `tra lines list` |
| `Rail/TRA/StationOfLine` | v3 | 路線車站 | `tra lines stations` |
| `Rail/TRA/TrainType` | v3 | 車種資料 | `tra train-types` |
| `Rail/TRA/DailyStationTimetable` | v3 | 車站每日時刻表 | `tra timetable station` |
| `Rail/TRA/StationLiveBoard` | v3 | 車站即時看板 | `tra live station` |

### 3.3 OData 查詢模式

基於 n8n workflow 分析，以下是實際使用的 OData 查詢：

```bash
# LiveTrainDelay - 批次查詢多車次延誤
$filter=TrainNo eq '123' or TrainNo eq '456' or TrainNo eq '789'

# DailyTrainTimetable - 篩選出發時間（特定時間後的班次）
$filter=StopTimes/any(st: st/DepartureTime ge '08:00' and st/StationID eq '1000')

# 通用參數
$format=JSON
```

---

## 4. Station Resolution Module

### 4.1 Overview

車站解析是核心功能，需支援多種輸入格式並提供智能校正。此邏輯直接從 n8n workflow 提取。

### 4.2 車站資料結構

```typescript
interface Station {
  id: string;        // e.g., "1000"
  name: string;      // e.g., "臺北"
  lat: number;       // e.g., 25.04775
  lon: number;       // e.g., 121.51711
}
```

**內嵌資料**：約 220 個車站，包含完整座標資訊（從 n8n workflow 提取）。

### 4.3 名稱解析流程

```
┌─────────────────────────────────────────────────────────────┐
│ Input: "台北車站"                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. 嘗試解析為數字 ID                                         │
│    ├─ 是數字 → 直接查找                                      │
│    └─ 非數字 → 進入名稱解析                                  │
│                                                             │
│ 2. 移除後綴                                                  │
│    "台北車站" → "台北"                                       │
│                                                             │
│ 3. 錯別字校正                                                │
│    "瑞方" → "瑞芳"                                          │
│                                                             │
│ 4. 異體字轉換                                                │
│    "台北" → 同時嘗試 "臺北"                                  │
│                                                             │
│ 5. 暱稱對應                                                  │
│    "北車" → "臺北"                                          │
│                                                             │
│ 6. 模糊搜尋 (Levenshtein distance ≤ 2)                       │
│    找到 → 返回最佳匹配 + confidence                          │
│    找不到 → 返回錯誤 + 建議                                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 校正規則表

#### 後綴移除

```typescript
const suffixes = ['火車站', '車站', '站'];
```

#### 錯別字校正

```typescript
const corrections = {
  // 簡繁體混用
  '双溪': '雙溪',
  '内灣': '內灣',
  '内壢': '內壢',

  // 同音字
  '瑞方': '瑞芳',
  '版橋': '板橋',
  '朝州': '潮州',

  // 城市名移除
  '台北市': '台北',
  '高雄市': '高雄',
};
```

#### 暱稱對應

```typescript
const nicknames = {
  '北車': '1000',   // 臺北
  '南車': '4220',   // 臺南
  '高火': '4400',   // 高雄
  '桃機': '1080',   // 桃園
};
```

### 4.5 模糊搜尋

使用 Levenshtein 編輯距離演算法：

```typescript
function findBestMatch(input: string, stations: string[]): {
  match: string | null;
  distance: number;
  confidence: 'exact' | 'high' | 'medium' | 'low';
}

// Confidence levels:
// - exact: distance = 0
// - high: distance = 1
// - medium: distance = 2
// - low: distance > 2 (不自動匹配)
```

### 4.6 錯誤回應

```json
{
  "success": false,
  "error": {
    "code": "STATION_NOT_FOUND",
    "message": "找不到車站「瑞方」",
    "suggestion": "您是否要查詢「瑞芳」？",
    "candidates": ["瑞芳", "瑞穗", "瑞源"]
  }
}
```

---

## 5. Command Design

### 5.1 Global Options

```
--format, -f    Output format: json (default) | table | csv
--lang, -l      Output language: zh-TW (default) | en | ja | ko
--quiet, -q     Suppress non-essential output
--verbose, -v   Show debug information
--offline       Use cached data only (no API calls)
--help, -h      Show help
--version       Show version
```

### 5.2 Commands

#### `tra config` - 設定管理

```bash
tra config init                    # 互動式初始化
tra config set <key> <value>       # 設定值
tra config get <key>               # 取得值
tra config list                    # 列出所有設定
tra config path                    # 顯示設定檔路徑

# Keys: client-id, client-secret, lang, default-format, cache-ttl
```

#### `tra stations` - 車站查詢

```bash
tra stations list                  # 列出所有車站
tra stations get <id-or-name>      # 查詢車站（支援 ID 或名稱）
tra stations search <query>        # 模糊搜尋

# Options:
--line <line-id>                   # 篩選特定路線
--with-location                    # 包含座標資訊
```

#### `tra timetable` - 時刻表查詢 ⭐

```bash
# 起訖站每日時刻表（對應 DailyTrainTimetable/OD）
tra timetable daily --from <station> --to <station> [options]

# Options:
--date <YYYY-MM-DD>                # 日期（預設今天）
--time <HH:MM>                     # 出發時間（篩選此時間後的班次）

# 車次時刻表（對應 GeneralTrainTimetable/TrainNo）
tra timetable train <train-no>

# 車站時刻表（對應 DailyStationTimetable）
tra timetable station <station> [options]
--date <YYYY-MM-DD>                # 日期（預設今天）
--direction <0|1>                  # 方向：0=順行 1=逆行
```

**範例**：

```bash
# 查詢台北到高雄今天的班次
tra timetable daily --from 台北 --to 高雄

# 查詢明天 08:00 後的班次
tra timetable daily --from 1000 --to 4400 --date 2025-12-26 --time 08:00

# 查詢 123 車次時刻
tra timetable train 123
```

#### `tra fare` - 票價查詢 ⭐

```bash
tra fare --from <station> --to <station>

# Options:
--type <ticket-type>               # 票種篩選
```

**範例**：

```bash
tra fare --from 台北 --to 高雄
tra fare --from 1000 --to 4400
```

#### `tra live` - 即時資訊 ⭐

```bash
# 車次即時位置（對應 TrainLiveBoard/TrainNo）
tra live train <train-no>

# 批次查詢列車延誤（對應 LiveTrainDelay）
tra live delays [options]
--trains <no1,no2,...>             # 指定車次（用逗號分隔）

# 車站即時看板（對應 StationLiveBoard）
tra live station <station> [options]
--direction <0|1>                  # 方向篩選

# Watch mode
--watch, -w                        # 持續更新模式
--interval <seconds>               # 更新間隔（預設 30）
```

**範例**：

```bash
# 查詢 123 車次即時位置
tra live train 123

# 批次查詢多車次延誤
tra live delays --trains 123,456,789

# 台北站即時看板
tra live station 台北
```

#### `tra book` - 訂票連結生成 ⭐

```bash
# 生成網頁訂票連結（預設）
tra book --train <train-no> --from <station> --to <station> --date <YYYY-MM-DD> [options]

# Options:
--app                              # 生成 APP 深度鏈結（而非網頁連結）
--type <1|2|3>                     # 票券類別：1=一般(預設) 2=騰雲座艙 3=兩鐵
--quantity <1-9>                   # 票券數量（預設 1）
--open                             # 自動開啟瀏覽器
```

**範例**：

```bash
# 生成台北到高雄 123 車次的訂票連結
tra book --train 123 --from 台北 --to 高雄 --date 2025-12-26

# 訂 2 張騰雲座艙並自動開啟瀏覽器
tra book --train 123 --from 台北 --to 高雄 --date 2025-12-26 --type 2 --quantity 2 --open

# 生成 APP 深度鏈結
tra book --train 123 --from 台北 --to 高雄 --date 2025-12-26 --app
```

**輸出**：

```json
{
  "success": true,
  "data": {
    "url": "https://tip.railway.gov.tw/tra-tip-web/tip/tip001/tip123/query?...",
    "type": "web",
    "trainNo": "123",
    "origin": "臺北",
    "destination": "高雄",
    "date": "2025-12-26",
    "ticketType": 1,
    "quantity": 1
  }
}
```

#### `tra cache` - 快取管理

```bash
tra cache status                   # 顯示快取狀態（車站數、最後更新時間等）
tra cache update                   # 更新所有靜態資料（車站、路線等）
tra cache update stations          # 僅更新車站資料
tra cache update lines             # 僅更新路線資料
tra cache clear                    # 清除所有快取
tra cache clear timetable          # 僅清除時刻表快取
```

**車站資料更新流程**：

```bash
$ tra cache update stations
Fetching stations from TDX API...
✓ Downloaded 228 stations
✓ Updated corrections table
✓ Updated location data
Cache updated: ~/.cache/tdx-tra/stations.json
Last update: 2025-12-25T10:00:00Z
```

**快取狀態顯示**：

```bash
$ tra cache status
┌─────────────┬──────────┬─────────────────────┬─────────┐
│ 資料類型    │ 筆數     │ 最後更新            │ 狀態    │
├─────────────┼──────────┼─────────────────────┼─────────┤
│ 車站        │ 228      │ 2025-12-25 10:00    │ ✓ 最新  │
│ 路線        │ 12       │ 2025-12-25 10:00    │ ✓ 最新  │
│ 時刻表快取  │ 15 files │ -                   │ 5.2 MB  │
│ Token       │ -        │ 2025-12-25 14:30    │ ✓ 有效  │
└─────────────┴──────────┴─────────────────────┴─────────┘
```

#### `tra lines` - 路線查詢

```bash
tra lines list                     # 列出所有路線
tra lines get <id>                 # 路線詳情
tra lines stations <id>            # 路線經過的車站
```

#### `tra completion` - Shell 自動補全

```bash
tra completion bash                # 輸出 bash completion script
tra completion zsh                 # 輸出 zsh completion script
tra completion fish                # 輸出 fish completion script

# 安裝方式
tra completion bash >> ~/.bashrc
tra completion zsh >> ~/.zshrc
tra completion fish > ~/.config/fish/completions/tra.fish
```

**補全功能**：

```bash
$ tra tim<TAB>
timetable

$ tra timetable <TAB>
daily    station    train

$ tra timetable daily --from <TAB>
台北    板橋    桃園    新竹    台中    高雄    ...

$ tra timetable daily --from 台<TAB>
台北    台中    台南    台東

$ tra live <TAB>
delays    station    train

$ tra cache <TAB>
clear    status    update
```

**動態補全**：
- 車站名稱：從快取的車站資料動態補全
- 車次號碼：最近查詢過的車次
- 日期：今天、明天、後天的快捷輸入

### 5.3 Input Flexibility

車站參數支援多種輸入格式：

```bash
# 以下等效
tra timetable daily --from 1000 --to 4400
tra timetable daily --from 台北 --to 高雄
tra timetable daily --from "臺北" --to "高雄"
tra timetable daily --from 北車 --to 高火
```

---

## 6. Output Design

### 6.1 JSON Output (Default)

成功回應（時刻表查詢）：

```json
{
  "success": true,
  "data": {
    "trains": [
      {
        "trainNo": "123",
        "trainType": "自強",
        "trainTypeName": "自強號",
        "endingStation": "高雄",
        "departureTime": "08:30",
        "arrivalTime": "12:45",
        "duration": "4h15m",
        "departsIn": 15,
        "departsInText": "15分鐘後",
        "delayTime": 0,
        "delayStatus": "準時",
        "adjustedDepartureTime": "08:30",
        "adjustedArrivalTime": "12:45"
      },
      {
        "trainNo": "125",
        "trainType": "自強",
        "trainTypeName": "普悠瑪",
        "endingStation": "高雄",
        "departureTime": "09:00",
        "arrivalTime": "13:10",
        "duration": "4h10m",
        "departsIn": 45,
        "departsInText": "45分鐘後",
        "delayTime": 5,
        "delayStatus": "晚5分",
        "adjustedDepartureTime": "09:05",
        "adjustedArrivalTime": "13:15"
      }
    ],
    "query": {
      "from": { "id": "1000", "name": "臺北" },
      "to": { "id": "4400", "name": "高雄" },
      "date": "2025-12-25"
    },
    "hasDelayInfo": true
  },
  "meta": {
    "cached": false,
    "timestamp": "2025-12-25T10:00:00Z",
    "apiVersion": "v3"
  }
}
```

錯誤回應：

```json
{
  "success": false,
  "error": {
    "code": "STATION_NOT_FOUND",
    "message": "找不到車站「瑞方」",
    "suggestion": "您是否要查詢「瑞芳」？",
    "candidates": ["瑞芳", "瑞穗", "瑞源"]
  }
}
```

### 6.2 Table Output

```
┌──────────┬──────┬────────┬──────────┬──────────┬──────────┬────────┐
│ 倒數     │ 車次 │ 車種   │ 出發     │ 抵達     │ 終點站   │ 狀態   │
├──────────┼──────┼────────┼──────────┼──────────┼──────────┼────────┤
│ ⏰ 15分  │ 123  │ 自強   │ 08:30    │ 12:45    │ 高雄     │ 準時   │
│ ⏰ 45分  │ 125  │ 普悠瑪 │ 09:00    │ 13:15    │ 高雄     │ 晚5分  │
│ ⏰ 1h20m │ 127  │ 區間   │ 09:50    │ 15:30    │ 屏東     │ 準時   │
└──────────┴──────┴────────┴──────────┴──────────┴──────────┴────────┘

⚠️ 即時誤點資訊可用，抵達時間已根據延誤調整
```

**無即時資訊時**：

```
┌──────────┬──────┬────────┬──────────┬──────────┬──────────┬────────┐
│ 倒數     │ 車次 │ 車種   │ 出發     │ 抵達     │ 終點站   │ 狀態   │
├──────────┼──────┼────────┼──────────┼──────────┼──────────┼────────┤
│ ⏰ 15分  │ 123  │ 自強   │ 08:30    │ 12:45    │ 高雄     │ 時刻表 │
│ ⏰ 45分  │ 125  │ 普悠瑪 │ 09:00    │ 13:10    │ 高雄     │ 時刻表 │
└──────────┴──────┴────────┴──────────┴──────────┴──────────┴────────┘

⚠️ 無法取得即時誤點資訊，顯示預定時刻表
```

### 6.3 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User error (invalid input, missing args) |
| 2 | API error (network, server error) |
| 3 | Auth error (invalid credentials, expired token) |
| 4 | Cache error (no cache in offline mode) |

### 6.4 Internationalization (i18n)

支援四種語言輸出：繁體中文（預設）、英文、日文、韓文。

**語言設定優先順序**：
1. 命令列參數 `--lang`
2. 環境變數 `TRA_LANG`
3. 設定檔 `~/.config/tdx-tra/config.json` 中的 `lang`
4. 系統語言（`LANG` 環境變數）
5. 預設 `zh-TW`

**使用範例**：

```bash
# 繁體中文（預設）
$ tra timetable daily --from 台北 --to 高雄
⏰ 15分後  123 自強號 → 高雄  08:30 出發  準時

# 英文
$ tra timetable daily --from 台北 --to 高雄 --lang en
⏰ 15min  123 Tze-Chiang → Kaohsiung  Dep 08:30  On time

# 日文
$ tra timetable daily --from 台北 --to 高雄 --lang ja
⏰ 15分後  123 自強号 → 高雄  08:30 発  定刻

# 韓文
$ tra timetable daily --from 台北 --to 高雄 --lang ko
⏰ 15분 후  123 쯔창호 → 가오슝  08:30 출발  정시
```

**多語言欄位對應**：

| 欄位 | zh-TW | en | ja | ko |
|------|-------|----|----|-----|
| 車種 | 自強號 | Tze-Chiang | 自強号 | 쯔창호 |
| 車種 | 普悠瑪 | Puyuma | プユマ | 푸유마 |
| 車種 | 區間車 | Local | 区間車 | 완행 |
| 狀態 | 準時 | On time | 定刻 | 정시 |
| 狀態 | 晚5分 | Delayed 5min | 5分遅れ | 5분 지연 |
| 出發 | 出發 | Dep | 発 | 출발 |
| 抵達 | 抵達 | Arr | 着 | 도착 |

**車站名稱**：
- TDX API 提供 `StationName.Zh_tw` 和 `StationName.En`
- 日文：使用中文名稱（漢字相同）
- 韓文：使用英文名稱音譯或常用韓文譯名

**設定預設語言**：

```bash
tra config set lang en
```

---

## 7. Caching Strategy

### 7.1 Cache Location

```
~/.cache/tdx-tra/
├── stations.json           # 車站資料（可透過 tra cache update 更新）
├── lines.json              # 路線資料
├── corrections.json        # 使用者自訂校正規則（可選）
├── timetable/
│   └── od-{from}-{to}-{date}.json   # 時刻表快取
├── meta.json               # 快取 metadata（版本、更新時間）
└── token.json              # OAuth token（加密）
```

### 7.2 Cache Policy（對齊 n8n workflow）

| Data Type | TTL | 說明 |
|-----------|-----|------|
| Stations | 30 days | 可透過 `tra cache update stations` 手動更新 |
| Lines | 30 days | 可透過 `tra cache update lines` 手動更新 |
| OAuth Token | Until expiry | 自動刷新 |
| DailyTrainTimetable/OD | 5.5 hours | 與 n8n Redis 快取一致 |
| GeneralTrainTimetable | 24 hours | 一般時刻表較少變動 |
| LiveTrainDelay | No cache | 即時資料 |
| TrainLiveBoard | No cache | 即時資料 |
| ODFare | 7 days | 票價較少變動 |

### 7.3 Station Data Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Station Data Loading Priority                               │
├─────────────────────────────────────────────────────────────┤
│ 1. ~/.cache/tdx-tra/stations.json (使用者快取)              │
│    ├─ 存在且未過期 → 使用快取                               │
│    └─ 不存在或過期 → 下一步                                 │
│                                                             │
│ 2. 內嵌預設資料 (src/data/stations.ts)                      │
│    └─ 作為 fallback，確保離線可用                           │
│                                                             │
│ 3. 首次執行時自動提示更新                                    │
│    $ tra stations list                                      │
│    ⚠️ 車站資料尚未初始化，正在下載...                        │
│    ✓ 已下載 228 個車站                                      │
└─────────────────────────────────────────────────────────────┘
```

**stations.json 結構**：

```json
{
  "version": "1.0.0",
  "updatedAt": "2025-12-25T10:00:00Z",
  "source": "TDX API v3",
  "stations": [
    { "id": "1000", "name": "臺北", "lat": 25.04775, "lon": 121.51711 }
  ],
  "nicknames": {
    "北車": "1000",
    "南車": "4220"
  },
  "corrections": {
    "瑞方": "瑞芳",
    "版橋": "板橋"
  }
}
```

### 7.4 Offline Mode

```bash
tra --offline stations list        # ✅ 使用內嵌資料
tra --offline timetable daily ...  # ✅ 使用快取（若存在）
tra --offline live train 123       # ❌ Error: 即時資料不支援離線模式
```

---

## 8. Authentication Flow

### 8.1 Token Management

```
┌─────────────────────────────────────────────────────┐
│ Request                                             │
├─────────────────────────────────────────────────────┤
│ 1. Check cached token                               │
│    ├─ Valid (not expired) → Use token               │
│    └─ Expired/Missing → Request new token           │
│                                                     │
│ 2. Request new token                                │
│    POST /auth/.../token                             │
│    Body: grant_type=client_credentials              │
│          client_id=xxx                              │
│          client_secret=xxx                          │
│                                                     │
│ 3. Response                                         │
│    ├─ Success → Cache token, use for request        │
│    └─ Fail → Return auth error (exit code 3)        │
└─────────────────────────────────────────────────────┘
```

### 8.2 Credential Sources (Priority)

1. `.env` file in project root (using dotenv)
2. Environment variables: `TDX_CLIENT_ID`, `TDX_CLIENT_SECRET`
3. Config file: `~/.config/tdx-tra/config.json`
4. Interactive prompt (if TTY and not found above)

**Setup**:
```bash
cp .env.example .env
# Edit .env with your TDX credentials
```

---

## 9. Project Structure

```
tdx-tra/
├── src/
│   ├── index.ts                 # Entry point
│   ├── cli.ts                   # CLI setup (Commander)
│   ├── commands/
│   │   ├── config.ts
│   │   ├── stations.ts
│   │   ├── timetable.ts
│   │   ├── fare.ts
│   │   ├── live.ts
│   │   ├── lines.ts
│   │   └── cache.ts
│   ├── services/
│   │   ├── api.ts               # TDX API client
│   │   ├── auth.ts              # OAuth2 token management
│   │   └── cache.ts             # File-based cache
│   ├── lib/
│   │   ├── station-resolver.ts  # Station name resolution
│   │   ├── fuzzy.ts             # Levenshtein distance
│   │   ├── time-utils.ts        # 時間計算（倒數、延誤調整）
│   │   └── odata.ts             # OData query builder
│   ├── i18n/
│   │   ├── index.ts             # i18n 初始化
│   │   ├── zh-TW.ts             # 繁體中文
│   │   ├── en.ts                # English
│   │   ├── ja.ts                # 日本語
│   │   └── ko.ts                # 한국어
│   ├── data/
│   │   └── stations-fallback.ts # Embedded station data (fallback)
│   ├── utils/
│   │   ├── output.ts            # Output formatting
│   │   └── errors.ts            # Error definitions
│   └── types/
│       ├── api.ts               # API response types
│       ├── config.ts            # Config types
│       └── station.ts           # Station types
├── tests/
│   ├── lib/
│   │   ├── station-resolver.test.ts
│   │   ├── fuzzy.test.ts
│   │   ├── time-utils.test.ts
│   │   └── odata.test.ts
│   ├── commands/
│   │   ├── stations.test.ts
│   │   ├── timetable.test.ts
│   │   ├── fare.test.ts
│   │   ├── live.test.ts
│   │   ├── book.test.ts
│   │   ├── lines.test.ts
│   │   └── completion.test.ts
│   ├── services/
│   │   ├── api.test.ts
│   │   ├── auth.test.ts
│   │   └── cache.test.ts
│   ├── utils/
│   │   └── output.test.ts
│   ├── i18n/
│   │   └── translations.test.ts
│   ├── integration/
│   │   └── api-integration.test.ts
│   └── e2e/
│       └── cli.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts            # Vitest configuration
├── .env.example                # Environment template
├── .gitignore
├── PRD.md
└── README.md
```

---

## 10. Development Phases

### 10.0 TDD Strategy

每個開發階段採用 Test-Driven Development (TDD)，遵循 Red-Green-Refactor 循環：

```
┌─────────────────────────────────────────────────────────────┐
│ TDD Workflow per Feature                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. RED: 先寫測試（測試會失敗）                                │
│    - 定義預期輸入/輸出                                        │
│    - 寫測試案例（包含正常、邊界、錯誤情況）                    │
│    - 執行測試，確認失敗                                       │
│                                                             │
│ 2. GREEN: 實作最小程式碼讓測試通過                            │
│    - 只寫足夠讓測試通過的程式碼                               │
│    - 不要過度設計                                            │
│                                                             │
│ 3. REFACTOR: 重構（測試仍須通過）                             │
│    - 改善程式碼品質                                          │
│    - 消除重複                                                │
│    - 優化效能                                                │
└─────────────────────────────────────────────────────────────┘
```

**測試框架**：Vitest（與 Bun 相容，速度快）

**測試分類**：

| 類型 | 說明 | 位置 |
|------|------|------|
| Unit Tests | 純函式、模組邏輯 | `tests/lib/`, `tests/services/` |
| Integration Tests | API 整合、快取互動 | `tests/integration/` |
| E2E Tests | CLI 端對端測試 | `tests/e2e/` |

**測試命名慣例**：

```typescript
// tests/lib/station-resolver.test.ts
describe('StationResolver', () => {
  describe('resolveStation', () => {
    it('should return station by exact ID', () => {});
    it('should return station by exact name', () => {});
    it('should apply correction for typos', () => {});
    it('should handle 台/臺 variant', () => {});
    it('should resolve nickname to station ID', () => {});
    it('should find fuzzy match within distance 2', () => {});
    it('should return error with suggestions when not found', () => {});
  });
});
```

### Phase 1: Foundation (MVP) ⭐

**Tests First**:
- [x] Station resolver tests (`tests/lib/station-resolver.test.ts`)
  - [x] ID lookup tests
  - [x] Name correction tests
  - [x] Variant character tests (台/臺)
  - [x] Nickname resolution tests
  - [x] Fuzzy search tests (Levenshtein)
  - [x] Error response tests
- [x] Fuzzy search tests (`tests/lib/fuzzy.test.ts`)
- [x] Config service tests (`tests/services/config.test.ts`)
- [x] Auth service tests (`tests/services/auth.test.ts`)
- [ ] API client tests (`tests/services/api.test.ts`)
- [x] Cache service tests (`tests/services/cache.test.ts`)

**Implementation**:
- [x] PRD
- [x] Project setup (TypeScript, Commander, Bun, Vitest)
- [x] Station resolver module (from n8n workflow)
  - [ ] Embedded station data (220+ stations with coordinates)
  - [x] Name correction table
  - [x] Fuzzy search (Levenshtein)
- [x] Config management (`tra config`)
- [x] Auth service (OAuth2 token)
- [ ] Basic API client with error handling
- [ ] `tra stations` command
- [ ] `tra timetable daily` command
- [ ] `tra timetable train` command
- [x] Cache infrastructure

**Deliverable**: 可查詢車站、每日時刻表、車次時刻表（測試覆蓋率 >80%）

### Phase 2: Core Features

**Tests First**:
- [ ] Time utils tests (`tests/lib/time-utils.test.ts`)
  - [ ] `calculateRemainingMinutes` tests (normal, cross-midnight, delayed)
  - [ ] `formatRemainingTime` tests
  - [ ] `adjustTimeWithDelay` tests
  - [ ] `formatDelayStatus` tests
- [ ] OData builder tests (`tests/lib/odata.test.ts`)
- [ ] Fare command tests (`tests/commands/fare.test.ts`)
- [ ] Live command tests (`tests/commands/live.test.ts`)
- [ ] Book command tests (`tests/commands/book.test.ts`)

**Implementation**:
- [ ] `tra fare` command
- [ ] `tra live train` command
- [ ] `tra live delays` command
- [ ] `tra book` command (訂票連結生成)
- [ ] OData filter builder
- [ ] Timetable caching (5.5h TTL)

**Deliverable**: 完整的查詢與訂票功能，與 n8n workflow 功能對等（測試覆蓋率 >80%）

### Phase 3: Extended Features

**Tests First**:
- [ ] Station liveboard tests (`tests/commands/live-station.test.ts`)
- [ ] Station timetable tests (`tests/commands/timetable-station.test.ts`)
- [ ] Lines command tests (`tests/commands/lines.test.ts`)
- [ ] Output formatter tests (`tests/utils/output.test.ts`)
  - [ ] Table format tests
  - [ ] CSV format tests
  - [ ] JSON format tests

**Implementation**:
- [ ] `tra live station` command
- [ ] `tra timetable station` command
- [ ] `tra lines` commands
- [ ] Watch mode (`--watch`)
- [ ] Table output format

**Deliverable**: 完整 CLI 功能（測試覆蓋率 >80%）

### Phase 4: Polish & Distribution

**Tests First**:
- [ ] i18n tests (`tests/i18n/`)
  - [ ] All 4 languages translation completeness
  - [ ] Language fallback tests
  - [ ] Language detection tests
- [ ] Shell completion tests (`tests/commands/completion.test.ts`)
- [ ] E2E tests (`tests/e2e/`)
  - [ ] Full workflow tests
  - [ ] Offline mode tests
  - [ ] Error handling tests

**Implementation**:
- [ ] i18n support (zh-TW, en, ja, ko)
- [ ] Shell completion (`tra completion bash/zsh/fish`)
- [ ] Binary distribution (Bun compile)
- [ ] README & documentation
- [ ] npm publish

**Deliverable**: Production-ready multilingual CLI（總測試覆蓋率 >80%）

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Command response time (cached) | < 500ms |
| Command response time (API) | < 3s |
| Fuzzy search accuracy | > 95% first-match |
| Offline availability | 100% for stations, partial for timetable |
| Test coverage | > 80% |
| n8n workflow feature parity | 100% |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| TDX API rate limit | Service degradation | Aggressive caching, offline mode |
| API schema changes | Breaking changes | Version locking, graceful fallback |
| Token expiry mid-request | Request failure | Auto-refresh, retry logic |
| Station data outdated | Incorrect results | Periodic update check, `tra cache update` |

---

## 13. Open Questions

1. 是否需要支援 proxy 設定？

---

## Appendix A: Station Data Management

### 資料來源

車站資料從 TDX API 取得：
```
GET /v3/Rail/TRA/Station?$format=JSON
```

### 內嵌預設資料（Fallback）

```typescript
// src/data/stations-fallback.ts
// 作為離線 fallback，確保無網路時仍可使用基本功能

export const defaultStations: Station[] = [
  { id: "0900", name: "基隆", lat: 25.1319, lon: 121.73837 },
  { id: "1000", name: "臺北", lat: 25.04775, lon: 121.51711 },
  // ... 220+ stations (從 n8n workflow 提取)
];

export const defaultNicknames: Record<string, string> = {
  "北車": "1000",
  "南車": "4220",
  "高火": "4400",
};

export const defaultCorrections: Record<string, string> = {
  "瑞方": "瑞芳",
  "版橋": "板橋",
  "朝州": "潮州",
};
```

### 快取資料結構

```typescript
// ~/.cache/tdx-tra/stations.json
interface StationCache {
  version: string;           // 資料版本
  updatedAt: string;         // ISO 8601 時間戳
  source: string;            // "TDX API v3"
  stations: Station[];       // 車站列表
  nicknames: Record<string, string>;    // 暱稱對應
  corrections: Record<string, string>;  // 錯別字校正
}
```

### 更新邏輯

```typescript
// src/services/station-updater.ts
async function updateStationCache(): Promise<void> {
  // 1. 從 TDX API 取得最新車站資料
  const apiStations = await fetchStationsFromAPI();

  // 2. 合併內嵌的 nicknames 和 corrections
  const cache: StationCache = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    source: 'TDX API v3',
    stations: apiStations,
    nicknames: { ...defaultNicknames },      // 可擴充
    corrections: { ...defaultCorrections },  // 可擴充
  };

  // 3. 寫入快取檔案
  await writeCache('stations.json', cache);
}
```

## Appendix B: n8n Workflow API Mapping

| n8n Node | API Endpoint | CLI Command |
|----------|--------------|-------------|
| Get DailyTrainTimetable Today | `v3/.../DailyTrainTimetable/OD/{from}/to/{to}/{date}` | `tra timetable daily --from --to` |
| Get DailyTrainTimetable in Range | 同上 + `$filter` | `tra timetable daily --from --to --time` |
| Get DailyTrainTimetable by TrainNo | `v3/.../GeneralTrainTimetable/TrainNo/{no}` | `tra timetable train` |
| Get TrainLiveBoard by TrainNo | `v3/.../TrainLiveBoard/TrainNo/{no}` | `tra live train` |
| Get LiveTrainDelays | `v2/.../LiveTrainDelay` + `$filter` | `tra live delays --trains` |
| Get ODFare | `v3/.../ODFare/{from}/to/{to}` | `tra fare --from --to` |
| (New) Booking Deeplink | `/booking/deeplink/web/tra` | `tra book` |
| (New) Booking Deeplink APP | `/booking/deeplink/direct/tra` | `tra book --app` |

## Appendix C: Time Calculation Module

從 n8n workflow 提取的時間計算邏輯：

### 計算剩餘時間

```typescript
// src/lib/time-utils.ts

/**
 * 計算到發車的剩餘時間（分鐘）
 * @param departureTime 發車時間 "HH:MM"
 * @param delayTime 延誤分鐘數
 * @returns 剩餘分鐘數
 */
export function calculateRemainingMinutes(
  departureTime: string,
  delayTime: number = 0
): number {
  // 獲取當前台灣時間（+8時區）
  const now = new Date();
  const taiwanTime = new Date(
    now.getTime() + (8 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60 * 1000)
  );

  // 解析發車時間
  const [hours, minutes] = departureTime.split(':').map(Number);
  const departureDate = new Date(taiwanTime);
  departureDate.setHours(hours, minutes, 0, 0);

  // 加上延誤時間
  departureDate.setMinutes(departureDate.getMinutes() + delayTime);

  // 計算剩餘分鐘
  const remainingMs = departureDate.getTime() - taiwanTime.getTime();
  let remainingMinutes = Math.floor(remainingMs / 60000);

  // 處理跨日問題
  if (remainingMinutes < 0) {
    const hoursFromMidnight = taiwanTime.getHours() * 60 + taiwanTime.getMinutes();
    const trainTimeInMinutes = hours * 60 + minutes;

    // 20:00後且列車在4:00前 → 隔天的車
    if (hoursFromMidnight > 1200 && trainTimeInMinutes < 240) {
      remainingMinutes += 24 * 60;
    } else if (Math.abs(remainingMinutes) < 30) {
      remainingMinutes = 0; // 即將發車
    }
  }

  return remainingMinutes;
}

/**
 * 格式化剩餘時間為人類可讀格式
 */
export function formatRemainingTime(minutes: number): string {
  if (minutes < 0) return '已發車';
  if (minutes === 0) return '即將發車';
  if (minutes < 60) return `${minutes}分鐘後`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h${mins}m` : `${hours}小時後`;
}

/**
 * 根據延誤調整時間
 */
export function adjustTimeWithDelay(
  timeString: string,
  delayMinutes: number
): string {
  if (!delayMinutes || delayMinutes <= 0) return timeString;

  const [hours, minutes] = timeString.split(':').map(Number);
  let totalMinutes = hours * 60 + minutes + delayMinutes;

  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;

  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}

/**
 * 格式化延誤狀態
 */
export function formatDelayStatus(
  delayTime: number | undefined,
  hasDelayInfo: boolean
): string {
  if (!hasDelayInfo) return '時刻表';
  if (delayTime === undefined || delayTime === null) return '時刻表';
  if (delayTime === 0) return '準時';
  return `晚${delayTime}分`;
}
```

### 使用範例

```typescript
const train = {
  departureTime: '08:30',
  arrivalTime: '12:45',
  delayTime: 5
};

const remaining = calculateRemainingMinutes(train.departureTime, train.delayTime);
// → 15 (分鐘)

const text = formatRemainingTime(remaining);
// → "15分鐘後"

const adjustedArrival = adjustTimeWithDelay(train.arrivalTime, train.delayTime);
// → "12:50"

const status = formatDelayStatus(train.delayTime, true);
// → "晚5分"
```

## Appendix D: TDX API Reference

- TRA 資料 API Swagger: https://tdx.transportdata.tw/webapi/File/Swagger/V3/5fa88b0c-120b-43f1-b188-c379ddb2593d
- TRA 訂票 API Swagger: https://tdx.transportdata.tw/webapi/File/Swagger/V3/ad884f5e-4692-4600-8662-12abf40e5946
- TDX Portal: https://tdx.transportdata.tw/
