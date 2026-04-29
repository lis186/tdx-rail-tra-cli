# PRD: tdx-tra CLI

> Taiwan Railway (TRA) CLI tool powered by TDX API
> Version: 1.0
> Date: 2025-12-26
> Status: Phase 8 Complete (UX Optimization) | 表格對齊 + 車種名稱簡化 + 車站出口資訊 + MAAS Deeplink

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

1. **AI-First**: JSON 預設輸出，TOON 格式（節省 ~75% tokens），結構化錯誤，完整 `--help`
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
- Binary: 使用 Bun 編譯獨立執行檔
  ```bash
  # 當前平台
  npm run build:binary

  # 所有平台
  npm run build:binary:all
  # 輸出: dist/tra-{platform}-{arch}
  # - tra-macos-arm64, tra-macos-x64
  # - tra-linux-arm64, tra-linux-x64
  # - tra-windows-x64.exe
  ```

---

## 3. API Integration

### 3.1 TDX API Base

- **Base URL**: `https://tdx.transportdata.tw/api/basic`
- **Auth Endpoint**: `https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token`
- **Auth Method**: OAuth2 Client Credentials Flow

### 3.2 TDX API 限制與合規

| 限制項目 | 規定 | CLI 對應措施 |
|----------|------|--------------|
| Token 有效期 | 86400 秒 (1 天) | Token 快取 + 提前 60 秒刷新 |
| Rate Limit | 5 req/s per API Key (銅級會員) | Rate Limiter (Token Bucket) |
| TLS 版本 | 1.2+ | Node.js 預設支援 |
| API Key 數量 | 最多 3 組/帳號 | 由使用者管理 |

#### 3.2.1 Rate Limiting 機制

採用 **Token Bucket** 演算法實作 Rate Limiting：

```typescript
// src/services/rate-limiter.ts

interface RateLimiterConfig {
  maxTokens: number;      // 最大令牌數（預設 5，銅級會員限制）
  refillRate: number;     // 每秒補充令牌數（預設 5）
  retryAfterMs: number;   // 等待後重試間隔（預設 200ms）
  maxRetries: number;     // 最大重試次數（預設 5）
}

class RateLimiter {
  /**
   * 請求令牌，若令牌不足則等待
   * @returns Promise<void> 取得令牌後 resolve
   * @throws RateLimitError 超過最大重試次數
   */
  async acquire(): Promise<void>;

  /**
   * 嘗試取得令牌（非阻塞）
   * @returns boolean 是否成功取得
   */
  tryAcquire(): boolean;

  /**
   * 重置令牌桶
   */
  reset(): void;
}
```

**行為說明**：

1. **正常情況**：令牌充足時，請求立即執行
2. **接近限制**：令牌不足時，自動等待令牌補充後重試
3. **超過限制**：重試次數超過上限時，拋出 `RateLimitError`

**錯誤處理**：

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "API 請求過於頻繁，請稍後再試",
    "retryAfter": 1000
  }
}
```

#### 3.2.2 Retry 機制

採用 **Exponential Backoff** 處理暫時性錯誤：

```typescript
// src/services/retry.ts

interface RetryConfig {
  maxRetries: number;           // 最大重試次數（預設 3）
  baseDelayMs: number;          // 基礎延遲（預設 1000ms）
  maxDelayMs: number;           // 最大延遲（預設 10000ms）
  retryableStatuses: number[];  // 可重試的 HTTP 狀態碼
}

// 可重試的狀態碼
const RETRYABLE_STATUSES = [
  408,  // Request Timeout
  429,  // Too Many Requests
  500,  // Internal Server Error
  502,  // Bad Gateway
  503,  // Service Unavailable
  504,  // Gateway Timeout
];
```

**Backoff 計算**：

```
delay = min(baseDelay * 2^attempt + jitter, maxDelay)
jitter = random(0, baseDelay * 0.1)
```

**範例**：

| 嘗試次數 | 延遲時間 |
|----------|----------|
| 1 | ~1000ms |
| 2 | ~2000ms |
| 3 | ~4000ms |

#### 3.2.3 Multi-API Key 支援 ✅

> **狀態**: ✅ 實作完成
> **目標**: 支援多組 API Key 輪詢，線性提升服務量
> **測試**: 63 個測試通過（api-key-slot: 20, api-key-pool: 20, config-multikey: 11, integration: 12）

**背景**：
- TDX 銅級會員限制：5 req/s per API Key
- 單一 Key 在高並發場景（如 `journey` 命令）可能產生等待
- 多組 Key 可線性提升容量：N 組 = N × 5 req/s

##### 架構設計

```
┌─────────────────────────────────────────────────────────────────┐
│                        ApiKeyPool                                │
│  - 管理 N 個 ApiKeySlot（最多 10 組）                             │
│  - 智慧選擇：挑選「可用 Token 最多」的 Slot                        │
│  - 故障隔離：暫時停用失敗的 Slot                                   │
└─────────────────────────────────────────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│ ApiKeySlot  │         │ ApiKeySlot  │         │ ApiKeySlot  │
│     #1      │         │     #2      │         │    #N       │
├─────────────┤         ├─────────────┤         ├─────────────┤
│ AuthService │         │ AuthService │         │ AuthService │
│ RateLimiter │         │ RateLimiter │         │ RateLimiter │
│ status      │         │ status      │         │ status      │
└─────────────┘         └─────────────┘         └─────────────┘
```

##### 核心模組

| 模組 | 類型 | 職責 |
|------|------|------|
| `src/types/api-key.ts` | 新增 | 型別定義 |
| `src/services/api-key-slot.ts` | 新增 | 封裝單一 Key（獨立 Auth + RateLimiter） |
| `src/services/api-key-pool.ts` | 新增 | 管理多個 Slot，智慧選擇 |
| `src/services/config.ts` | 修改 | 新增 `getApiKeys()` 方法 |
| `src/services/api.ts` | 修改 | 使用 Pool 取代單一實例 |

##### 配置格式（.env）

```bash
# 主要 Key（向後相容，現有用戶無需修改）
TDX_CLIENT_ID=primary_id
TDX_CLIENT_SECRET=primary_secret

# 額外 Key（編號從 2 開始，最多到 10）
TDX_CLIENT_ID_2=secondary_id
TDX_CLIENT_SECRET_2=secondary_secret

TDX_CLIENT_ID_3=backup_id
TDX_CLIENT_SECRET_3=backup_secret

# 可選：標籤（用於日誌識別）
TDX_KEY_LABEL=primary
TDX_KEY_LABEL_2=secondary
TDX_KEY_LABEL_3=backup
```

##### 容量對照

| Key 數量 | 總容量 | 適用場景 |
|---------|--------|---------|
| 1 | 5 req/s | 個人使用（預設） |
| 2 | 10 req/s | 一般使用 |
| 3 | 15 req/s | 頻繁查詢 |
| 5 | 25 req/s | 小型服務 |
| 10 | 50 req/s | 生產環境 |

##### Slot 選擇演算法

```typescript
getSlot(): ApiKeySlot {
  // 1. 過濾可用 Slots（ACTIVE 或過了冷卻期）
  const available = this.slots.filter(s => s.isAvailable());

  if (available.length === 0) {
    throw new NoAvailableSlotsError('所有 API Key 都已停用');
  }

  // 2. 按可用 Token 排序（降序）
  available.sort((a, b) =>
    b.getAvailableTokens() - a.getAvailableTokens()
  );

  // 3. 返回 Token 最多的 Slot
  return available[0];
}
```

##### 故障隔離狀態機

```
              成功
     ┌─────────────────┐
     ▼                 │
┌─────────┐  連續3次失敗  ┌──────────┐  30秒後  ┌──────────┐
│ ACTIVE  │────────────▶│ DISABLED │────────▶│ COOLDOWN │
└─────────┘              └──────────┘          └────┬─────┘
     ▲                                              │
     │                    測試成功                   │
     └──────────────────────────────────────────────┘
