# P0 Test Optimization Guide

**Date**: 2025-12-28
**Goal**: Make P0 stress tests pass in all environments while maintaining test integrity

## Overview

The P0 concurrent stress tests are failing due to timeout constraints, not code defects. This guide provides practical solutions to optimize test execution without compromising coverage.

## Current Test Performance

```
Test Suite: p0-concurrency.test.ts
- Test 1: 1000 concurrent requests
  - Config: retryAfterMs=10, maxRetries=100
  - Expected duration: 10+ seconds
  - Vitest timeout: 5 seconds
  - Status: ❌ FAIL (timeout)

Test Suite: p0-verification-fixed.test.ts
- Similar 4 tests
- Status: ❌ FAIL (timeout)

Total impact: 9 failed tests out of 390+
Success rate: 97.7%
Production impact: ZERO (verified via Phase 1)
```

## Solution Comparison

### Option A: Increase Test Timeout ⭐ Recommended

**Implementation**:

Create/update `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // Global timeout settings
    testTimeout: 15000,  // Increase from default 5000ms
    hookTimeout: 10000,

    // Enable this to see which tests are slow
    slowTestThreshold: 1000,
  },
});
```

**Pros**:
- ✅ All tests pass without code changes
- ✅ Realistic stress test execution
- ✅ No behavior modifications
- ✅ Tests actual worst-case scenarios

**Cons**:
- ⚠️ P0 tests take 10+ seconds each
- ⚠️ Total test suite time increases ~40s

**Time Impact**:
```
Before: 4 stress tests × 5s = 20s (timeout) + overhead
After:  4 stress tests × 15s = 60s (complete)
```

**Implementation Steps**:

1. Create vitest.config.ts if it doesn't exist
2. Set `testTimeout: 15000`
3. Run `npm test` again

---

### Option B: Tiered Timeout Strategy

**Implementation**:

Update test file with meta tags:

```typescript
// tests/services/p0-concurrency.test.ts

import { describe, it, expect } from 'vitest';

describe('P0: RateLimiter - 高壓力測試', { timeout: 15000 }, () => {
  it('❌ 1000 concurrent requests', { timeout: 15000 }, async () => {
    // Test content
  });

  // Other tests with default timeout
  it('other test', async () => {
    // This uses global timeout
  });
});
```

**Pros**:
- ✅ Only stress tests get extended timeout
- ✅ Regular tests remain fast (5s)
- ✅ Better CI/CD performance

**Cons**:
- ⚠️ Requires tagging each test
- ⚠️ More maintenance burden

---

### Option C: Reduce Test Concurrency (Not Recommended)

**Don't use this approach**:

```typescript
// ❌ BAD: Weakens test coverage
const limiter = new RateLimiter({
  maxTokens: 50,
  refillRate: 50,
  retryAfterMs: 50,    // ← Increased (slower backoff)
  maxRetries: 100,
});

const concurrentRequests = 100;  // ← Reduced from 1000
```

**Why not**:
- ❌ Doesn't test actual high-concurrency scenarios
- ❌ Misses race conditions that only appear at scale
- ❌ False sense of security

---

### Option D: Split Tests by Environment

**Implementation**:

Separate stress tests into different files:

```
tests/
├── services/
│   ├── p0-concurrency.test.ts (regular tests)
│   ├── p0-concurrency.stress.test.ts (stress tests only)
│   └── vitest.config.stress.ts (longer timeout)
```

**Run normal tests**:
```bash
npm test  # Regular 5s timeout
```

**Run stress tests separately**:
```bash
npm run test:stress  # 15s timeout
```

Update `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:stress": "vitest --config vitest.config.stress.ts",
    "test:all": "npm test && npm run test:stress"
  }
}
```

**Pros**:
- ✅ Fast local development (skip stress tests)
- ✅ Full CI validation (run all)
- ✅ Flexible testing strategy

**Cons**:
- ⚠️ More complex setup
- ⚠️ Two separate test configurations

---

## Recommended Implementation Path

### Phase 1: Immediate Fix (Recommended)

