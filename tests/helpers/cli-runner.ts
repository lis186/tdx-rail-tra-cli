/**
 * CLI Runner Helper
 * Utility for running CLI commands in tests
 */

import { spawn } from 'child_process';
import path from 'path';

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Parsed JSON output (if valid JSON) */
  json?: unknown;
  /** Execution time in milliseconds */
  duration: number;
}

export interface CLIOptions {
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Input to send to stdin */
  input?: string;
}

const CLI_PATH = path.resolve(__dirname, '../../src/index.ts');

/**
 * Run the CLI with given arguments
 */
export async function runCLI(args: string[], options: CLIOptions = {}): Promise<CLIResult> {
  const { env = {}, cwd, timeout = 30000, input } = options;

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', CLI_PATH, ...args], {
      cwd: cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...env,
        // Disable color output for easier parsing
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    }

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`CLI timed out after ${timeout}ms`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;

      let json: unknown;
      try {
        json = JSON.parse(stdout.trim());
      } catch {
        // Not JSON output
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
        json,
        duration,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Run CLI and expect success (exit code 0)
 */
export async function runCLISuccess(args: string[], options?: CLIOptions): Promise<CLIResult> {
  const result = await runCLI(args, options);
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI failed with exit code ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`
    );
  }
  return result;
}

/**
 * Run CLI and expect failure (exit code !== 0)
 */
export async function runCLIFailure(args: string[], options?: CLIOptions): Promise<CLIResult> {
  const result = await runCLI(args, options);
  if (result.exitCode === 0) {
    throw new Error(`CLI unexpectedly succeeded\nstdout: ${result.stdout}`);
  }
  return result;
}

/**
 * Run CLI and parse JSON output
 */
export async function runCLIJSON<T = unknown>(args: string[], options?: CLIOptions): Promise<T> {
  const result = await runCLISuccess(args, options);
  if (result.json === undefined) {
    throw new Error(`CLI output is not valid JSON:\n${result.stdout}`);
  }
  return result.json as T;
}

/**
 * Check if real API credentials are available
 */
export function hasRealCredentials(): boolean {
  return !!(process.env.TDX_CLIENT_ID && process.env.TDX_CLIENT_SECRET);
}

/**
 * Skip test if no real credentials
 */
export function skipWithoutCredentials(): void {
  if (!hasRealCredentials()) {
    console.log('Skipping: TDX_CLIENT_ID and TDX_CLIENT_SECRET not set');
  }
}