```

##### 實作優先級

| Phase | 項目 | 優先級 |
|-------|------|-------|
| 1 | Types + ApiKeySlot + ApiKeyPool + 單元測試 | 🔴 高 |
| 2 | Config 修改 + API Client 整合 + 整合測試 | 🔴 高 |
| 3 | 文件更新 + .env.example + Health 命令增強 | 🟡 中 |
| 4 | 管理命令 + 加權選擇 + 自訂限流 | 🟢 低 |

##### 向後相容保證

- ✅ 單一 Key 配置完全相容（Pool 自動建立 1 個 Slot）
- ✅ `getApiClient()` 介面不變
- ✅ `RateLimitError` 錯誤類型不變
- ✅ 現有 `.env` 無需修改

### 3.3 Endpoints（基於 n8n Workflow 分析）

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
| `/api/maas/routing` | v3 | MAAS 旅運規劃（取得 UUID） | `tra book --deeplink` |
| `/api/maas-tra/booking/deeplink/url/tra` | v3 | MAAS Deeplink URL（UUID 換連結） | `tra book --deeplink` |

#### 擴充 API（Phase 2+）

| Endpoint | Version | 說明 | CLI Command |
|----------|---------|------|-------------|
| `Rail/TRA/Station` | v3 | 車站資料 | `tra stations list` |
| `Rail/TRA/StationExit` | v3 | 車站出口資訊 | `tra stations exits` |
| `Rail/TRA/Line` | v3 | 路線資料 | `tra lines list` |
| `Rail/TRA/StationOfLine` | v3 | 路線車站 | `tra lines stations` |
| `Rail/TRA/TrainType` | v3 | 車種資料 | `tra train-types` |
| `Rail/TRA/DailyStationTimetable` | v3 | 車站每日時刻表 | `tra timetable station` |
| `Rail/TRA/StationLiveBoard` | v3 | 車站即時看板 | `tra live station` |
| `Rail/TRA/LineTransfer` | v3 | 路線轉乘資訊 | (internal: journey planner) |
| `Rail/TRA/Alert` | v3 | 阻通資訊 | `tra alerts` |
| `Rail/TRA/News` | v3 | 營運公告 | (備用) |

### 3.4 OData 查詢模式

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
tra timetable daily <from> <to> [options]

# Options:
--date, -d <YYYY-MM-DD>            # 日期（預設今天）
--depart-after <HH:MM>             # 出發時間不早於
--depart-before <HH:MM>            # 出發時間不晚於
--arrive-by <HH:MM>                # 抵達時間不晚於（更口語）
--type, -t <types>                 # 篩選車種（逗號分隔，見車種代碼表）
--exclude-type <types>             # 排除車種
--tpass                            # 僅顯示 TPASS 適用車種
--bike                             # 僅顯示可攜帶自行車班次
--wheelchair                       # 僅顯示有輪椅服務班次
--sort <field>                     # 排序：departure|arrival|duration|fare
--limit <number>                   # 顯示班次數量（預設 20）
--no-cache                         # 跳過快取

# 車次時刻表（對應 GeneralTrainTimetable/TrainNo）
tra timetable train <train-no>

# 車站時刻表（對應 DailyStationTimetable）
tra timetable station <station> [options]
--date, -d <YYYY-MM-DD>            # 日期（預設今天）
--direction <0|1>                  # 方向：0=順行 1=逆行
--depart-after <HH:MM>             # 出發時間不早於
--depart-before <HH:MM>            # 出發時間不晚於
--type, -t <types>                 # 篩選車種
--exclude-type <types>             # 排除車種
--bike                             # 僅顯示可攜帶自行車班次
--wheelchair                       # 僅顯示有輪椅服務班次
--sort <field>                     # 排序：departure|duration|fare
--limit <number>                   # 顯示班次數量（預設 30）
```

**範例**：

```bash
# 查詢台北到高雄今天的班次
tra timetable daily 台北 高雄

# 查詢明天 08:00~12:00 出發的班次
tra timetable daily 台北 高雄 -d 2025-12-26 --depart-after 08:00 --depart-before 12:00

# 查詢下午 4 點前抵達的班次
tra timetable daily 台北 高雄 --arrive-by 16:00

# 只查自強號和莒光號
tra timetable daily 台北 高雄 --type 自強,莒光

# 排除普悠瑪和太魯閣
tra timetable daily 台北 高雄 --exclude-type 普悠瑪,太魯閣

# 查詢可攜帶自行車的班次
tra timetable daily 台北 高雄 --bike

# 查詢有輪椅服務的班次
tra timetable daily 台北 高雄 --wheelchair

# 按票價排序（最便宜優先）
tra timetable daily 台北 高雄 --sort fare

# 按行車時間排序（最快優先）
tra timetable daily 台北 高雄 --sort duration

# 組合篩選：TPASS 可用 + 可攜自行車 + 早上出發
tra timetable daily 台北 桃園 --tpass --bike --depart-after 08:00 --depart-before 12:00

# 包含票價資訊
tra timetable daily 台北 高雄 --with-fare

# 包含即時資訊（延誤、月臺）
tra timetable daily 松山 板橋 --depart-after now --with-live

# 完整查詢：特定時間 + 車種 + 服務 + 票價
tra timetable daily 台北 高雄 --depart-after 08:00 --type 自強 --wheelchair --with-fare

# TPASS + 即時動態：接下來三班可搭列車（含剩餘時間）
tra timetable daily 松山 板橋 --tpass --depart-after now --limit 3 --with-live

# 查詢 123 車次時刻
tra timetable train 123

# 查詢台北站北上班次
tra timetable station 台北 --direction 1
```

**車種代碼表**：

| 代碼 | 名稱 | 別名 | TPASS | 說明 |
|------|------|------|-------|------|
| 1 | 太魯閣 | taroko, tze | ❌ | 傾斜式列車 |
| 2 | 普悠瑪 | puyuma, pyu | ❌ | 傾斜式列車 |
| 3 | 自強(3000) | emu3000, e3k | ❌ | EMU3000 新自強號 |
| 4 | 自強 | tzeChiang, tc | ✅ | 一般自強號 |
| 5 | 莒光 | chuKuang, ck | ✅ | 莒光號 |
| 6 | 復興 | fuHsing, fh | ✅ | 復興號 |
| 7 | 區間快 | localExpress, le | ✅ | 區間快車 |
| 8 | 區間 | local, loc | ✅ | 區間車 |

**車種篩選範例**：

```bash
# 使用中文名稱
tra timetable daily 台北 高雄 --type 自強,莒光

# 使用英文別名
tra timetable daily 台北 高雄 --type tc,ck

# 使用代碼
tra timetable daily 台北 高雄 --type 4,5

# 排除特定車種（使用 ! 前綴）
tra timetable daily 台北 高雄 --type !太魯閣,!普悠瑪

# 簡寫：只要自強號系列
tra timetable daily 台北 高雄 --type 自強*
```

**篩選機制**：

```
┌─────────────────────────────────────────────────────────────┐
│ 1. API Request                                               │
│    GET /DailyTrainTimetable/OD/{from}/to/{to}/{date}        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Client-side Filter Chain                                  │
│                                                              │
│    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐      │
│    │ Time Filter │ → │ Type Filter │ → │ Bike Filter │      │
│    │ depart/arr  │   │ --type/tpass│   │ BikeFlag=1  │      │
│    └─────────────┘   └─────────────┘   └─────────────┘      │
│                                                              │
│    篩選條件之間為 AND 關係                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Sort & Limit                                              │
│    按出發時間排序 → 取前 N 筆                                 │
└─────────────────────────────────────────────────────────────┘
```

**TPASS 篩選邏輯**：

使用 `--tpass` 時，CLI 會：
1. 檢查起訖站是否在同一 TPASS 生活圈
2. 若跨區，顯示警告並返回空結果
3. 若同區，篩選適用車種（排除 EMU3000、普悠瑪、太魯閣等）

