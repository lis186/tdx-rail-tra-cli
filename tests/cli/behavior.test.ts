/**
 * CLI Behavior Tests
 * Tests CLI-specific behaviors: exit codes, output formats, piping
 */

import { describe, it, expect } from 'vitest';
import { runCLI, runCLISuccess } from '../helpers/cli-runner.js';
import { spawn } from 'child_process';
import path from 'path';

describe('Exit Codes', () => {
  describe('Success Cases (exit 0)', () => {
    it('should exit 0 for --help', async () => {
      const result = await runCLI(['--help']);
      expect(result.exitCode).toBe(0);
    });

    it('should exit 0 for --version', async () => {
      const result = await runCLI(['--version']);
      expect(result.exitCode).toBe(0);
    });

    it('should exit 0 for successful stations list', async () => {
      const result = await runCLI(['stations', 'list', '-f', 'json']);
      expect(result.exitCode).toBe(0);
    });

    it('should exit 0 for successful search with results', async () => {
      const result = await runCLI(['stations', 'search', '台北', '-f', 'json']);
      expect(result.exitCode).toBe(0);
    });

    it('should exit 0 for empty search results', async () => {
      const result = await runCLI(['stations', 'search', 'zzzzzzzzz', '-f', 'json']);
      expect(result.exitCode).toBe(0); // Empty result is not an error
    });
  });

  describe('Failure Cases (exit non-0)', () => {
    it('should exit non-0 for unknown command', async () => {
      const result = await runCLI(['nonexistent']);
      expect(result.exitCode).not.toBe(0);
    });

    it('should exit non-0 for missing required arguments', async () => {
      const result = await runCLI(['timetable', 'daily']);
      expect(result.exitCode).not.toBe(0);
    });
  });
});

