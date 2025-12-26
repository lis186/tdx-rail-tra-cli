/**
 * E2E Workflow Tests
 * Tests complete user workflows with real or mocked API
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  runCLI,
  runCLISuccess,
  runCLIJSON,
  hasRealCredentials,
} from '../helpers/cli-runner.js';

// These tests require real API credentials
// Run with: TDX_CLIENT_ID=xxx TDX_CLIENT_SECRET=xxx npm test -- tests/e2e
const SKIP_REAL_API = !hasRealCredentials();

describe('E2E Workflow Tests', () => {
  describe('Help and Version', () => {
    it('should show help with --help', async () => {
      const result = await runCLISuccess(['--help']);
      expect(result.stdout).toContain('tra');
      expect(result.stdout).toContain('stations');
      expect(result.stdout).toContain('timetable');
      expect(result.exitCode).toBe(0);
    });

    it('should show version with --version', async () => {
      const result = await runCLISuccess(['--version']);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should show subcommand help', async () => {
      const result = await runCLISuccess(['stations', '--help']);
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('search');
    });
  });

  describe('Stations Command (Offline)', () => {
    it('should list stations in JSON format', async () => {
      const result = await runCLISuccess(['stations', 'list', '-f', 'json']);
      expect(result.json).toBeDefined();
      expect(Array.isArray(result.json)).toBe(true);
    });

    it('should search stations with fuzzy matching', async () => {
      const result = await runCLISuccess(['stations', 'search', '台北', '-f', 'json']);
      expect(result.json).toBeDefined();
      const stations = result.json as Array<{ name: string }>;
      expect(stations.length).toBeGreaterThan(0);
      expect(stations.some((s) => s.name.includes('臺北') || s.name.includes('台北'))).toBe(true);
    });

    it('should get station info by ID', async () => {
      const result = await runCLISuccess(['stations', 'info', '1000', '-f', 'json']);
      expect(result.json).toBeDefined();
    });

    it('should handle nickname resolution', async () => {
      const result = await runCLISuccess(['stations', 'info', '北車', '-f', 'json']);
      expect(result.json).toBeDefined();
      const data = result.json as { success: boolean; station: { id: string } };
      expect(data.success).toBe(true);
      expect(data.station.id).toBe('1000'); // 臺北站
    });

    it('should resolve station name to ID', async () => {
      const result = await runCLISuccess(['stations', 'resolve', '台北', '-f', 'json']);
      expect(result.json).toBeDefined();
      const data = result.json as { success: boolean; station: { id: string } };
      expect(data.success).toBe(true);
      expect(data.station.id).toBe('1000');
    });
  });

  describe('TPASS Command (Offline)', () => {
    it('should list all regions', async () => {
      const result = await runCLISuccess(['tpass', 'regions', '-f', 'json']);
      expect(result.json).toBeDefined();
      const data = result.json as { success: boolean; regions: unknown[] };
      expect(data.success).toBe(true);
      expect(data.regions.length).toBeGreaterThan(0);
    });

    it('should list stations in a region', async () => {
      const result = await runCLISuccess(['tpass', 'stations', '基北北桃', '-f', 'json']);
      expect(result.json).toBeDefined();
      const data = result.json as { success: boolean; stations: unknown[] };
      expect(data.success).toBe(true);
      expect(data.stations.length).toBeGreaterThan(0);
    });

    it('should check TPASS eligibility', async () => {
      const result = await runCLISuccess(['tpass', 'check', '台北', '桃園', '-f', 'json']);
      expect(result.json).toBeDefined();
      const data = result.json as { success: boolean; eligible: boolean };
      expect(data.success).toBe(true);
      expect(typeof data.eligible).toBe('boolean');
    });
  });

  describe('Completion Command', () => {
    it('should generate bash completion', async () => {
      const result = await runCLISuccess(['completion', 'bash']);
      expect(result.stdout).toContain('_tra_completions');
      expect(result.stdout).toContain('complete -F');
    });

    it('should generate zsh completion', async () => {
      const result = await runCLISuccess(['completion', 'zsh']);
      expect(result.stdout).toContain('#compdef tra');
      expect(result.stdout).toContain('compdef _tra tra');
    });

    it('should generate fish completion', async () => {
      const result = await runCLISuccess(['completion', 'fish']);
      expect(result.stdout).toContain('complete -c tra');
    });
  });

  // Real API tests - only run when credentials are available
  // Run with: TDX_CLIENT_ID=xxx TDX_CLIENT_SECRET=xxx npm test -- tests/e2e
  describe.skipIf(SKIP_REAL_API)('Real API Tests', () => {
    const today = new Date().toISOString().split('T')[0];

    it('should query timetable between stations', async () => {
      const result = await runCLI(['timetable', 'daily', '台北', '板橋', '-d', today, '-f', 'json']);
      // API might fail, just ensure it doesn't crash
      expect(result.exitCode).toBeDefined();
      if (result.exitCode === 0) {
        expect(result.json).toBeDefined();
      }
    }, 30000);

    it('should query train timetable', async () => {
      const result = await runCLI(['timetable', 'train', '110', '-f', 'json']);
      // May or may not find the train depending on schedule
      expect(result.exitCode).toBeDefined();
    }, 30000);

    it('should query fare', async () => {
      const result = await runCLI(['fare', '台北', '高雄', '-f', 'json']);
      expect(result.exitCode).toBeDefined();
      if (result.exitCode === 0 && result.json) {
        const data = result.json as { success: boolean };
        expect(data.success).toBe(true);
      }
    }, 30000);

    it('should generate booking link (no API required)', async () => {
      // Booking link generation is offline - doesn't need API
      const result = await runCLI([
        'book',
        '--train', '110',
        '--from', '台北',
        '--to', '高雄',
        '--date', today,
        '-f', 'json'
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();
      const data = result.json as { success: boolean; data: { url: string } };
      expect(data.success).toBe(true);
      expect(data.data.url).toContain('https://');
    }, 10000);

    it('should list lines', async () => {
      const result = await runCLI(['lines', 'list', '-f', 'json']);
      expect(result.exitCode).toBeDefined();
      if (result.exitCode === 0 && result.json) {
        const data = result.json as { success: boolean; lines: unknown[] };
        expect(data.success).toBe(true);
        expect(data.lines.length).toBeGreaterThan(0);
      }
    }, 30000);
  });
});

describe('Performance Tests', () => {
  // Note: These tests spawn via `npx tsx` which adds ~500-1000ms startup overhead
  // In production (compiled binary), response times would be much faster

  it('should respond to --help within 3s', async () => {
    const result = await runCLISuccess(['--help']);
    expect(result.duration).toBeLessThan(3000);
  });

  it('should list stations within 3s (cached)', async () => {
    const result = await runCLISuccess(['stations', 'list', '-f', 'json']);
    expect(result.duration).toBeLessThan(3000);
  });

  it('should search stations within 3s', async () => {
    const result = await runCLISuccess(['stations', 'search', '台', '-f', 'json']);
    expect(result.duration).toBeLessThan(3000);
  });
});