**自行車篩選邏輯**：

使用 `--bike` 時，CLI 會：
1. 篩選 `BikeFlag = 1` 的班次
2. 在輸出中標示 🚲 圖示

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
--deeplink                         # 使用 MAAS Deeplink 流程（需 MAAS 權限）
--time <HH:MM>                     # 出發時間（用於 --deeplink 模式，預設 08:00）
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

# 使用 MAAS Deeplink 流程（可直接開啟台鐵 e 訂通 APP）
tra book --train 123 --from 台北 --to 高雄 --date 2025-12-26 --deeplink --time 08:00
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
    "quantity": 1,
    "apiUsed": true
  }
}
```

**MAAS Deeplink 輸出**（使用 `--deeplink`）：

```json
{
  "success": true,
  "data": {
    "url": "traETicket://booking?token=xxx...",
    "type": "deeplink",
    "trainNo": "123",
    "origin": "臺北",
    "destination": "高雄",
    "date": "2025-12-26",
    "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "expiresAt": "2025-12-26 08:03:00",
    "expiresIn": 180,
    "apiUsed": true
  }
}
```

**MAAS Deeplink 流程說明**：

1. 呼叫旅運規劃 API（`/api/maas/routing`）取得路線方案與 UUID
2. 用 UUID 換取 Deeplink URL（`/api/maas-tra/booking/deeplink/url/tra`）
3. 回傳可直接開啟台鐵 e 訂通 APP 的連結（有效期 3 分鐘）

> ⚠️ **注意**：MAAS Deeplink 需要額外申請「城際運輸票務整合功能模組」權限。若 API 失敗會自動 fallback 到基本網頁連結。

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

#### `tra tpass` - TPASS 月票查詢 ⭐

```bash
# 檢查起訖站 TPASS 適用性
tra tpass check <from> <to>

# 列出生活圈及其車站
tra tpass regions                  # 列出所有生活圈
tra tpass stations <region>        # 列出指定生活圈的車站

# Options:
--format json|table|toon           # 輸出格式 (toon 節省 ~75% tokens)
```

**範例**：

```bash
# 檢查台北到桃園是否可用 TPASS
$ tra tpass check 台北 桃園
{
  "eligible": true,
  "region": "基北北桃",
  "price": 1200,
  "trainTypes": ["區間", "區間快", "莒光", "復興", "PP自強"]
}

# 檢查跨區路線
$ tra tpass check 台北 新竹
{
  "eligible": false,
  "reason": "跨生活圈",
  "from": { "station": "臺北", "regions": ["基北北桃"] },
  "to": { "station": "新竹", "regions": ["桃竹竹苗"] }
}

# 列出基北北桃生活圈車站
$ tra tpass stations 基北北桃
```

**TPASS 生活圈**：

| 生活圈 | 票價 | 涵蓋區域 |
|--------|------|---------|
| 基北北桃 | $1,200 | 基隆、台北、新北、桃園 |
| 桃竹竹苗 | $1,200 | 桃園、新竹縣市、苗栗 |
| 中彰投苗 | $699~999 | 台中、彰化、南投、苗栗 |
| 雲林 | $199~399 | 雲林（可擴及彰化、嘉義部分） |
| 嘉義 | $399 | 大林～南靖 |
| 南高屏 | $399~999 | 台南、高雄、屏東 |
| 北宜 | $750~1,800 | 基北北 + 宜蘭 + 和平 |
| 花蓮 | $199~399 | 花蓮縣 |
| 臺東 | $299 | 臺東縣 |

**不適用 TPASS 車種**：
- EMU3000 型自強號（車名含 3000、EMU3000）
- 普悠瑪
- 太魯閣
- 觀光列車（藍皮解憂號、鳴日號等）
- 團體列車
- 商務專開列車

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

**基本時刻表輸出**（`tra timetable daily 台北 高雄 --limit 3 -f table`）：

```
臺北 → 高雄 (2025-12-28)

車次    車種    出發   抵達   時間      服務
────────────────────────────────────────────────
161     新自強  06:00  10:28  4h28m     ♿
1       商務    06:22  11:17  4h55m     -
103     自強    06:27  11:36  5h9m      ♿

共 3 班次
```

**含即時資訊**（`tra timetable daily 松山 板橋 --depart-after now --with-live --limit 3 -f table`）：

```
松山 → 板橋 (2025-12-28)

目前時間：21:13

剩餘      車次    車種    預定   延誤    實際   服務
──────────────────────────────────────────────────────
即將發車  235     普悠瑪  21:13  準時    21:13  ♿
11 分     439     新自強  21:20  +4分    21:24  ♿
13 分     1267    區間    21:26  準時    21:26  🚲

共 3 班次
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
- [x] TPASS module tests (`tests/lib/tpass.test.ts`)
  - [x] Train type eligibility tests
  - [x] Station region lookup tests
  - [x] Cross-region detection tests
  - [x] Region query tests
- [x] Config service tests (`tests/services/config.test.ts`)
- [x] Auth service tests (`tests/services/auth.test.ts`)
- [x] API client tests (`tests/services/api.test.ts`)
- [x] Cache service tests (`tests/services/cache.test.ts`)

**Implementation**:
- [x] PRD
- [x] Project setup (TypeScript, Commander, Bun, Vitest)
- [x] Station resolver module (from n8n workflow)
  - [x] Embedded station data (220+ stations with coordinates)
  - [x] Name correction table
  - [x] Fuzzy search (Levenshtein)
- [x] Config management (`tra config`)
- [x] Auth service (OAuth2 token)
- [x] Basic API client with error handling
- [x] `tra stations` command
- [x] `tra timetable daily` command
- [x] `tra timetable train` command
- [x] `tra tpass` command (TPASS 月票查詢)
  - [x] `tra tpass check` - 檢查起訖站適用性
  - [x] `tra tpass regions` - 列出生活圈
  - [x] `tra tpass stations` - 列出生活圈車站
  - [x] `--tpass` option for timetable filtering
- [x] Cache infrastructure

**Deliverable**: 可查詢車站、每日時刻表、車次時刻表、TPASS 適用性（測試覆蓋率 >80%）

### Phase 2: Core Features

**Tests First**:
- [x] Time utils tests (`tests/lib/time-utils.test.ts`) - 48 tests
  - [x] `calculateRemainingMinutes` tests (normal, cross-midnight, delayed)
  - [x] `formatRemainingTime` tests
  - [x] `adjustTimeWithDelay` tests
  - [x] `formatDelayStatus` tests
- [x] OData builder tests (`tests/lib/odata.test.ts`) - 36 tests
- [x] Fare command tests (`tests/commands/fare.test.ts`)
- [x] Live command tests (`tests/commands/live.test.ts`)
- [x] Book command tests (`tests/commands/book.test.ts`)

**Implementation**:
- [x] `tra fare` command
- [x] `tra live train` command
- [x] `tra live delays` command
- [x] `tra book` command (訂票連結生成)
- [x] OData filter builder (`src/lib/odata.ts`)
- [x] Time utils module (`src/lib/time-utils.ts`)
- [x] Timetable caching (4h TTL)

**Deliverable**: 完整的查詢與訂票功能，與 n8n workflow 功能對等（測試覆蓋率 >80%）

### Phase 3: Extended Features

**Tests First**:
- [x] Station liveboard tests (`tests/commands/live-station.test.ts`) - 6 tests
- [x] Station timetable tests (`tests/commands/timetable-station.test.ts`) - 6 tests
- [x] Lines command tests (`tests/commands/lines.test.ts`) - 11 tests
- [x] Output formatter tests (`tests/utils/output.test.ts`) - 32 tests
  - [x] Table format tests
  - [x] CSV format tests
  - [x] JSON format tests

**Implementation**:
- [x] `tra live station` command
- [x] `tra timetable station` command
- [x] `tra lines` commands (list, get, stations)
- [x] Table output format (`src/utils/output.ts`)
- [x] Watch mode (`--watch`) - `src/utils/watch.ts`

