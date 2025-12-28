/**
 * P0 并发问题验证测试
 * 用实际的 async/await 压力测试暴露竞态条件
 *
 * 这些测试**不用** vi.useFakeTimers()，因为 fake timers 无法暴露真实的并发问题
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../src/services/rate-limiter.js';
import { AuthService } from '../../src/services/auth.js';
import { vi } from 'vitest';

describe('P0: RateLimiter - 并发竞态条件测试', () => {
  /**
   * 问题假设：
   * 当多个 acquire() 同时进行时，refill 逻辑可能产生竞态条件
   * 导致 token 计数不准确
   */

  it('❌ 高压力测试：1000 个并发请求，只有 50 个 token（应该都成功）', async () => {
    const limiter = new RateLimiter({
      maxTokens: 50,
      refillRate: 50,
      retryAfterMs: 10,
      maxRetries: 100, // 允许多次重试
    });

    const concurrentRequests = 1000;
    const promises: Promise<void>[] = [];

    // 同时发起 1000 个 acquire() 请求
    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        limiter.acquire()
          .then(() => ({
            success: true,
            attempt: i,
          }))
          .catch((err) => ({
            success: false,
            error: err.message,
            attempt: i,
          }))
      );
    }

    const results = await Promise.all(promises);

    // 分析结果
    const successes = results.filter((r: any) => r.success).length;
    const failures = results.filter((r: any) => !r.success).length;

    console.log(`
    ========== RateLimiter 压力测试结果 ==========
    总请求数: ${concurrentRequests}
    成功: ${successes}
    失败: ${failures}

    预期: 所有 1000 个请求都应该成功（因为有重试机制）
    实际: ${successes === concurrentRequests ? '✅ 通过' : '❌ 失败'}
    ============================================
    `);

    // 如果不是全部成功，说明有问题
    expect(successes).toBe(concurrentRequests);

    if (successes !== concurrentRequests) {
      const failedAttempts = results
        .filter((r: any) => !r.success)
        .slice(0, 5);
      console.error('示例失败:', failedAttempts);
    }
  });

  it('❌ 高频率 tryAcquire 测试：检查 token 计数准确性', async () => {
    const limiter = new RateLimiter({
      maxTokens: 100,
      refillRate: 50,
    });

    const recordedAcquisitions: number[] = [];
    const errors: string[] = [];

    // 模拟高频率的 tryAcquire 调用
    const rapidAcquisitions = () => {
      for (let i = 0; i < 100; i++) {
        const result = limiter.tryAcquire();
        if (result) {
          recordedAcquisitions.push(Date.now());
        }
      }
    };

    // 同时发起多个高频率获取
    await Promise.all([
      Promise.resolve(rapidAcquisitions()),
      Promise.resolve(rapidAcquisitions()),
      Promise.resolve(rapidAcquisitions()),
    ]);

    const acquiredCount = recordedAcquisitions.length;
    const expectedMax = 100; // maxTokens

    console.log(`
    ========== tryAcquire 精确性测试 ==========
    预期最多获取: ${expectedMax} 个 token
    实际获取: ${acquiredCount} 个
    状态: ${acquiredCount <= expectedMax ? '✅ 正确' : '❌ 超出限制！'}
    ========================================
    `);

    // Token 不应该超过 maxTokens
    expect(acquiredCount).toBeLessThanOrEqual(expectedMax);

    if (acquiredCount > expectedMax) {
      errors.push(`Token 计数错误: 获取了 ${acquiredCount} 个，但最多只有 ${expectedMax} 个`);
    }
  });

  it('❌ 竞态条件：同步和异步 acquire 混合', async () => {
    const limiter = new RateLimiter({
      maxTokens: 10,
      refillRate: 100, // 快速补充 token
      retryAfterMs: 5,
      maxRetries: 50,
    });

    let successCount = 0;
    let failureCount = 0;

    // 混合同步的 tryAcquire 和异步的 acquire
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        // 异步 acquire
        promises.push(
          limiter.acquire()
            .then(() => {
              successCount++;
            })
            .catch(() => {
              failureCount++;
            })
        );
      } else {
        // 同步 tryAcquire（立即）
        if (limiter.tryAcquire()) {
          successCount++;
        } else {
          failureCount++;
        }
      }
    }

    await Promise.all(promises);

    console.log(`
    ========== 混合同异步竞态测试 ==========
    总请求: 100
    成功: ${successCount}
    失败: ${failureCount}
    预期: 所有都应成功（有重试）
    =====================================
    `);

    // 应该没有失败（因为有重试机制）
    expect(failureCount).toBe(0);
  });

  /**
   * 这个测试验证：真实环境中会发生什么
   * - 1000 个并发请求
   * - 只有 50 个 token
   * - 应该自动排队和等待
   */
  it('❌ 实战模拟：模拟 CLI 的并发 API 请求', async () => {
    const limiter = new RateLimiter({
      maxTokens: 50,
      refillRate: 50,
      retryAfterMs: 10,
      maxRetries: 200,
    });

    // 模拟真实 API 调用
    const simulateApiCall = async () => {
      await limiter.acquire();
      // 模拟网络延迟 50ms
      await new Promise(r => setTimeout(r, 50));
    };

    const startTime = Date.now();
    const apiCalls = 200; // 200 个 CLI 调用

    // 同时发起 200 个 API 调用
    const results = await Promise.allSettled(
      Array(apiCalls).fill(null).map(simulateApiCall)
    );

    const duration = Date.now() - startTime;
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // 理论上，200 个请求，50 req/s，应该耗时 ~4 秒
    // 加上 50ms 网络延迟，总共 ~4.05 秒
    const expectedMinDuration = (200 / 50) * 1000; // 4000ms

    console.log(`
    ========== 实战 API 并发模拟 ==========
    总请求: ${apiCalls}
    成功: ${successful}
    失败: ${failed}
    耗时: ${duration}ms
    预期最小耗时: ~${expectedMinDuration}ms (200 req / 50 req/s)

    预期: 所有请求都成功，且耗时 >= ${expectedMinDuration}ms
    实际: ${successful === apiCalls && duration >= expectedMinDuration ? '✅ 正确' : '❌ 异常'}
    ====================================
    `);

    expect(successful).toBe(apiCalls);
    expect(duration).toBeGreaterThanOrEqual(expectedMinDuration * 0.9); // 允许 10% 误差
  });
});

