// ─── JavaScript Language Engine ───
// Runtime: node
// Format: prettier (fallback: none)
// Lint: eslint

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import type {
  EngineConfig,
  EngineStatus,
  EngineTaskResult,
  Problem,
  LanguageEngine,
} from '@codeengine/core';
import { BuildSystem, InstallSystem, Language, LogLevel, ProblemSeverity, createLogger } from '@codeengine/core';

export class JsEngine implements LanguageEngine {
  private logger = createLogger({ name: 'engine:js', level: LogLevel.INFO });
  private config?: EngineConfig;
  private _runtime: string | null = null;
  private _status: EngineStatus = { language: Language.JAVASCRIPT, available: false };

  // ── Core methods ──

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    // Detect node
    try {
      const { stdout } = require('child_process').spawnSync('node', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      this._runtime = 'node';
      this._status = {
        language: Language.JAVASCRIPT,
        available: true,
        version: stdout?.trim() || '',
        executablePath: 'node',
      };
    } catch {
      this._status.lastError = 'Node.js not found';
    }
    this.logger.info(`JS engine initialized: runtime=${this._runtime}, available=${this._status.available}`);
  }

  compile(cwd: string, _flags?: string[]): Promise<EngineTaskResult> {
    // JS has no compilation step, use node --check for syntax validation
    const jsFiles = this._findJsFiles(cwd);
    if (jsFiles.length === 0) {
      return Promise.resolve({
        success: false,
        language: Language.JAVASCRIPT,
        error: 'No JavaScript files found',
      });
    }

    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('node', ['--check', ...jsFiles.slice(0, 1)], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.JAVASCRIPT,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: `node --check ${jsFiles[0]}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.JAVASCRIPT, error: 'Failed to spawn node' }));
    });
  }

  run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    const script = this._findMainJs(cwd) || 'index.js';
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = spawn('node', [script, ...(args ?? [])], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.JAVASCRIPT,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `node ${script} ${(args ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.JAVASCRIPT, error: 'Failed to spawn node' }));
    });
  }

  test(cwd: string): Promise<EngineTaskResult> {
    // Try common JS test runners
    const testCmd = this.config?.testCommand || 'node';
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('npx', ['--yes', 'vitest', 'run', '--reporter=verbose'], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.JAVASCRIPT,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: 'npx vitest run',
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.JAVASCRIPT, error: 'Failed to spawn test runner' }));
    });
  }

  format(cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    const startTime = Date.now();
    if (this._detectBinary('prettier')) {
      return this._runPrettier(cwd, startTime);
    }
    return Promise.resolve({
      success: false,
      language: Language.JAVASCRIPT,
      error: 'No JS formatter found (prettier)',
    });
  }

  lint(cwd: string): Promise<EngineTaskResult> {
    const startTime = Date.now();
    if (this._detectBinary('eslint')) {
      return this._runEslint(cwd, startTime);
    }
    return Promise.resolve({
      success: false,
      language: Language.JAVASCRIPT,
      error: 'No JS linter found (eslint)',
    });
  }

  parseProblems(output: string, stderr?: string): Problem[] {
    const combined = (output || stderr || '').trim();
    if (!combined) return [];

    const problems: Problem[] = [];
    // ESLint format: file:line:col: message  or  path (line:col): message
    const linePattern = /^(.+?):(\d+):(\d+):\s*(error|warning|info):\s*(.+)$/;
    const singlePattern = /^(.+?)\s+\((\d+):(\d+)\):\s*(error|warning|info):\s*(.+)$/;

    for (const line of combined.split('\n')) {
      let match = line.match(linePattern);
      if (!match) match = line.match(singlePattern);
      if (match) {
        const sev = match[4] === 'error' ? ProblemSeverity.ERROR : match[4] === 'warning' ? ProblemSeverity.WARNING : ProblemSeverity.INFO;
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          severity: sev,
          message: match[5],
          tool: 'eslint',
        });
      }
    }
    return problems;
  }

  detectBuildSystem(root: string): BuildSystem {
    if (existsSync(join(root, 'package.json'))) return BuildSystem.NPM;
    if (existsSync(join(root, 'pnpm-lock.yaml'))) return BuildSystem.PNPM;
    if (existsSync(join(root, 'Makefile'))) return BuildSystem.MAKE;
    return BuildSystem.AUTO;
  }

  detectInstallSystem(root: string): InstallSystem {
    if (this._detectBinary('npm')) return InstallSystem.NPM;
    if (this._detectBinary('pnpm')) return InstallSystem.NPM;
    if (this._detectBinary('yarn')) return InstallSystem.NPM;
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

  private _findJsFiles(cwd: string): string[] {
    const files: string[] = [];
    const exts = ['.js', '.jsx', '.mjs', '.cjs'];
    function searchRecursive(dir: string): void {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !['node_modules', '.git', '__pycache__'].includes(e.name)) {
            searchRecursive(join(dir, e.name));
          } else if (e.isFile() && exts.includes(e.name.substring(e.name.lastIndexOf('.')))) {
            files.push(join(dir, e.name));
          }
        }
      } catch { /* ignore */ }
    }
    searchRecursive(cwd);
    return files;
  }

  private _findMainJs(cwd: string): string | null {
    for (const name of ['index.js', 'main.js', 'app.js']) {
      if (existsSync(join(cwd, name))) return name;
    }
    return this._findJsFiles(cwd)[0] || null;
  }

  private _runPrettier(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('prettier', ['--write', '.'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.JAVASCRIPT,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.JAVASCRIPT, error: 'Failed to spawn prettier' }));
    });
  }

  private _runEslint(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('eslint', ['.'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(out, err);
        resolve({
          success: code === 0,
          language: Language.JAVASCRIPT,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          problems,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.JAVASCRIPT, error: 'Failed to spawn eslint' }));
    });
  }
}