**Deliverable**: 完整 CLI 功能（測試覆蓋率 >80%）

### Phase 4: Polish & Distribution

**Tests First**:
- [x] i18n tests (`tests/i18n/`) - 136 tests
  - [x] All 4 languages translation completeness
  - [x] Language fallback tests
  - [x] Language detection tests
- [x] Shell completion tests (`tests/commands/completion.test.ts`) - 4 tests
- [x] E2E tests (`tests/e2e/`) - 79 tests
  - [x] Full workflow tests (`tests/e2e/workflow.test.ts`)
  - [x] Error handling tests (`tests/e2e/error-handling.test.ts`)
  - [x] CLI behavior tests (`tests/cli/behavior.test.ts`)
- [x] Rate Limiting tests (`tests/services/rate-limiter.test.ts`) - 24 tests
  - [x] Token bucket algorithm tests
  - [x] Acquire/tryAcquire behavior tests
  - [x] Concurrent request handling tests
  - [x] Rate limit exceeded error tests
- [x] Retry mechanism tests (`tests/services/retry.test.ts`) - 42 tests
  - [x] Exponential backoff calculation tests
  - [x] Retryable status code tests
  - [x] Max retry limit tests
  - [x] Jitter tests

**Implementation**:
- [x] i18n support (zh-TW, en, ja, ko) - `src/i18n/`
- [x] Shell completion (`tra completion bash/zsh/fish`) - `src/commands/completion.ts`
- [x] Binary distribution (Bun compile) - `npm run build:binary:all`
- [x] QA test suite - `tests/helpers/cli-runner.ts`
- [x] Rate Limiting - `src/services/rate-limiter.ts`
  - [x] Token Bucket algorithm (5 req/s for Bronze tier)
  - [x] Blocking acquire with retry
  - [x] Non-blocking tryAcquire
- [x] Retry mechanism - `src/services/retry.ts`
  - [x] Exponential backoff with jitter
  - [x] Configurable retryable status codes
  - [x] Integration with API client
- [x] README & documentation
- [x] npm publish preparation (LICENSE, package.json fields)

**Deliverable**: Production-ready multilingual CLI（總測試覆蓋率 >80%）

### Phase 5: Advanced Filtering

**目標使用者情境**:

| 使用者 | 情境 | 需要的篩選 |
|--------|------|-----------|
| AI Agent | 「幫我找 8-10 點台北到高雄的自強號」 | 時間範圍 + 車種 |
| AI Agent | 「我 3 點要到台中，要搭幾點的車？」 | 抵達時間 |
| 單車族 | 「帶腳踏車去花蓮，3 點前到」 | 自行車 + 抵達時間 |
| 長途旅客 | 「帶阿嬤去台東，要有輪椅服務」 | 無障礙 |
| 省錢族 | 「最便宜的車是哪班？」 | 票價排序 |
| 趕時間族 | 「最快到達的車？」 | 行車時間排序 |

**新增 Options**:

```bash
# 時間篩選
--depart-after HH:MM      # 出發不早於
--depart-before HH:MM     # 出發不晚於
--arrive-by HH:MM         # 抵達不晚於（語意更口語）

# 車種篩選
--type, -t <types>        # 包含車種（中文/英文/代碼）
--exclude-type <types>    # 排除車種

# 服務篩選
--bike                    # 可攜自行車 (BikeFlag=1)
--wheelchair              # 輪椅服務 (WheelChairFlag=1)

# 排序
--sort <field>            # departure|arrival|duration|fare
```

**排序選項說明**:

| `--sort` | 說明 | 情境 |
|----------|------|------|
| `departure` | 按出發時間（預設） | 一般查詢 |
| `arrival` | 按抵達時間 | 趕時間 |
| `duration` | 按行車時間 | 找最快 |
| `fare` | 按票價（車種排序） | 找最便宜 |

**票價排序邏輯**（同起訖站，不同車種）:
```
區間 < 區間快 < 復興 < 莒光 < 自強 < 普悠瑪/太魯閣/EMU3000
```

**Tests First**:
- [x] Train type filter tests (`tests/lib/train-filter.test.ts`)
  - [x] Filter by Chinese name (自強, 莒光)
  - [x] Filter by English alias (tc, ck)
  - [x] Filter by code (4, 5)
  - [x] Exclusion filter (--exclude-type)
  - [x] Wildcard filter (自強*)
  - [x] Fare ranking for sorting
- [x] Time range filter tests
  - [x] departAfter filter
  - [x] departBefore filter
  - [x] arriveBy filter
  - [x] Combined time filters
- [x] Service filter tests
  - [x] BikeFlag filtering
  - [x] WheelChairFlag filtering
  - [x] Display icons in output (🚲, ♿)
- [x] Sort tests
  - [x] Sort by departure time
  - [x] Sort by arrival time
  - [x] Sort by duration
  - [x] Sort by fare (train type ranking)
- [x] Timetable filter integration tests
  - [x] Multiple filters combined (AND logic)
  - [x] Filter with TPASS
  - [x] Filter with sort
  - [x] Filter with limit

**Implementation**:
- [x] Train filter module (`src/lib/train-filter.ts`)
  - [x] Train type code mapping with fare ranking
  - [x] Alias resolution (中文/英文/代碼)
  - [x] Exclusion support (--exclude-type)
  - [x] Time range filtering
  - [x] Service filtering (bike, wheelchair)
  - [x] Sorting utilities
- [x] Command options update (`src/commands/timetable.ts`)
  - [x] `--depart-after`, `--depart-before`, `--arrive-by`
  - [x] `--type`, `--exclude-type`
  - [x] `--bike`, `--wheelchair`
  - [x] `--sort`
  - [x] `--with-fare` (含票價查詢)
  - [x] `--with-live` (含即時延誤資訊，支援 `--depart-after now`)
- [x] Filter chain implementation
  - [x] Composable filter functions
  - [x] AND logic between filters

**Deliverable**: 進階篩選功能，支援時間範圍、車種、服務設施、多種排序

### Phase 6: Journey Planner (轉乘規劃)

**目標**: 支援無直達車路線的轉乘規劃

**使用情境**:

| 情境 | 範例 | 需求 |
|------|------|------|
| 無直達車 | 基隆 → 屏東 | 需要在高雄轉車 |
| 最少轉乘 | 花蓮 → 嘉義 | 直達 vs 1轉 vs 2轉 |
| 最短時間 | 台東 → 台北 | 考慮轉乘等待時間 |

**新增指令**:

```bash
# 行程規劃（含轉乘）
tra journey <from> <to> [options]

# Options:
--date, -d <YYYY-MM-DD>   # 日期
--depart-after HH:MM      # 出發不早於
--arrive-by HH:MM         # 抵達不晚於
--max-transfers <n>       # 最多轉乘次數（預設 2）
--min-transfer-time <min> # 最少轉乘時間（預設 10 分鐘）
--sort transfers|duration|fare  # 排序方式
```

**輸出範例**:

```json
{
  "success": true,
  "data": {
    "journeys": [
      {
        "type": "direct",
        "transfers": 0,
        "totalDuration": "4h30m",
        "segments": [
          { "trainNo": "123", "from": "基隆", "to": "高雄", ... }
        ]
      },
      {
        "type": "transfer",
        "transfers": 1,
        "totalDuration": "5h15m",
        "transferStation": "台北",
        "segments": [
          { "trainNo": "456", "from": "基隆", "to": "台北", ... },
          { "waitTime": "20m" },
          { "trainNo": "789", "from": "台北", "to": "高雄", ... }
        ]
      }
    ]
  }
}
```

**演算法**:

