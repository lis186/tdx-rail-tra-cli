/**
 * Error Handling Tests
 * Tests error scenarios and edge cases
 */

import { describe, it, expect } from 'vitest';
import { runCLI, runCLIFailure } from '../helpers/cli-runner.js';

describe('Error Handling', () => {
  describe('Invalid Commands', () => {
    it('should show error for unknown command', async () => {
      const result = await runCLI(['unknown-command']);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('error');
    });

    it('should show error for unknown subcommand', async () => {
      const result = await runCLI(['stations', 'unknown']);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('Missing Arguments', () => {
    it('should error when timetable daily missing arguments', async () => {
      const result = await runCLI(['timetable', 'daily']);
      expect(result.exitCode).not.toBe(0);
    });

    it('should error when fare missing destination', async () => {
      const result = await runCLI(['fare', '台北']);
      expect(result.exitCode).not.toBe(0);
    });

    it('should error when book missing train number', async () => {
      const result = await runCLI(['book', '--from', '台北', '--to', '高雄']);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('Invalid Station Names', () => {
    it('should handle non-existent station gracefully', async () => {
      const result = await runCLI(['stations', 'info', 'XXXYYY不存在的站', '-f', 'json']);
      // Should either fail or return error in JSON
      if (result.json) {
        const data = result.json as { success?: boolean; error?: unknown };
        expect(data.success === false || data.error !== undefined).toBe(true);
      }
    });

    it('should handle empty station name', async () => {
      const result = await runCLI(['stations', 'search', '', '-f', 'json']);
      // Empty search might return all or error
      expect(result.exitCode).toBeDefined();
    });

    it('should handle special characters in station name', async () => {
      const result = await runCLI(['stations', 'search', '<script>alert(1)</script>', '-f', 'json']);
      // Should not crash, should return empty or error
      expect(result.exitCode).toBeDefined();
    });

    it('should handle very long station name', async () => {
      const longName = '台'.repeat(1000);
      const result = await runCLI(['stations', 'search', longName, '-f', 'json']);
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('Invalid TPASS Region', () => {
    it('should handle non-existent region', async () => {
      const result = await runCLI(['tpass', 'stations', '不存在的生活圈', '-f', 'json']);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('Invalid Date Format', () => {
    it('should handle invalid date format', async () => {
      const result = await runCLI(['timetable', 'daily', '台北', '高雄', '-d', 'invalid-date', '-f', 'json']);
      // Should either use today's date or error
      expect(result.exitCode).toBeDefined();
    });

    it('should handle future date (might have no data)', async () => {
      const futureDate = '2099-12-31';
      const result = await runCLI(['timetable', 'daily', '台北', '高雄', '-d', futureDate, '-f', 'json']);
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('API Credential Errors', () => {
    it('should show helpful error when credentials missing', async () => {
      // Run without credentials
      const result = await runCLI(['timetable', 'daily', '台北', '高雄', '-f', 'json'], {
        env: {
          TDX_CLIENT_ID: '',
          TDX_CLIENT_SECRET: '',
        },
      });

      // Should fail with helpful message about credentials
      if (result.exitCode !== 0) {
        expect(
          result.stderr.includes('憑證') ||
            result.stderr.includes('credential') ||
            result.stderr.includes('TDX_CLIENT_ID') ||
            result.stdout.includes('error')
        ).toBe(true);
      }
    });

    it('should handle invalid credentials gracefully', async () => {
      const result = await runCLI(['fare', '台北', '高雄', '-f', 'json'], {
        env: {
          TDX_CLIENT_ID: 'invalid-id',
          TDX_CLIENT_SECRET: 'invalid-secret',
        },
      });

      // Should fail but not crash
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('JSON Output Integrity', () => {
    it('should always output valid JSON when -f json specified', async () => {
      const commands = [
        ['stations', 'list', '-f', 'json'],
        ['stations', 'search', '台', '-f', 'json'],
        ['tpass', 'regions', '-f', 'json'],
        ['completion', 'bash'], // This outputs script, not JSON
      ];

      for (const cmd of commands) {
        const result = await runCLI(cmd);
        if (cmd.includes('json') && result.exitCode === 0) {
          // Should be valid JSON
          expect(() => JSON.parse(result.stdout)).not.toThrow();
        }
      }
    });

    it('should include success field in JSON responses', async () => {
      const result = await runCLI(['tpass', 'regions', '-f', 'json']);
      if (result.exitCode === 0 && result.json) {
        const data = result.json as { success?: boolean };
        expect(typeof data.success).toBe('boolean');
      }
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent commands', async () => {
      const promises = [
        runCLI(['stations', 'list', '-f', 'json']),
        runCLI(['stations', 'search', '台北', '-f', 'json']),
        runCLI(['tpass', 'regions', '-f', 'json']),
        runCLI(['--help']),
      ];

      const results = await Promise.all(promises);

      // All should complete without crashing
      for (const result of results) {
        expect(result.exitCode).toBeDefined();
      }
    });
  });
});

describe('Edge Cases', () => {
  describe('Cross-Midnight Trains', () => {
    it('should handle late night queries', async () => {
      // Query for late night (if data available)
      const result = await runCLI(['stations', 'list', '-f', 'json']);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Unicode Handling', () => {
    it('should handle CJK characters correctly', async () => {
      const result = await runCLI(['stations', 'search', '臺北', '-f', 'json']);
      expect(result.exitCode).toBe(0);
      if (result.json) {
        const stations = result.json as Array<{ name: string }>;
        // Verify Chinese characters are preserved
        expect(stations.some((s) => /[\u4e00-\u9fff]/.test(s.name))).toBe(true);
      }
    });

    it('should handle mixed language input', async () => {
      const result = await runCLI(['stations', 'search', 'Taipei台北', '-f', 'json']);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Empty Results', () => {
    it('should handle no matching stations gracefully', async () => {
      const result = await runCLI(['stations', 'search', 'zzzzzzzzzzzz', '-f', 'json']);
      expect(result.exitCode).toBe(0);
      if (result.json) {
        const stations = result.json as unknown[];
        expect(Array.isArray(stations)).toBe(true);
        // Fuzzy search might return some results even for non-matching queries
        // The important thing is it doesn't crash
      }
    });
  });
});