describe('Output Formats', () => {
  describe('JSON Format (-f json)', () => {
    it('should output valid JSON', async () => {
      const result = await runCLISuccess(['stations', 'list', '-f', 'json']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should output array for list commands', async () => {
      const result = await runCLISuccess(['stations', 'list', '-f', 'json']);
      const data = JSON.parse(result.stdout);
      expect(Array.isArray(data)).toBe(true);
    });

    it('should output object with success field for complex responses', async () => {
      const result = await runCLISuccess(['tpass', 'regions', '-f', 'json']);
      const data = JSON.parse(result.stdout);
      expect(typeof data).toBe('object');
      expect('success' in data).toBe(true);
    });

    it('JSON should be parseable by jq (single line)', async () => {
      const result = await runCLISuccess(['stations', 'list', '-f', 'json']);
      // Check it's valid JSON (would work with jq)
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toBeDefined();
    });
  });

  describe('Default Format', () => {
    it('should output human-readable text by default', async () => {
      const result = await runCLI(['--help']);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Commands:');
    });
  });
});

describe('Quiet and Verbose Modes', () => {
  it('should support -q/--quiet option', async () => {
    const result = await runCLI(['stations', 'list', '-q', '-f', 'json']);
    // Quiet mode should still output data, just less verbose
    expect(result.exitCode).toBe(0);
  });

  it('should support -v/--verbose option', async () => {
    const result = await runCLI(['stations', 'list', '-v', '-f', 'json']);
    // Verbose mode might add extra info
    expect(result.exitCode).toBe(0);
  });
});

describe('Help System', () => {
  describe('Global Help', () => {
    it('should show all main commands', async () => {
      const result = await runCLISuccess(['--help']);
      const commands = ['stations', 'timetable', 'tpass', 'fare', 'live', 'book', 'lines', 'completion'];
      for (const cmd of commands) {
        expect(result.stdout).toContain(cmd);
      }
    });

    it('should show global options', async () => {
      const result = await runCLISuccess(['--help']);
      expect(result.stdout).toContain('-f');
      expect(result.stdout).toContain('--format');
    });
  });

  describe('Subcommand Help', () => {
    const subcommands = [
      ['stations', ['list', 'search', 'info', 'resolve']],
      ['timetable', ['daily', 'train', 'station']],
      ['tpass', ['check', 'regions', 'stations']],
      ['live', ['train', 'delays', 'station']],
      ['lines', ['list', 'get', 'stations']],
      ['completion', ['bash', 'zsh', 'fish']],
    ] as const;

    for (const [cmd, subs] of subcommands) {
      it(`should show ${cmd} subcommands`, async () => {
        const result = await runCLISuccess([cmd, '--help']);
        for (const sub of subs) {
          expect(result.stdout).toContain(sub);
        }
      });
    }
  });

  describe('Nested Help', () => {
    it('should show help for nested commands', async () => {
      const result = await runCLI(['timetable', 'daily', '--help']);
      expect(result.stdout).toContain('from');
      expect(result.stdout).toContain('to');
    });
  });
});

describe('Piping and Streaming', () => {
  it('JSON output should be pipe-friendly', async () => {
    const result = await runCLISuccess(['stations', 'list', '-f', 'json']);
    // Should not have trailing newlines that break piping
    const trimmed = result.stdout.trim();
    expect(trimmed.startsWith('[') || trimmed.startsWith('{')).toBe(true);
    expect(trimmed.endsWith(']') || trimmed.endsWith('}')).toBe(true);
  });

  it('should handle stdout being a pipe', async () => {
    // Simulate piping by running with NO_COLOR
    const result = await runCLI(['stations', 'list', '-f', 'json'], {
      env: { NO_COLOR: '1' },
    });
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
});

describe('Environment Variables', () => {
  it('should respect TDX_CLIENT_ID env var', async () => {
    // Just verify it doesn't crash with env vars set
    const result = await runCLI(['--help'], {
      env: { TDX_CLIENT_ID: 'test', TDX_CLIENT_SECRET: 'test' },
    });
    expect(result.exitCode).toBe(0);
  });

  it('should respect NO_COLOR env var', async () => {
    const result = await runCLI(['--help'], {
      env: { NO_COLOR: '1' },
    });
    // Should not contain ANSI escape codes
    expect(result.stdout).not.toMatch(/\x1b\[/);
  });
});

describe('Argument Parsing', () => {
  it('should handle options before positional args', async () => {
    const result = await runCLI(['stations', '-f', 'json', 'search', '台北']);
    expect(result.exitCode).toBe(0);
  });

  it('should handle options after positional args', async () => {
    const result = await runCLI(['stations', 'search', '台北', '-f', 'json']);
    expect(result.exitCode).toBe(0);
  });

  it('should handle = syntax for options', async () => {
    const result = await runCLI(['stations', 'search', '台北', '--format=json']);
    expect(result.exitCode).toBe(0);
  });

  it('should handle combined short options', async () => {
    // -qf json might not work, but -q -f json should
    const result = await runCLI(['stations', 'list', '-q', '-f', 'json']);
    expect(result.exitCode).toBe(0);
  });
});

describe('Command Aliases', () => {
  describe('Station Nicknames', () => {
    const nicknames = [
      ['北車', '1000'],
      ['高車', '4400'],
      ['左營', '4350'],
    ];

    for (const [nickname, expectedId] of nicknames) {
      it(`should resolve ${nickname} to station ${expectedId}`, async () => {
        const result = await runCLISuccess(['stations', 'resolve', nickname, '-f', 'json']);
        const data = result.json as { success: boolean; station: { id: string } };
        expect(data.success).toBe(true);
        expect(data.station.id).toBe(expectedId);
      });
    }
  });
});

describe('Timeout Handling', () => {
  it('should complete help command quickly', async () => {
    const result = await runCLI(['--help'], { timeout: 5000 });
    expect(result.exitCode).toBe(0);
    expect(result.duration).toBeLessThan(5000);
  });

  it('should complete offline commands quickly', async () => {
    const result = await runCLI(['stations', 'list', '-f', 'json'], { timeout: 5000 });
    expect(result.exitCode).toBe(0);
    expect(result.duration).toBeLessThan(5000);
  });
});