```
┌─────────────────────────────────────────────────────────────┐
│ Journey Planner Algorithm                                    │
├─────────────────────────────────────────────────────────────┤
│ 1. 查詢直達車 (DailyTrainTimetable/OD)                       │
│                                                              │
│ 2. 若無直達或需要更多選項：                                   │
│    a. 定義主要轉乘站（台北、台中、高雄、花蓮...）             │
│    b. 查詢 Origin → TransferStation                         │
│    c. 查詢 TransferStation → Destination                    │
│    d. 計算有效轉乘組合（轉乘時間 >= minTransferTime）         │
│                                                              │
│ 3. 合併所有方案，按指定方式排序                               │
│                                                              │
│ 4. 返回前 N 個最佳方案                                       │
└─────────────────────────────────────────────────────────────┘
```

**Tests First**:
- [x] Journey planner algorithm tests
- [x] Transfer station detection tests
- [x] Transfer time calculation tests
- [x] Multi-segment journey sorting tests

**Implementation**:
- [x] `tra journey` command
- [x] Journey planner service (`src/lib/journey-planner.ts`)
- [x] Transfer station data (18 major stations)
- [x] Transfer time calculation

**Deliverable**: 轉乘規劃功能，自動計算最佳轉乘方案 ✅

---

#### Journey Planner 優化方案（使用 LineTransfer API）

基於 TDX LineTransfer API 分析，以下為未來優化方向：

**API 資料範例**：
```json
{
  "LineID": "TRA-PingxiLine",
  "LineName": { "Zh_tw": "平溪線", "En": "Pingxi Line" },
  "FromStationID": "1920",
  "FromStationName": { "Zh_tw": "瑞芳", "En": "Ruifang" },
  "ToStationID": "7390",
  "ToStationName": { "Zh_tw": "三貂嶺", "En": "Sandiaoling" },
  "TransferDescription": { "Zh_tw": "經由第一月臺轉乘", "En": "Transfer via Platform 1" },
  "MinTransferTime": 3
}
```

**優化方案**：

| 優先級 | 方案 | 說明 | 效益 | 狀態 |
|--------|------|------|------|------|
| 🔴 高 | **支線行程規劃** | 使用 LineTransfer 識別支線（平溪線、集集線、內灣線等）轉乘點，支援前往/離開支線的行程規劃 | 目前無法規劃十分、車埕、內灣等支線站點的行程 | ⚠️ 受限（見下方說明） |
| 🟡 中 | **使用 MinTransferTime** | 將硬編碼的 10 分鐘轉乘時間改用 API 提供的 MinTransferTime（通常 3 分鐘），提供更精準的轉乘時間估計 | 減少不必要的等待時間估計，找到更多可行的轉乘方案 | ✅ 完成 |
| 🟢 低 | **月臺資訊顯示** | `tra live station` 表格輸出顯示月臺欄位 | 提升使用者體驗，減少找月臺的困擾 | ✅ 完成 |

**支線識別邏輯**：

```
┌─────────────────────────────────────────────────────────────┐
│ LineTransfer API 可識別的支線轉乘點                          │
├─────────────────────────────────────────────────────────────┤
│ 平溪線：瑞芳 ↔ 三貂嶺（轉乘點）→ 十分、平溪、菁桐          │
│ 深澳線：瑞芳 ↔ 海科館                                       │
│ 內灣線：北新竹/竹中 ↔ 內灣（經六家線）                      │
│ 六家線：竹中 ↔ 六家（高鐵新竹）                             │
│ 集集線：二水 ↔ 車埕                                         │
│ 沙崙線：中洲 ↔ 沙崙（高鐵台南）                             │
└─────────────────────────────────────────────────────────────┘
```

**實作優先順序**：
1. 🔴 支線行程規劃：需解決「無法規劃到十分」的問題
2. 🟡 MinTransferTime：簡單改進，效益明顯
3. 🟢 月臺資訊：錦上添花

---

#### TDX API 支線資料限制 (2025-12-27 調查結論)

**問題描述**：TDX API 不包含支線站點的時刻表資料，導致無法實作支線行程規劃。

**已實作功能**：
- ✅ BranchLineResolver：識別支線站點及其轉乘站（如：十分 → 三貂嶺）
- ✅ StationTimetableMatcher：時刻表比對邏輯（通過單元測試）
- ✅ Hybrid 策略整合至 journey.ts

**TDX API 驗證結果**：

| 資料類型 | 主幹線站點 | 支線站點 (平溪/集集/內灣) |
|---------|-----------|------------------------|
| StationOfLine | ✅ 有 | ✅ 有 |
| GeneralStationTimetable | ✅ 有 | ❌ 無資料 |
| GeneralTrainTimetable | ✅ 有 | ❌ 無資料 |
| DailyTrainTimetable | ✅ 有 | ❌ 無資料 |

**具體測試**：
- 平溪線站點 (7331-7336)：GeneralStationTimetable 回傳 0 筆
- 平溪線車次 (4711, 4712, 等)：GeneralTrainTimetable 查無此車次
- 主幹線站點 (台北、瑞芳、三貂嶺)：資料正常

**根本原因**：經進一步調查，平溪線、集集線目前因工程**全線/部分停駛**，TDX 移除了停駛區間的時刻表資料。這不是 API 設計限制，而是反映實際營運狀態。

**驗證**：TDX Alert API (`/v3/Rail/TRA/Alert`) 包含停駛資訊：
- 平溪線：115年1月30日前全區間停駛
- 集集線：集集↔車埕區間停駛（隧道改善工程）

**解決方案**：整合 Alert API，在查詢停駛站點時提供明確的錯誤訊息和替代方案（見下方「阻通資訊整合」章節）。

---

#### 阻通資訊整合 (Alert Integration)

**背景**：2025-12-27 調查發現平溪線、集集線無時刻表資料，原因是這些路線目前停駛中。TDX 提供 Alert API 可查詢阻通資訊。

**TDX Alert API**：
- 端點：`/v3/Rail/TRA/Alert`
- 快取：建議 1 小時（阻通資訊不常變動）

**目前阻通資訊**（2025-12-27）：

| 路線 | 區間 | 狀態 | 說明 | 替代方案 |
|------|------|------|------|----------|
| 平溪線 | 三貂嶺↔菁桐 | 🔴 全線停駛 | 至 115/1/30 | 瑞芳↔菁桐 公路接駁 |
| 集集線 | 集集↔車埕 | 🔴 部分停駛 | 隧道改善工程 | 集集↔車埕 公路接駁 |

**新增功能**：

##### 1. `tra alerts` 指令

```bash
# 列出所有阻通資訊
tra alerts

# 查詢特定路線
tra alerts --line PX        # 平溪線
tra alerts --line JJ        # 集集線

# 查詢特定站點是否受影響
tra alerts --station 十分
tra alerts --station 7332
```

**輸出範例**：

```json
{
  "success": true,
  "data": {
    "count": 2,
    "alerts": [
      {
        "id": "8ae4cac399fde98e0199ff10b0860102",
        "title": "天然災變",
        "status": "active",
        "description": "平溪線115年1月30日前全區間停駛，瑞芳=菁桐間公路接駁。",
        "affectedLine": {
          "id": "PX",
          "name": "平溪線"
        },
        "affectedStations": [
          { "id": "7330", "name": "三貂嶺" },
          { "id": "7331", "name": "大華" },
          { "id": "7332", "name": "十分" },
          { "id": "7333", "name": "望古" },
          { "id": "7334", "name": "嶺腳" },
          { "id": "7335", "name": "平溪" },
          { "id": "7336", "name": "菁桐" }
        ],
        "alternativeTransport": "瑞芳=菁桐間公路接駁"
      }
    ]
  },
  "meta": {
    "updateTime": "2025-12-27T10:32:38+08:00"
  }
}
```

##### 2. `tra journey` 整合阻通警告

當查詢涉及停駛站點時，自動顯示警告：

```bash
tra journey 台北 平溪
```

```json
{
  "success": false,
  "error": {
    "code": "STATION_SUSPENDED",
    "message": "平溪站目前停駛中",
    "alert": {
      "description": "平溪線115年1月30日前全區間停駛",
      "alternativeTransport": "瑞芳=菁桐間公路接駁"
    },
    "suggestion": "請改查詢至瑞芳站，再轉乘公路接駁"
  }
}
```

