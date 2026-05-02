// ─── Language Engine Base Class ───
// Shared logic for all language engines: process spawning, binary detection,
// problem parsing, status reporting.

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import type {
  EngineConfig,
  EngineTaskResult,
  EngineStatus,
  Problem,
  LanguageEngine,
  ProblemPattern,
} from '@codeengine/core';
import { BuildSystem, InstallSystem, Language, LogLevel, createLogger } from '@codeengine/core';

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
}

export abstract class BaseEngine implements LanguageEngine {
  protected config?: EngineConfig;
  protected _runtime: string | null = null;
  protected _status!: EngineStatus;
  private _logger: ReturnType<typeof createLogger> | null = null;

  protected abstract readonly language: Language;

  // Lazy logger to avoid accessing abstract property during construction
  protected get logger(): ReturnType<typeof createLogger> {
    if (!this._logger) {
      this._logger = createLogger({ name: `engine:${this.language}`, level: LogLevel.INFO });
    }
    return this._logger;
  }

  // ── Configuration ──

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    this._status = {
      language: this.language,
      available: false,
    };
    this.logger.info(`Initializing engine for ${this.language}`);
    await this.detectAndValidate();
  }

  protected abstract detectAndValidate(): Promise<void>;

  // ── Abstract operations (each engine implements) ──

  abstract compile(cwd: string, flags?: string[]): Promise<EngineTaskResult>;
  abstract run(cwd: string, args?: string[]): Promise<EngineTaskResult>;
  abstract test(cwd: string): Promise<EngineTaskResult>;
  abstract format(cwd: string, files?: string[]): Promise<EngineTaskResult>;
  abstract lint(cwd: string): Promise<EngineTaskResult>;

  // ── Binary detection ──

  protected detectBinary(name: string): boolean {
    try {
      spawnSync(name, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  protected findBinary(names: string[]): string | null {
    for (const name of names) {
      if (this.detectBinary(name)) return name;
    }
    return null;
  }

  // ── Process spawning ──

  protected spawnCmd(
    cmd: string,
    args: string[],
    cwd: string,
    opts?: { timeout?: number; env?: Record<string, string> },
  ): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      this.logger.debug(`Spawn: ${cmd} ${args.join(' ')} (cwd: ${cwd})`);

      const proc = spawn(cmd, args, {
        cwd,
        shell: true,
        env: { ...process.env, ...opts?.env },
      });

      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      }, opts?.timeout ?? 60000);

      proc.stdout.on('data', (d: Buffer) => chunks.push(d));
      proc.stderr.on('data', (d: Buffer) => errChunks.push(d));

      proc.on('close', (code) => {
        clearTimeout(timer);
        const duration = Date.now() - start;
        resolve({
          stdout: Buffer.concat(chunks).toString('utf-8'),
          stderr: Buffer.concat(errChunks).toString('utf-8'),
          exitCode: code,
          duration,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // ── Problem parsing ──

  parseProblems(output: string, _stderr?: string): Problem[] {
    const combined = output || _stderr || '';
    return this.parseProblemFromPattern(combined, this.config?.problemPatterns ?? []);
  }

  protected parseProblemFromPattern(output: string, patterns: ProblemPattern[]): Problem[] {
    const problems: Problem[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern.pattern);
        const match = line.match(regex);
        if (match) {
          problems.push({
            file: match[pattern.file] || '',
            line: parseInt(match[pattern.line], 10) || 0,
            column: pattern.column != null ? (parseInt(match[pattern.column], 10) || 0) : 0,
            severity: pattern.type,
            message: match[pattern.message] || line,
            tool: this.language,
          });
        }
      }
    }
    return problems;
  }

  // ── Task result helper ──

  protected taskResult(
    opts: {
      success: boolean;
      command?: string;
      language?: Language;
      output?: string;
      error?: string;
      exitCode?: number;
      duration?: number;
      problems?: Problem[];
    },
  ): EngineTaskResult {
    return {
      success: opts.success,
      language: opts.language ?? this.language,
      output: opts.output,
      error: opts.error,
      exitCode: opts.exitCode,
      duration: opts.duration,
      command: opts.command,
      problems: opts.problems,
    };
  }

  // ── Status ──

  status(): EngineStatus {
    return this._status;
  }

  // ── Build / install detection (default implementations) ──

  detectBuildSystem(_root: string): BuildSystem {
    return BuildSystem.AUTO;
  }

  detectInstallSystem(_root: string): InstallSystem {
    return InstallSystem.SYSTEM;
  }
}
