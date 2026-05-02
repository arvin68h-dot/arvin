import { spawn } from 'child_process';
import * as os from 'os';
import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';
import { ShellFilter } from './filter.js';

export interface ShellResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;
}

export interface ShellOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  pty?: boolean;
  shell?: string;
}

const DEFAULT_SHELL = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';

export function createShellRunner() {
  const logger = createLogger({ name: 'tool:shell_runner', level: LogLevel.INFO });

  return {
    name: 'shell_runner',
    description: 'Execute shell commands with timeout, output capture, error handling, and security filtering.',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const command = input.command as string;
      if (!command) {
        return { success: false, content: 'Error: "command" is required' };
      }

      // 安全检查：白名单 + 黑名单过滤
      const filterResult = ShellFilter.check(command);
      if (!filterResult.allowed) {
        logger.warn(`Shell command blocked: ${filterResult.reason}`);
        return {
          success: false,
          content: `Command blocked by security policy: ${filterResult.reason}`,
          metadata: { blocked: true, reason: filterResult.reason },
        };
      }

      const timeout = (input.timeout as number) || 120000;
      const cwd = (input.cwd as string) || ctx.workspaceRoot;
      const shell = (input.shell as string) || DEFAULT_SHELL;

      logger.debug(`Shell: ${command} (cwd: ${cwd}, timeout: ${timeout}ms)`);

      return new Promise<{ success: boolean; content: string; metadata?: Record<string, unknown> }>(resolve => {
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';
        let killed = false;

        const proc = spawn(shell, [shell === 'cmd.exe' ? '/C' : '-c', command], {
          cwd,
          shell: true,
          env: { ...process.env, ...((input.env as Record<string, string>) || {}) },
        });

        const timer = setTimeout(() => {
          killed = true;
          try { proc.kill('SIGTERM'); } catch { /* ignore */ }
        }, timeout);

        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          clearTimeout(timer);
          const duration = Date.now() - startTime;
          if (killed) {
            resolve({ success: false, content: `Command timed out after ${timeout}ms`, metadata: { exitCode: code, duration, killed: true } });
          } else {
            resolve({
              success: code === 0,
              content: stdout || stderr || '(no output)',
              metadata: { exitCode: code, duration },
            });
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          resolve({ success: false, content: `Process error: ${err.message}` });
        });
      });
    },
  };
}
