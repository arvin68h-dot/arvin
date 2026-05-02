// ─── Go Language Engine ───
// Toolchain: go
// Format: gofmt
// Lint: golangci-lint

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  EngineConfig,
  EngineTaskResult,
  EngineStatus,
  Problem,
  LanguageEngine,
} from '@codeengine/core';
import { BuildSystem, InstallSystem, Language, LogLevel, ProblemSeverity, createLogger } from '@codeengine/core';

export class GoEngine implements LanguageEngine {
  private logger = createLogger({ name: 'engine:go', level: LogLevel.INFO });
  private config?: EngineConfig;
  private _goCmd: string | null = null;
  private _status: EngineStatus = { language: Language.GO, available: false };

  // ── Core methods ──

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    // Detect go
    try {
      const { stdout } = require('child_process').spawnSync('go', ['version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (stdout) {
        this._goCmd = 'go';
        this._status = {
          language: Language.GO,
          available: true,
          version: stdout.trim(),
          executablePath: 'go',
        };
      }
    } catch {
      this._status.lastError = 'Go toolchain not found';
    }
    this.logger.info(`Go engine initialized: go=${this._goCmd}, available=${this._status.available}`);
  }

  compile(cwd: string, flags?: string[]): Promise<EngineTaskResult> {
    if (!this._goCmd) {
      return Promise.resolve({ success: false, language: Language.GO, error: 'Go not available' });
    }
    const startTime = Date.now();
    const allFlags = ['build', ...(flags ?? [])];
    return new Promise((resolve) => {
      const proc = spawn('go', allFlags, { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.GO,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: `go ${allFlags.join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.GO, error: 'Failed to spawn go' }));
    });
  }

  run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    if (!this._goCmd) {
      return Promise.resolve({ success: false, language: Language.GO, error: 'Go not available' });
    }
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('go', ['run', '.', ...(args ?? [])], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.GO,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `go run . ${(args ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.GO, error: 'Failed to spawn go' }));
    });
  }

  test(cwd: string): Promise<EngineTaskResult> {
    if (!this._goCmd) {
      return Promise.resolve({ success: false, language: Language.GO, error: 'Go not available' });
    }
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('go', ['test', './...', '-v'], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.GO,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: 'go test ./... -v',
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.GO, error: 'Failed to spawn go test' }));
    });
  }

  format(cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('gofmt', ['-l', '-w', '.'], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.GO,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: 'gofmt -l -w .',
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.GO, error: 'Failed to spawn gofmt' }));
    });
  }

  lint(cwd: string): Promise<EngineTaskResult> {
    const startTime = Date.now();
    if (this._detectBinary('golangci-lint')) {
      return this._runGolangciLint(cwd, startTime);
    }
    // Fallback: go vet
    return this._runGoVet(cwd, startTime);
  }

  parseProblems(output: string, stderr?: string): Problem[] {
    const combined = (output || stderr || '').trim();
    if (!combined) return [];

    const problems: Problem[] = [];
    // Go build format: path/to/file.go:line:col: message
    const linePattern = /^(.+):(\d+):(\d+):\s*(.+)$/;

    for (const line of combined.split('\n')) {
      const match = line.match(linePattern);
      if (match) {
        const msg = match[4];
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          severity: /error/i.test(msg) ? ProblemSeverity.ERROR : ProblemSeverity.WARNING,
          message: msg,
          tool: 'go',
        });
      }
    }
    return problems;
  }

  detectBuildSystem(_root: string): BuildSystem {
    return BuildSystem.AUTO;
  }

  detectInstallSystem(_root: string): InstallSystem {
    if (this._detectBinary('apt')) return InstallSystem.APT;
    if (this._detectBinary('brew')) return InstallSystem.BREW;
    return InstallSystem.SYSTEM;
  }

  status(): EngineStatus {
    return this._status;
  }

  // ── Helpers ──

  private _detectBinary(name: string): boolean {
    try {
      require('child_process').spawnSync(name, ['--version'], { stdio: 'ignore', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  private _runGolangciLint(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('golangci-lint', ['run', './...'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(out, err);
        resolve({
          success: code === 0,
          language: Language.GO,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          problems,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.GO, error: 'Failed to spawn golangci-lint' }));
    });
  }

  private _runGoVet(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('go', ['vet', './...'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(out, err);
        resolve({
          success: code === 0,
          language: Language.GO,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          problems,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.GO, error: 'Failed to spawn go vet' }));
    });
  }
}
