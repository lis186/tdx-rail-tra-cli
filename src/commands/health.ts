/**
 * Health Check Command
 * 健康檢查指令 - 檢查系統各組件狀態
 * 🔧 P1 改善：主動監控系統狀態
 */

import { Command } from 'commander';
import { TDXApiClient } from '../services/api.js';
import { HealthCheckService, getHttpStatusCode } from '../services/health.js';
import { ConfigService } from '../services/config.js';

export const healthCommand = new Command('health')
  .description('檢查系統健康狀態');

/**
 * tra health status
 * 執行完整的健康檢查並輸出結果
 */
healthCommand
  .command('status')
  .description('檢查系統各組件的健康狀態')
  .option('--json', '輸出 JSON 格式（預設）')
  .option('--text', '輸出可讀文字格式')
  .action(async (options, cmd) => {
    try {
      // 讀取配置
      const configService = new ConfigService();
      const { clientId, clientSecret } = configService.getAuthConfig();

      if (!clientId || !clientSecret) {
        console.error('❌ 未設定 TDX API 認證資訊');
        console.error('請執行: tra config set-auth <client_id> <client_secret>');
        process.exit(3);
      }

      // 初始化 API 客戶端和健康檢查服務
      const apiClient = new TDXApiClient(clientId, clientSecret);
      const healthService = new HealthCheckService(apiClient);

      // 執行健康檢查
      const result = await healthService.performHealthCheck();

      // 根據格式選項輸出結果
      const useText = options.text;

      if (useText) {
        // 文字格式輸出
        console.log('\n📋 系統健康狀態檢查\n');
        console.log(`狀態: ${formatStatusWithEmoji(result.status)}`);
        console.log(`時間: ${result.timestamp}`);
        console.log('\n組件狀態:');

        for (const [component, health] of Object.entries(result.components)) {
          const emoji = getComponentEmoji(health.status);
          const componentName = getComponentName(component);
          console.log(`  ${emoji} ${componentName}: ${health.status}`);
          console.log(`     ${health.details}`);
        }

        console.log('\n摘要:');
        console.log(`  ${result.summary}\n`);
      } else {
        // JSON 格式輸出（預設）
        console.log(JSON.stringify(result, null, 2));
      }

      // 根據狀態設定退出碼
      const statusCode = getHttpStatusCode(result.status);
      if (statusCode === 503) {
        process.exit(2); // API error exit code
      }

      process.exit(0);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ 健康檢查失敗: ${errorMsg}`);
      process.exit(2);
    }
  });

/**
 * 將狀態文字轉換為帶 emoji 的格式
 */
function formatStatusWithEmoji(status: string): string {
  switch (status) {
    case 'healthy':
      return '✅ 健康 (Healthy)';
    case 'degraded':
      return '⚠️ 降級 (Degraded)';
    case 'unhealthy':
      return '❌ 不健康 (Unhealthy)';
    default:
      return status;
  }
}

/**
 * 根據狀態返回對應的 emoji
 */
function getComponentEmoji(status: string): string {
  switch (status) {
    case 'healthy':
      return '✅';
    case 'degraded':
      return '⚠️';
    case 'unhealthy':
      return '❌';
    default:
      return '❓';
  }
}

/**
 * 將組件英文名轉換為中文
 */
function getComponentName(component: string): string {
  const nameMap: Record<string, string> = {
    api: 'API 服務',
    auth: '認證服務',
    cache: '快取服務',
    circuitBreaker: '熔斷器'
  };
  return nameMap[component] || component;
}
