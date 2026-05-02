// ─── Rust Language Engine ───
// Toolchain: cargo (which wraps rustc)
// Format: rustfmt
// Lint: clippy

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

export class RustEngine implements LanguageEngine {
  private logger = createLogger({ name: 'engine:rust', level: LogLevel.INFO });
  private config?: EngineConfig;
  private _cargo: string | null = null;
  private _status: EngineStatus = { language: Language.RUST, available: false };

  // ── Core methods ──

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    // Detect cargo
    try {
      const { stdout } = require('child_process').spawnSync('cargo', ['version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (stdout) {
        this._cargo = 'cargo';
        const rustcOut = require('child_process').spawnSync('rustc', ['--version'], {
          encoding: 'utf-8',
          timeout: 5000,
        });
        this._status = {
          language: Language.RUST,
          available: true,
          version: `${stdout.trim()} | rustc: ${rustcOut.stdout?.trim() || ''}`,
          executablePath: 'cargo',
        };
      }
    } catch {
      this._status.lastError = 'Cargo/rustc not found';
    }
    this.logger.info(`Rust engine initialized: cargo=${this._cargo}, available=${this._status.available}`);
  }

  compile(cwd: string, flags?: string[]): Promise<EngineTaskResult> {
    if (!this._cargo) {
      return Promise.resolve({ success: false, language: Language.RUST, error: 'Cargo not available' });
    }
    const startTime = Date.now();
    const allFlags = ['build', ...(flags ?? [])];
    return new Promise((resolve) => {
      const proc = spawn('cargo', allFlags, { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.RUST,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: `cargo ${allFlags.join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.RUST, error: 'Failed to spawn cargo' }));
    });
  }

  run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    if (!this._cargo) {
      return Promise.resolve({ success: false, language: Language.RUST, error: 'Cargo not available' });
    }
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('cargo', ['run', '--', ...(args ?? [])], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.RUST,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `cargo run -- ${(args ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.RUST, error: 'Failed to spawn cargo' }));
    });
  }

  test(cwd: string): Promise<EngineTaskResult> {
    if (!this._cargo) {
      return Promise.resolve({ success: false, language: Language.RUST, error: 'Cargo not available' });
    }
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('cargo', ['test', '--', '--reporter=verbose'], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.RUST,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: 'cargo test -- --reporter=verbose',
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.RUST, error: 'Failed to spawn cargo test' }));
    });
  }

  format(cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    const startTime = Date.now();
    if (this._detectBinary('rustfmt')) {
      return this._runRustfmt(cwd, startTime);
    }
    return Promise.resolve({
      success: false,
      language: Language.RUST,
      error: 'rustfmt not found',
    });
  }

  lint(cwd: string): Promise<EngineTaskResult> {
    const startTime = Date.now();
    if (this._detectBinary('cargo')) {
      return this._runClippy(cwd, startTime);
    }
    return Promise.resolve({
      success: false,
      language: Language.RUST,
      error: 'cargo clippy not available',
    });
  }

  parseProblems(output: string, stderr?: string): Problem[] {
    const combined = (output || stderr || '').trim();
    if (!combined) return [];

    const problems: Problem[] = [];
    // cargo/rustc format: file:line:col: error: message
    // Also: error: could not compile `crate` (原因是 ...)
    const linePattern = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/;

    for (const line of combined.split('\n')) {
      const match = line.match(linePattern);
      if (match) {
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          severity: match[4] === 'error' ? ProblemSeverity.ERROR : ProblemSeverity.WARNING,
          message: match[5],
          tool: 'rustc',
        });
      }
    }
    return problems;
  }

  detectBuildSystem(root: string): BuildSystem {
    if (existsSync(join(root, 'Cargo.toml'))) return BuildSystem.CARGO;
    if (existsSync(join(root, 'Makefile'))) return BuildSystem.MAKE;
    return BuildSystem.AUTO;
  }

  detectInstallSystem(_root: string): InstallSystem {
    if (this._detectBinary('rustup')) return InstallSystem.CARGO;
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

  private _runRustfmt(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('rustfmt', ['--check', '.'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.RUST,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.RUST, error: 'Failed to spawn rustfmt' }));
    });
  }

  private _runClippy(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('cargo', ['clippy', '--', '-Dwarnings'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(out, err);
        resolve({
          success: code === 0,
          language: Language.RUST,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          problems,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.RUST, error: 'Failed to spawn cargo clippy' }));
    });
  }
}