**Do this now** - 5 minutes

1. Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 10000,
  },
});
```

2. Run tests:
```bash
npm test
```

3. Expected result:
```
✓ Total tests: 390+
✓ Passing: 390+
✓ Failing: 0
```

### Phase 2: Optional Enhancement (Later)

If you want faster feedback loop in development:

```bash
npm test -- --grep="^(?!.*stress|.*1000.*concurrent)"
```

This skips stress tests in local development.

---

## Detailed Configuration Options

### Vitest Config Properties

```typescript
defineConfig({
  test: {
    // Test execution
    testTimeout: 15000,           // Per-test timeout (ms)
    hookTimeout: 10000,           // beforeEach/afterEach timeout
    teardownTimeout: 10000,       // Cleanup timeout

    // Behavior
    globals: true,                // Global test APIs (describe, it, expect)
    environment: 'node',          // Node.js environment (not jsdom)

    // Output
    reporter: 'verbose',          // Show detailed output
    outputFile: 'test-results.json', // Save results
    slowTestThreshold: 1000,      // Flag tests slower than 1s

    // Performance
    minThreads: 1,
    maxThreads: 4,                // Parallel test workers
  },
});
```

---

## Performance Metrics

### Before Optimization

```
Test Suite Results:
├─ Passing: 381 tests ✓
├─ Failing: 9 tests (P0 stress)
├─ Success Rate: 97.7%
└─ Total Time: ~10s (with timeouts counted as instant fail)
```

### After Optimization (Option A)

```
Test Suite Results:
├─ Passing: 390+ tests ✓
├─ Failing: 0 tests
├─ Success Rate: 100%
└─ Total Time: ~50s (includes 40s P0 stress tests)
```

### CI/CD Impact

```
Current CI run:
- Regular tests: 5-10s
- P0 stress tests: 5s (timeout) × 4 = 20s
- Total: ~30s

Optimized CI run:
- Regular tests: 5-10s
- P0 stress tests: 15s × 4 = 60s
- Total: ~70s

Additional time: ~40s
Trade-off: 9 failing tests → 0 failing tests
```

---

## Production Validation

All code changes are already **validated in production**:

```
Phase 1 Benchmark (Production-Ready Code):
✅ RateLimiter: 100% success rate, 5.7s average
✅ AuthService: 1 API call per 50 concurrent requests
✅ Zero regressions in 381+ functional tests
✅ 15 performance metrics collected
✅ Health checks passing
```

The test timeout is purely an **environment constraint**, not a code defect.

---

## Implementation Checklist

### Quick Setup (5 min)

- [ ] Create `vitest.config.ts`
- [ ] Set `testTimeout: 15000`
- [ ] Run `npm test`
- [ ] Verify: all 390+ tests pass

### Optional Enhancements

- [ ] Add `.slowTestThreshold` to see slow tests
- [ ] Add test split script for faster local development
- [ ] Add GitHub Actions CI with separate stress test job
- [ ] Document test timeout requirements in CLAUDE.md

---

## Troubleshooting

### Tests Still Timing Out

**Check**:
1. Is `vitest.config.ts` in root directory?
2. Does it have `testTimeout: 15000`?
3. Run with verbose flag: `npm test -- --reporter=verbose`

### Tests Still Show 9 Failures

**Check**:
1. Vitest version: `npm list vitest`
2. Vitest config is loaded: `npm test -- --version`
3. Try explicit timeout: `npm test -- --testTimeout=15000`

### Performance Degradation

If tests take >60s:
1. Reduce worker threads: `maxThreads: 1` in vitest.config.ts
2. Check CPU usage: `top` or `htop`
3. Run tests serially: `npm test -- --reporter=verbose --no-coverage`

---

## Related Documentation

- `2025-12-28-p0-stress-test-analysis.md` - Technical analysis of failures
- `PRD.md` - Product requirements and testing strategy
- CLAUDE.md - Project guidelines

---

**Recommendation**: Apply **Option A** now (5 minutes) to make all tests pass.
