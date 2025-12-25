# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tdx-rail-tra-cli** is a Taiwan Railway (TRA) CLI tool powered by the TDX (Transport Data eXchange) API. It provides station queries, timetables, fares, real-time train data, and booking link generation. Designed for AI agents (Claude Code, Gemini CLI, n8n) with JSON-first output.

## Commands

```bash
# Development
bun install                      # Install dependencies
bun run dev                      # Run in development mode
bun run build                    # Build for production

# Testing (TDD approach - write tests first)
bun test                         # Run all tests
bun test tests/lib/fuzzy.test.ts # Run single test file
bun test --watch                 # Watch mode
bun test --coverage              # Coverage report (target: >80%)

# CLI testing
bun run src/index.ts stations list
bun run src/index.ts timetable daily --from 台北 --to 高雄
```

## Architecture

### Core Flow
```
CLI Command → Station Resolver → API Client → Cache → Output Formatter
                    ↓
            (fuzzy search, corrections, nicknames)
```

### Key Modules

- **Station Resolver** (`src/lib/station-resolver.ts`): Multi-layer name resolution
  - Priority: ID → corrections → 台/臺 variants → nicknames → Levenshtein fuzzy (distance ≤ 2)
  - Fallback data in `src/data/stations-fallback.ts` (220+ stations from n8n workflow)

- **Auth Service** (`src/services/auth.ts`): OAuth2 Client Credentials Flow
  - Token cached until expiry, auto-refresh
  - Credentials priority: `.env` file → env vars → config file
  - Copy `.env.example` to `.env` and fill in your TDX credentials

- **Cache Service** (`src/services/cache.ts`): File-based caching at `~/.cache/tdx-tra/`
  - TTLs: stations (30d), timetables (5.5h), fares (7d), live data (no cache)

- **Time Utils** (`src/lib/time-utils.ts`): Taiwan timezone (+8) time calculations
  - `calculateRemainingMinutes()`: handles cross-midnight edge cases
  - Delay-adjusted departure/arrival times

### API Integration

- Base: `https://tdx.transportdata.tw/api/basic`
- Uses OData query syntax (`$filter`, `$format=JSON`)
- Reference: `n8n-ttca.json` contains working API patterns from production workflow

## TDD Requirements

Every feature follows Red-Green-Refactor:
1. Write failing tests first (normal, boundary, error cases)
2. Implement minimal code to pass
3. Refactor while keeping tests green

Test structure mirrors `src/`:
```
tests/lib/          # Unit tests for core modules
tests/commands/     # Command handler tests
tests/services/     # API/Auth/Cache tests
tests/e2e/          # End-to-end CLI tests
```

## Station Name Resolution

The station resolver is critical. Input examples that should all resolve to Taipei (ID: 1000):
- `1000`, `台北`, `臺北`, `北車`, `台北車站`, `台北火車站`

Corrections handle typos: `瑞方` → `瑞芳`, `版橋` → `板橋`

## Output Format

Default JSON response structure:
```json
{
  "success": true|false,
  "data": {...},
  "error": { "code": "...", "message": "...", "suggestion": "...", "candidates": [...] },
  "meta": { "cached": bool, "timestamp": "...", "apiVersion": "v3" }
}
```

Exit codes: 0=success, 1=user error, 2=API error, 3=auth error, 4=cache error

## i18n

Supports zh-TW (default), en, ja, ko. Translation files in `src/i18n/`.