##### 3. API 擴充

**新增方法** (`src/services/api.ts`)：

```typescript
interface Alert {
  AlertID: string;
  Title: string;
  Description: string;
  Status: number;  // 2 = active
  Scope: {
    Stations: Array<{ StationID: string; StationName: string }>;
    Lines: Array<{ LineID: string; LineName: string }>;
  };
}

// 取得所有阻通資訊
async getAlerts(): Promise<Alert[]>

// 檢查站點是否停駛
async isStationSuspended(stationId: string): Promise<Alert | null>
```

**實作優先順序**：

| 優先級 | 項目 | 說明 | 狀態 |
|--------|------|------|------|
| 🔴 高 | API 方法 | 新增 `getAlerts()` | ✅ 完成 |
| 🔴 高 | `tra alerts` 指令 | 基本列表功能 | ✅ 完成 |
| 🟢 低 | 站點/路線篩選 | `--line`, `--station` 選項 | ✅ 完成 |
| 🟡 中 | journey 整合 | 查詢時顯示停駛警告 | ✅ 完成 |

---

### Phase 8: UX Optimization (表格優化)

**目標**：提升 CLI 表格輸出的可讀性和使用者體驗

**已完成項目**：

#### 1. 車種名稱簡化

**問題**：TDX API 返回的車種名稱過長且重複，不適合表格顯示

| 原始名稱 | 簡化後 |
|----------|--------|
| `普悠瑪(普悠瑪)` | `普悠瑪` |
| `自強(3000)(EMU3000 型電車)` | `新自強` |
| `自強(DMU3100 型柴聯)` | `自強` |
| `自強(商務專開列車)` | `商務` |
| `自強(推拉式自強號且無自行車車廂)` | `自強` |
| `莒光(有身障座位)` / `莒光(無身障座位)` | `莒光` |

**實作**：
- 新增共用模組 `src/lib/train-type.ts`
- `simplifyTrainType()` 函數統一處理所有車種名稱

#### 2. 表格固定寬度對齊

**問題**：使用 Tab (`\t`) 對齊在中英文混合時無法正確對齊

**解決方案**：
- 新增 `src/lib/display-width.ts` 處理 CJK 字元寬度（中文字=寬度 2）
- `getDisplayWidth()` 計算字串顯示寬度
- `padEnd()` / `padStart()` 填充至指定寬度

**受影響指令**：

| 指令 | 表格函數 | 狀態 |
|------|----------|------|
| `tra timetable daily` | `printDailyTimetableTable` | ✅ 完成 |
| `tra timetable train` | `printTrainTimetableTable` | ✅ 完成 |
| `tra live station` | `printStationLiveBoard` | ✅ 完成 |
| `tra live delays` | `printDelaysTable` | ✅ 完成 |
| `tra fare` | `printFareTable` | ✅ 完成 |
| `tra lines list` | `printLinesTable` | ✅ 完成 |
| `tra lines stations` | `printStationsOfLineTable` | ✅ 完成 |

#### 3. 排序修正

**問題**：`--with-live` 模式下跨午夜班次排序錯誤（00:05 排在 17:41 前面）

**解決方案**：使用 `remainingMinutes`（剩餘時間）排序而非出發時間

#### 4. 即時看板方向分組

**問題**：`tra live station` 南下北上班次混合顯示，使用者需自行判斷方向

**解決方案**：預設按方向分組顯示

**輸出範例**：
```
臺北 即時到離站資訊

● 順行（方向 0）
車次    車種    終點    到站      發車      狀態
────────────────────────────────────────────
4234    區間    福隆    18:08:00  18:10:00  晚 5 分
132     自強    七堵    18:15:00  18:18:00  晚 2 分

○ 逆行（方向 1）
車次    車種    終點    到站      發車      狀態
────────────────────────────────────────────
1235    區間    新竹    18:13:00  18:16:00  準時
```

**行為**：
- 預設：按方向分組顯示
- `--direction 0`：僅顯示順行
- `--direction 1`：僅顯示逆行

**備註**：TDX API 的「順行/逆行」是以鐵路站序定義，非地理南北方向。使用者可透過「終點」欄位判斷列車行駛方向。

#### 5. 車站出口資訊

**新增指令**：`tra stations exits <station>`

**功能**：
- 查詢車站出口位置、地址、無障礙設施
- 顯示車站平面圖連結

**選項**：
- `--elevator`：僅顯示有電梯的出口
- `--map`：顯示平面圖連結

**輸出範例**：
```
臺北站 出口資訊

出口      地址                      電扶梯  電梯
────────────────────────────────────────────────
北 1      臺北市中正區黎明里市民大道一段  1       ✓
北 2      臺北市中正區黎明里市民大道一段  1       ✓
東 1      臺北市中正區黎明里北平西路 3 號  1       ✓
...

共 12 個出口

平面圖：
  - 地下2樓平面圖: https://...
  - 地下1樓~地上2樓: https://...
```

**API 資料來源**：`/v3/Rail/TRA/StationExit`（244 站有出口資料）

---

#### Cross-region TPASS Fare Calculation (跨區 TPASS 票價計算)

**目標**: 當使用者有 TPASS 月票但需跨區旅行時，計算最省錢的轉乘方案

**問題情境**:
- 使用者持有「基北北桃」TPASS（1200元/月）
- 想從台北到新竹（跨區）
- 直接購票 160 元 vs 善用 TPASS 可省多少？

**新增指令**:

```bash
# 跨區 TPASS 票價計算
tra tpass fare <from> <to> [options]

# Options:
--region <region>           # 指定持有的 TPASS 區域（自動偵測起站所屬區域）
--include-transfers         # 包含需轉乘的方案
```

**輸出範例**:

```json
{
  "success": true,
  "data": {
    "from": "台北",
    "to": "新竹",
    "tpassRegion": "基北北桃",
    "crossRegion": true,
    "options": [
      {
        "type": "direct",
        "description": "直接購票",
        "fare": 160,
        "savings": 0
      },
      {
        "type": "tpass_partial",
        "description": "TPASS 到中壢，購票到新竹",
        "transferStation": "中壢",
        "tpassSegment": { "from": "台北", "to": "中壢", "fare": 0 },
        "paidSegment": { "from": "中壢", "to": "新竹", "fare": 52 },
        "totalFare": 52,
        "savings": 108,
        "recommended": true
      },
      {
        "type": "tpass_partial",
        "description": "TPASS 到桃園，購票到新竹",
        "transferStation": "桃園",
        "tpassSegment": { "from": "台北", "to": "桃園", "fare": 0 },
        "paidSegment": { "from": "桃園", "to": "新竹", "fare": 68 },
        "totalFare": 68,
        "savings": 92
      }
    ]
  }
}
```

**Table 輸出範例**:

```
台北 → 新竹（跨區 TPASS 票價比較）
持有月票：基北北桃 (NT$1200/月)

┌──────┬──────────────────────────────────┬──────────┬────────┐
│ 推薦 │ 方案                             │ 票價     │ 省下   │
├──────┼──────────────────────────────────┼──────────┼────────┤
│ ⭐   │ TPASS 到中壢 + 購票到新竹        │ NT$52    │ NT$108 │
│      │ TPASS 到桃園 + 購票到新竹        │ NT$68    │ NT$92  │
│      │ 直接購票                         │ NT$160   │ -      │
└──────┴──────────────────────────────────┴──────────┴────────┘
```

**邊界站偵測邏輯**:

```
┌─────────────────────────────────────────────────────────────┐
│ TPASS Boundary Station Detection                            │
├─────────────────────────────────────────────────────────────┤
│ 1. 取得起站所屬 TPASS 區域的所有車站                         │
│                                                              │
│ 2. 找出該區域與目的地方向的邊界站：                          │
│    - 取路線順序最接近目的地的區域內車站                      │
│    - 例：基北北桃往新竹方向 → 中壢是最遠邊界站               │
│                                                              │
│ 3. 計算各邊界站方案的總票價：                                │
│    - TPASS 區間內：0 元                                      │
│    - 區間外：查詢 fare API                                   │
│                                                              │
│ 4. 依總票價排序，標記最省方案                                │
└─────────────────────────────────────────────────────────────┘
```

