/**
 * Metrics Command
 * 指標檢視指令 - 暴露 Prometheus 指標
 * 🔧 P2 改善：實時效能監控
 */

import { Command } from 'commander';
import { TDXApiClient } from '../services/api.js';
import { ConfigService } from '../services/config.js';

export const metricsCommand = new Command('metrics')
  .description('檢視系統 Prometheus 指標');

/**
 * tra metrics status
 * 以文字格式顯示當前指標摘要
 */
metricsCommand
  .command('status')
  .description('顯示系統指標摘要（文字格式）')
  .action((options, cmd) => {
    try {
      const configService = new ConfigService();
      const clientId = configService.getClientId();
      const clientSecret = configService.getClientSecret();

      if (!clientId || !clientSecret) {
        console.error('❌ 未設定 TDX API 認證資訊');
        console.error('請執行: tra config set-auth <client_id> <client_secret>');
        process.exit(3);
      }

      // 初始化 API 客戶端以確保指標系統已準備好
      const apiClient = new TDXApiClient(clientId, clientSecret);

      // 暴露指標的提示
      displayMetricsInfo();

      process.exit(0);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ 指標查詢失敗: ${errorMsg}`);
      process.exit(2);
    }
  });

/**
 * tra metrics prometheus
 * 以 Prometheus 格式暴露指標
 */
metricsCommand
  .command('prometheus')
  .description('以 Prometheus 格式暴露指標')
  .action(async (options, cmd) => {
    try {
      const configService = new ConfigService();
      const clientId = configService.getClientId();
      const clientSecret = configService.getClientSecret();

      if (!clientId || !clientSecret) {
        console.error('❌ 未設定 TDX API 認證資訊');
        process.exit(3);
      }

      // 初始化 API 客戶端
      const apiClient = new TDXApiClient(clientId, clientSecret);

      // 匯出指標內容類型和指標數據
      const { getMetricsSnapshot, getMetricsContentType } = apiClient as any;

      console.log(`Content-Type: ${getMetricsContentType()}\n`);
      const metrics = await getMetricsSnapshot();
      console.log(metrics);

      process.exit(0);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ 指標匯出失敗: ${errorMsg}`);
      process.exit(2);
    }
  });

/**
 * tra metrics server [port]
 * 啟動 HTTP 伺服器暴露 /metrics 端點
 */
metricsCommand
  .command('server [port]')
  .description('啟動 HTTP 伺服器暴露 Prometheus 指標')
  .action(async (portArg?: string, options?: any, cmd?: any) => {
    try {
      const configService = new ConfigService();
      const clientId = configService.getClientId();
      const clientSecret = configService.getClientSecret();

      if (!clientId || !clientSecret) {
        console.error('❌ 未設定 TDX API 認證資訊');
        console.error('請執行: tra config set-auth <client_id> <client_secret>');
        process.exit(3);
      }

      // 初始化 API 客戶端
      const apiClient = new TDXApiClient(clientId, clientSecret);

      // 解析埠號
      const port = parseInt(portArg || '9090', 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`❌ 無效的埠號: ${portArg}`);
        process.exit(1);
      }

      // 動態導入 HTTP 伺服器
      const http = await import('http');
      const { getMetricsSnapshot, getMetricsContentType } = apiClient as any;

      const server = http.createServer(async (req: any, res: any) => {
        if (req.url === '/metrics' && req.method === 'GET') {
          try {
            const metrics = await getMetricsSnapshot();
            res.writeHead(200, { 'Content-Type': getMetricsContentType() });
            res.end(metrics);
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Failed to collect metrics');
          }
        } else if (req.url === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found\n\nAvailable endpoints:\n  GET /metrics - Prometheus metrics\n  GET /health - Health check\n');
        }
      });

      server.listen(port, () => {
        console.log(`\n✅ Prometheus 指標伺服器已啟動`);
        console.log(`\n📊 存取位址：`);
        console.log(`  指標: http://localhost:${port}/metrics`);
        console.log(`  健康檢查: http://localhost:${port}/health`);
        console.log(`\n💡 提示：`);
        console.log(`  - 在 Prometheus 組態中加入：`);
        console.log(`    scrape_configs:`);
        console.log(`      - job_name: 'tdx-tra'`);
        console.log(`        static_configs:`);
        console.log(`          - targets: ['localhost:${port}']`);
        console.log(`  - 按 Ctrl+C 停止伺服器\n`);
      });

      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ 埠號 ${port} 已被佔用`);
        } else {
          console.error(`❌ 伺服器啟動失敗: ${error.message}`);
        }
        process.exit(2);
      });

      // 優雅關閉
      process.on('SIGTERM', () => {
        console.log('\n⛔ 正在關閉伺服器...');
        server.close(() => {
          console.log('✅ 伺服器已關閉');
          process.exit(0);
        });
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ 伺服器啟動失敗: ${errorMsg}`);
      process.exit(2);
    }
  });

/**
 * 顯示指標資訊的輔助函數
 */
function displayMetricsInfo(): void {
  console.log('\n📊 Prometheus 指標系統\n');
  console.log('已收集的指標類別：\n');

  const categories = [
    {
      name: '🔗 API 指標',
      metrics: [
        'api_requests_total - API 請求總數',
        'api_request_duration_seconds - API 請求延遲',
        'api_errors_total - API 錯誤總數',
        'api_response_size_bytes - API 回應大小'
      ]
    },
    {
      name: '🔐 認證指標',
      metrics: [
        'auth_token_requests_total - Token 請求總數',
        'auth_cache_hits_total - 認證快取命中次數',
        'auth_cache_misses_total - 認證快取未命中次數',
        'auth_failures_total - 認證失敗總數'
      ]
    },
    {
      name: '💾 快取指標',
      metrics: [
        'cache_hits_total - 快取命中次數',
        'cache_misses_total - 快取未命中次數',
        'cache_size_bytes - 快取大小',
        'cache_entries_count - 快取項目數量',
        'cache_expirations_total - 快取過期次數'
      ]
    },
    {
      name: '⚡ 熔斷器指標',
      metrics: [
        'circuit_breaker_state - 熔斷器狀態',
        'circuit_breaker_state_changes_total - 狀態變化次數',
        'circuit_breaker_requests_total - 經過熔斷器的請求',
        'circuit_breaker_success_rate - 成功率'
      ]
    },
    {
      name: '🔄 重試指標',
      metrics: [
        'retry_attempts_total - 重試嘗試次數',
        'retry_backoff_total_ms - 累計退避延遲',
        'retry_successes_total - 重試成功次數',
        'retry_failures_total - 重試失敗次數',
        'retry_success_rate - 重試成功率'
      ]
    }
  ];

  for (const category of categories) {
    console.log(`${category.name}`);
    for (const metric of category.metrics) {
      console.log(`  • ${metric}`);
    }
    console.log();
  }

  console.log('📈 查看指標的方式：\n');
  console.log('1️⃣  以文字格式查看摘要：');
  console.log('    tra metrics status\n');
  console.log('2️⃣  以 Prometheus 格式匯出：');
  console.log('    tra metrics prometheus\n');
  console.log('3️⃣  啟動 HTTP 伺服器：');
  console.log('    tra metrics server 9090\n');
}