describe('P0: AuthService - 并发去重测试', () => {
  /**
   * 问题假设：
   * 多个 getToken() 同时调用时，可能发起多个 token 请求
   * 而不是共用同一个请求
   */

  it('❌ 高并发 token 请求：应该只发起 1 次 API 调用', async () => {
    const mockClientId = 'test-client-id';
    const mockClientSecret = 'test-client-secret';

    let tokenRequestCount = 0;
    const requestTimestamps: number[] = [];

    // Mock ofetch 来追踪调用
    const mockOfetch = vi.fn(async () => {
      tokenRequestCount++;
      requestTimestamps.push(Date.now());
      // 模拟网络延迟
      await new Promise(r => setTimeout(r, 100));
      return {
        access_token: `token-${tokenRequestCount}`,
        expires_in: 86400,
        token_type: 'Bearer',
      };
    });

    vi.doMock('ofetch', () => ({
      ofetch: mockOfetch,
    }));

    // 需要重新导入来获取 mock
    const { AuthService: MockedAuthService } = await import('../../src/services/auth.js');
    const authService = new MockedAuthService(mockClientId, mockClientSecret);

    // 同时发起 50 个 getToken() 请求
    const concurrentTokenRequests = 50;
    const tokenPromises = Array(concurrentTokenRequests)
      .fill(null)
      .map(() => authService.getToken());

    const tokens = await Promise.all(tokenPromises);

    // 分析结果
    console.log(`
    ========== AuthService 并发去重测试 ==========
    并发 getToken() 调用数: ${concurrentTokenRequests}
    实际发起的 token 请求数: ${tokenRequestCount}

    预期: 只发起 1 次 API 请求（其他 49 个等待）
    实际: ${tokenRequestCount === 1 ? '✅ 通过' : `❌ 失败（发起了 ${tokenRequestCount} 次）`}

    tokens 是否都相同: ${tokens.every(t => t === tokens[0]) ? '✅ 是' : '❌ 否'}
    ================================================
    `);

    // 核心测试：应该只请求 1 次 token
    expect(tokenRequestCount).toBe(1);

    // 所有 token 应该相同
    expect(tokens.every(t => t === tokens[0])).toBe(true);

    if (tokenRequestCount > 1) {
      console.error(`❌ 问题严重：发起了 ${tokenRequestCount} 次 token 请求！`);
      console.error(`请求时间戳:`, requestTimestamps);
      console.error('这会导致：');
      console.error('1. API 调用数增加 N 倍');
      console.error('2. 认证服务器压力增加');
      console.error('3. 潜在的 rate limit 触发');
    }

    vi.unmock('ofetch');
  });

  it('❌ Token 过期时的并发刷新', async () => {
    const mockClientId = 'test-client-id';
    const mockClientSecret = 'test-client-secret';

    let tokenRequestCount = 0;

    const mockOfetch = vi.fn(async () => {
      tokenRequestCount++;
      await new Promise(r => setTimeout(r, 50));
      return {
        access_token: `token-${tokenRequestCount}-${Date.now()}`,
        expires_in: 1, // 1 秒后过期
        token_type: 'Bearer',
      };
    });

    vi.doMock('ofetch', () => ({
      ofetch: mockOfetch,
    }));

    const { AuthService: MockedAuthService } = await import('../../src/services/auth.js');
    const authService = new MockedAuthService(mockClientId, mockClientSecret);

    // 第 1 阶段：获取初始 token
    const token1 = await authService.getToken();
    expect(tokenRequestCount).toBe(1);

    // 等待 token 过期（加上 60s buffer）
    // 实际上我们需要 token 真的过期
    await new Promise(r => setTimeout(r, 1100));

    // 第 2 阶段：同时发起多个请求，应该只刷新 1 次
    const tokenPromises = Array(20)
      .fill(null)
      .map(() => authService.getToken());

    const tokens = await Promise.all(tokenPromises);

    console.log(`
    ========== Token 过期时的并发刷新 ==========
    初始请求: 1 次（tokenRequestCount = ${1}）
    等待 token 过期...
    并发刷新请求: 20 次
    实际发起的请求数: ${tokenRequestCount}

    预期: 总共 2 次请求（初始 1 次 + 刷新 1 次）
    实际: ${tokenRequestCount === 2 ? '✅ 通过' : `❌ 失败（共 ${tokenRequestCount} 次）`}
    =========================================
    `);

    // 应该只有 2 次请求：初始 + 1 次刷新
    expect(tokenRequestCount).toBe(2);

    // 所有新 token 应该相同
    expect(tokens.every(t => t === tokens[0])).toBe(true);

    if (tokenRequestCount > 2) {
      console.error(`❌ Token 过期刷新异常：发起了 ${tokenRequestCount} 次请求`);
    }

    vi.unmock('ofetch');
  });
});

/**
 * 总结报告
 */
describe('P0 问题验证总结', () => {
  it('📊 显示验证结果摘要', async () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           P0 并发问题验证测试 - 执行报告                      ║
╚════════════════════════════════════════════════════════════════╝

【问题 1】RateLimiter 竞态条件
────────────────────────────────
测试方式：真实的异步并发（不用 fake timers）
- 1000 个并发 acquire() 请求
- 只有 50 个 token
- 预期：全部成功（通过重试）
- 实际：见上方测试结果

【问题 2】AuthService 去重失败
────────────────────────────────
测试方式：并发 getToken() 调用
- 同时发起 50 个 getToken()
- 预期：只发起 1 次 API 请求
- 实际：见上方测试结果

【重要性】
────────────────────────────────
如果这些测试失败：
✗ 高并发下 rate limiter 不可靠
✗ 浪费 API 配额
✗ 可能触发服务限流
✗ 性能下降

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  });
});