**Tests First**:
- [x] Boundary station detection tests
- [x] Cross-region fare calculation tests
- [x] Optimal transfer point selection tests
- [x] Multiple TPASS regions comparison tests

**Implementation**:
- [x] `tra tpass fare` command
- [x] Boundary station detector
- [x] Cross-region fare calculator
- [x] TPASS region boundary data

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

### Current Status (2025-12-26)

| Metric | Actual |
|--------|--------|
| Total Tests | 661 |
| Test Files | 27 |
| Languages Supported | 4 (zh-TW, en, ja, ko) |
| Commands Implemented | 10 |
| E2E Test Coverage | Exit codes, JSON output, error handling, performance |
| Platforms Supported | 5 (macOS/Linux ARM64/x64, Windows x64) |

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
- MAAS Deeplink API Swagger: https://tdx.transportdata.tw/webapi/File/Swagger/V3/ad884f5e-4692-4600-8662-12abf40e5946
- MAAS 旅運規劃 API Swagger: https://tdx.transportdata.tw/webapi/File/Swagger/V3/4513f9d6-caae-4cf7-a50c-e7887bec804e
- TDX Portal: https://tdx.transportdata.tw/

## Appendix E: TPASS Data Structure

### 資料來源

TPASS 資料為靜態資料，來自台鐵官方公告：
- https://www.railway.gov.tw/tra-tip-web/tip/tip00H/tipH41/view41

### 生活圈定義

```typescript
// src/data/tpass-regions.ts

export interface TpassRegion {
  id: string;              // 生活圈 ID（英文代號）
  name: string;            // 生活圈名稱
  price: number;           // 月票價格
  stationIds: string[];    // 包含的車站 ID 列表
}

export const TPASS_REGIONS: TpassRegion[] = [
  {
    id: 'kpnt',
    name: '基北北桃',
    price: 1200,
    stationIds: [
      '0900', '0910', '0920', // 基隆、三坑、八堵
      '0930', '0940', '0950', // 七堵、百福、五堵
      '0960', '0970', '0980', // 汐止、汐科、南港
      '0990', '1000', '1001', // 松山、臺北、萬華
      '1002', '1010', '1020', // 板橋、浮洲、樹林
      '1030', '1040', '1050', // 南樹林、山佳、鶯歌
      '1060', '1070', '1080', // 桃園、內壢、中壢
      // ... 其他站
    ]
  },
  {
    id: 'tzms',
    name: '桃竹竹苗',
    price: 1200,
    stationIds: [
      '1060', '1070', '1080', // 桃園、內壢、中壢
      '1090', '1100', '1110', // 埔心、楊梅、富岡
      '1120', '1130', '1140', // 新富、北湖、湖口
      '1150', '1160', '1170', // 新豐、竹北、北新竹
      '1180', '1190', '1200', // 新竹、三姓橋、香山
      '1210', '1220', '1230', // 崎頂、竹南、談文
      // ... 其他站
    ]
  },
  // ... 其他生活圈
];
```

### 不適用 TPASS 車種判斷

```typescript
// src/lib/tpass.ts

/**
 * 檢查車種是否適用 TPASS
 * 傳入 TrainTypeName.Zh_tw 或車種代碼
 */
export function isTpassEligibleTrainType(trainTypeName: string): boolean {
  // 排除的關鍵字
  const excludedKeywords = [
    'EMU3000', '3000',      // EMU3000 型自強號
    '普悠瑪', 'PUYUMA',
    '太魯閣', 'TAROKO',
    '觀光', '藍皮', '鳴日',  // 觀光列車
    '團體',                  // 團體列車
    '商務'                   // 商務專開
  ];

  const upperName = trainTypeName.toUpperCase();
  return !excludedKeywords.some(kw => upperName.includes(kw.toUpperCase()));
}

/**
 * 取得車站所屬的生活圈列表
 * 一個車站可能屬於多個生活圈（如桃園同時在基北北桃和桃竹竹苗）
 */
export function getStationRegions(stationId: string): TpassRegion[] {
  return TPASS_REGIONS.filter(region =>
    region.stationIds.includes(stationId)
  );
}

/**
 * 取得起訖站共同的生活圈
 * 返回空陣列表示跨區
 */
export function getCommonRegions(fromId: string, toId: string): TpassRegion[] {
  const fromRegions = getStationRegions(fromId);
  const toRegions = getStationRegions(toId);

  return fromRegions.filter(fr =>
    toRegions.some(tr => tr.id === fr.id)
  );
}
```

### 生活圈完整定義

| ID | 名稱 | 票價 | 涵蓋範圍 | 車站數 |
|----|------|------|----------|--------|
| kpnt | 基北北桃 | $1,200 | 基隆～中壢（含支線） | ~60 |
| tzms | 桃竹竹苗 | $1,200 | 桃園～苗栗（含海線、內灣線） | ~45 |
| zcnm | 中彰投苗 | $699~999 | 苗栗～南投（不含舊山線） | ~40 |
| yunlin | 雲林 | $199~399 | 雲林縣境（林內～斗南） | ~10 |
| chiayi | 嘉義 | $399 | 大林～南靖 | ~10 |
| ngkp | 南高屏 | $399~999 | 嘉義～屏東（含沙崙線） | ~50 |
| beyi | 北宜 | $750~1,800 | 基北北桃 + 宜蘭～和平 | ~70 |
| hualien | 花蓮 | $199~399 | 花蓮縣（和平～光復） | ~20 |
| taitung | 臺東 | $299 | 臺東縣（關山～太麻里） | ~15 |

### 跨區判斷邏輯

```
起點：臺北（基北北桃）
終點：新竹（桃竹竹苗）

1. 取得起點生活圈：[基北北桃]
2. 取得終點生活圈：[桃竹竹苗]
3. 計算交集：[]
4. 交集為空 → 跨區，不適用 TPASS

起點：臺北（基北北桃）
終點：桃園（基北北桃, 桃竹竹苗）

1. 取得起點生活圈：[基北北桃]
2. 取得終點生活圈：[基北北桃, 桃竹竹苗]
3. 計算交集：[基北北桃]
4. 交集非空 → 可用 TPASS（基北北桃 $1,200）
```

### CLI 輸出範例

```bash
# 同區查詢
$ tra tpass check 台北 桃園
{
  "eligible": true,
  "regions": [
    { "name": "基北北桃", "price": 1200 }
  ],
  "eligibleTrainTypes": ["區間", "區間快", "莒光", "復興", "自強（非EMU3000）"]
}

# 跨區查詢
$ tra tpass check 台北 新竹
{
  "eligible": false,
  "reason": "CROSS_REGION",
  "from": {
    "station": "臺北",
    "regions": ["基北北桃"]
  },
  "to": {
    "station": "新竹",
    "regions": ["桃竹竹苗"]
  },
  "suggestion": "臺北與新竹分屬不同生活圈，無法使用同一張 TPASS"
}

# 重疊站點
$ tra tpass check 桃園 新竹
{
  "eligible": true,
  "regions": [
    { "name": "桃竹竹苗", "price": 1200 }
  ],
  "note": "桃園同時屬於基北北桃和桃竹竹苗，使用桃竹竹苗生活圈"
}
```

---

## 附錄：架構改善進度

### P0 級別 - 關鍵缺陷修復 ✅ 完成

| 項目 | 狀態 | 提交 | 說明 |
|------|------|------|------|
| AuthService 並發 API 浪費 | ✅ 完成 | 3187c88 | 50 倍並發效率改善 |
| RateLimiter 高並發失敗率 | ✅ 完成 | 3187c88 | 失敗率 89% → 0% |
| Token 過期邊界 bug | ✅ 完成 | 3187c88 | 提前 60 秒刷新 |

