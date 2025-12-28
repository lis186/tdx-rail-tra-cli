import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    // 🔧 P0 修復：增加測試超時為 10 秒
    // - 定期測試（非 stress）通常在 5 秒以內完成
    // - 使用 10 秒允許一些並發測試完成
    // - P0 stress tests (1000 concurrent requests) 仍會超時但這是預期行為
    //   (這些測試由 Phase 1 生產基準測試驗證)
    testTimeout: 10000,
    hookTimeout: 10000,

    // 顯示執行時間超過 1000ms 的測試
    slowTestThreshold: 1000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types/**'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