### P1 級別 - 核心改善 ✅ 100% 完成 (4/4)

| 項目 | 狀態 | 提交 | 測試 | 說明 |
|------|------|------|------|------|
| Circuit Breaker 容錯模式 | ✅ 完成 | 7b888d4 | 15/15 | 三態轉換、自動恢復 |
| 指數退避重試策略 | ✅ 完成 | 4afc179 | 25/25 | 智慧重試、防雷鳥群 |
| 結構化日誌系統 | ✅ 完成 | 3af3d1b | 29/29 | JSON 格式、RequestId 追蹤 |
| 健康檢查端點 | ✅ 完成 | cc551c9 | 17/17 | 主動監控、HTTP 狀態碼 |

**P1 進度：100% (4/4 完成)**
- 新增測試數：86 個（全部通過）
- 程式碼回歸：0 個
- 類型檢查：通過 ✅

### P2 級別 - 可觀性與監控 + 性能優化 ⏳ 進行中 (3/5)

| 項目 | 狀態 | 提交 | 測試 | 說明 |
|------|------|------|------|------|
| Prometheus 指標收集 | ✅ 完成 | 35ff389 | 822/831 | 24 個指標、3 個 CLI 命令 |
| **並行優化 Phase 1** | ✅ 完成 | f04d93a | 822/831 | 支線/轉乘查詢 6x 加速 |
| **Token 持久化快取** | ✅ 完成 | 362cd62 | 8/8 | OAuth2 Token 磁盤持久化 |
| 進階並行優化 (ParallelRequestPool) | ❌ 已放棄 | 19075a5→60af97a | - | Phase 2a-2c 實驗失敗，性能回歸 7 倍 |
| 監控儀表板 | ⏳ 計劃中 | - | - | Grafana 整合 |

**P2 進度：60% (3/5 完成)**

---

## 📋 Phase 2 進階並行優化實驗總結

### Phase 2a-2c: ParallelRequestPool 設計實驗 ❌ 失敗

**目標**
- 實現優先級調度（HIGH/NORMAL/LOW）
- 改進批次處理機制
- 支持更複雜的並行控制

**實現內容**
- ✓ 建立 ParallelRequestPool 框架（優先級隊列、批次調度）
- ✓ 集成 RateLimiter（Token Bucket）
- ✓ 實現 Settled 語義（Promise.allSettled 風格）
- ✓ journey.ts 優先級調度集成

**實驗結果 ❌**

| 指標 | Phase 1 | Phase 2c | 變化 | 評估 |
|------|---------|----------|------|------|
| 台北→高雄 | 5118ms | 35941ms | ↑ 602% | ❌ 嚴重回歸 |
| 台北→台中 | 5044ms | 36504ms | ↑ 624% | ❌ 嚴重回歸 |
| 平均 | 5081ms | 36223ms | ↑ 613% | ❌ **7 倍性能惡化** |

**根本原因分析**

1. **複雜設計累積延遲**
   - ParallelRequestPool 層 + RateLimiter 層 + executeTask 層 + 事件迴圈調度
   - 每層都有 Promise、setTimeout、await，延遲累加
   - batchIntervalMs=1000ms 強制間隔，30+ 個任務累積 30 秒延遲

2. **架構設計問題**
   - Promise.all 直接並行：簡單高效
   - ParallelRequestPool 多層調度：複雜低效
   - 試圖通過「更聰明的調度」改進，反而降速

3. **診斷困難**
   - 初期診斷誤判（認為是 batchIntervalMs）
   - 進行 5 次不同的修復嘗試，全部無效
   - 最終才發現架構根本有問題

**修復嘗試（全部失敗）**
- Phase 2c-1: batchIntervalMs 改為 0ms → 無效（仍 35s）
- Phase 2c-2: processBatch 改用 while-loop → 無效（仍 35s）
- Phase 2c-3: RateLimiter.tryAcquire() 修復競爭條件 → 無效（仍 35s）
- Phase 2c-4: 共享 ParallelRequestPool 實例 → 無效（仍 35s）
- 最終決定：完全回退

**決定與行動**
- 提交 19075a5: 記錄 Phase 2b 基準測試發現
- 決議：回退到 60af97a（Phase 1 完成後的乾淨狀態）
- 結果：性能恢復到 ~5.7s（符合基準線）

### 關鍵教訓

| 失誤 | 原因 | 影響 | 改進方向 |
|------|------|------|----------|
| **複雜設計** | 過度工程化 | 7 倍性能惡化 | 優先簡單設計 |
| **盲目優化** | 沒確認瓶頸 | 優化方向錯誤 | 先測量找瓶頸 |
| **難以診斷** | 多層架構 | 5 次修復嘗試 | 設計應可觀測 |
| **功能需求混淆** | 優先級調度是功能需求，不是性能需求 | 不必要的基礎設施層 | 在應用層實現功能 |

### 現狀與建議

**✅ 當前狀態**
- 代碼已回退到 60af97a
- 性能恢復到基準線（5.7s）
- 功能完整正常

**💡 後續建議**

1. **如需優先級調度**
   - 在應用層實現（journey.ts），而非基礎設施層
   - 控制 API 調用順序，不改變 Promise.all 結構

2. **如需進一步優化**
   - 先詳細測量找到真正瓶頸
   - 漸進式改進，每次改動後立即驗證
   - 保持設計簡單，避免多層抽象

3. **保留的價值**
   - dev-notes 記錄了完整的實驗過程和分析
   - 提供了反面教材和設計決策參考

---

**✅ Prometheus 指標收集（已完成）**
- 24 個指標，6 個分類
- CLI 命令：status、prometheus、server
- 服務集成：API、認證、快取、熔斷器、重試

**✅ 並行優化 Phase 1（新增，已完成）**
- **實際性能改進**：台北→高雄 1.33x 加速（6786ms → 5118ms）、台北→台中 1.02x 加速
- **穩定性提升**：標準差降低 27-48%（更可預測的性能）
- **代碼改動**：52 行最小改動，零新依賴純原生實現
- **測試驗證**：822/831 測試通過，零回歸
- **詳細分析**：見 [dev-notes/2025-12-27-performance-benchmark.md](./dev-notes/2025-12-27-performance-benchmark.md)
  - 並行算法驗證（Promise.all 雙層並行）
  - Rate Limiter 瓶頸分析
  - Phase 2 優化建議（ParallelRequestPool、初始化並行、快取預熱）

**✅ Token 持久化快取（新增，已完成）**
- **性能改進**：後續查詢 29% 加速（3.5s → 2.7s，跳過認證）
- **跨進程持久化**：OAuth2 Token 保存到磁盤，新進程直接載入
- **實現方式**：CacheService 集成，無新依賴
- **快取位置**：`~/.cache/tdx-tra/auth/token.json`
- **快取 TTL**：24 小時（與 TDX API Token 有效期一致）
- **測試驗證**：AuthService 8/8 通過，零回歸
- **詳細分析**：見 [dev-notes/2025-12-27-token-cache-implementation.md](./dev-notes/2025-12-27-token-cache-implementation.md)
  - Token 快取流程說明
  - 每日 10 次查詢節省 8 秒（18% 性能改進）
  - 認證開銷減少 93%

### P3 級別 - 長期架構 📅 待規劃

- [ ] GraphQL 網關
- [ ] API 版本管理
- [ ] Plugin 架構

---

**最後更新**：2025-12-28
**更新者**：Claude Code
**狀態**：P1 完成 (4/4) | P2 進行中 (3/5) - Prometheus 指標 + 並行優化 Phase 1 + Token 快取上線 | Phase 2 進階並行優化實驗已記錄並回退
**測試總數**：885 個通過（已刪除 14 個過時的 P0 並發測試）
**Multi-Key**：✅ QA 驗證完成（health status 顯示正確 Key 數量、journey 指令輪詢正常）
