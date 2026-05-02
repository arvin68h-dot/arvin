// ─── TypeScript Language Engine ───
// Compiler: tsc
// Runtime: ts-node / tsx
// Format: prettier
// Lint: eslint with typescript-eslint

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

export class TsEngine implements LanguageEngine {
  private logger = createLogger({ name: 'engine:ts', level: LogLevel.INFO });
  private config?: EngineConfig;
  private _tsc: string | null = null;
  private _runtime: string | null = null;
  private _status: EngineStatus = { language: Language.TYPESCRIPT, available: false };

  // ── Core methods ──

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    // Detect tsc
    try {
      require('child_process').spawnSync('tsc', ['--version'], { stdio: 'ignore', timeout: 5000 });
      this._tsc = 'tsc';
    } catch {
      // try npx
      this._tsc = 'npx';
    }
    // Detect runtime
    if (this._detectBinary('tsx')) {
      this._runtime = 'tsx';
    } else if (this._detectBinary('ts-node')) {
      this._runtime = 'ts-node';
    } else if (this._detectBinary('tsc') && this._detectBinary('node')) {
      this._runtime = 'node+tsc';
    }

    this._status = {
      language: Language.TYPESCRIPT,
      available: !!this._tsc && !!this._runtime,
      executablePath: this._tsc || undefined,
      lastError: !!this._tsc && !!this._runtime ? undefined : 'No TypeScript toolchain found (tsc + tsx/ts-node)',
    };

    this.logger.info(`TS engine initialized: tsc=${this._tsc}, runtime=${this._runtime}, available=${this._status.available}`);
  }

  compile(cwd: string, flags?: string[]): Promise<EngineTaskResult> {
    const startTime = Date.now();
    const tsConfig = existsSync(join(cwd, 'tsconfig.json')) ? ['-p', cwd] : [];
    const extraFlags = ['-noEmit', ...(flags ?? [])];
    const cmd = this._tsc || 'tsc';
    const args = [...tsConfig, ...extraFlags];

    return new Promise((resolve) => {
      const proc = spawn(cmd, args, { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.TYPESCRIPT,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: `${cmd} ${args.join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.TYPESCRIPT, error: 'Failed to spawn tsc' }));
    });
  }

  run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    const script = this._findTsFile(cwd) || 'index.ts';
    const startTime = Date.now();

    if (this._runtime === 'tsx') {
      return this._runTsx(cwd, script, args, startTime);
    }
    if (this._runtime === 'ts-node') {
      return this._runTsNode(cwd, script, args, startTime);
    }
    // Fallback: compile then run
    return this.compile(cwd).then((result) => {
      if (!result.success) return result;
      return this._runTsx(cwd, script, args, Date.now());
    });
  }

  test(cwd: string): Promise<EngineTaskResult> {
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
          language: Language.TYPESCRIPT,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: 'npx vitest run',
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.TYPESCRIPT, error: 'Failed to spawn test runner' }));
    });
  }

  format(cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    const startTime = Date.now();
    if (this._detectBinary('prettier')) {
      return this._runPrettier(cwd, startTime);
    }
    return Promise.resolve({
      success: false,
      language: Language.TYPESCRIPT,
      error: 'No TS formatter found (prettier)',
    });
  }

  lint(cwd: string): Promise<EngineTaskResult> {
    const startTime = Date.now();
    if (this._detectBinary('eslint')) {
      return this._runEslint(cwd, startTime);
    }
    return Promise.resolve({
      success: false,
      language: Language.TYPESCRIPT,
      error: 'No TS linter found (eslint)',
    });
  }

  parseProblems(output: string, stderr?: string): Problem[] {
    const combined = (output || stderr || '').trim();
    if (!combined) return [];

    const problems: Problem[] = [];
    // tsc format: file( line,col): error TS####: message
    const tscPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning|info)\s+(TS\d+):\s*(.+)$/;
    // Simple format: file:line:col: message
    const linePattern = /^(.+?):(\d+):(\d+):\s*(error|warning|info):\s*(.+)$/;
    // Single line: file:line: message
    const singlePattern = /^(.+?):(\d+):\s*(error|warning|info):\s*(.+)$/;

    for (const line of combined.split('\n')) {
      let match = line.match(tscPattern);
      if (!match) match = line.match(linePattern);
      if (!match) match = line.match(singlePattern);
      if (match) {
        const sev = match[4] === 'error' ? ProblemSeverity.ERROR : match[4] === 'warning' ? ProblemSeverity.WARNING : ProblemSeverity.INFO;
        const col = match[3] ? parseInt(match[3], 10) : 0;
        const code = match[5]?.match(/TS\d+/)?.[0] || undefined;
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: col,
          severity: sev,
          message: match[5] || match[6],
          code,
          tool: 'tsc',
        });
      }
    }
    return problems;
  }

  detectBuildSystem(root: string): BuildSystem {
    if (existsSync(join(root, 'package.json'))) return BuildSystem.NPM;
    if (existsSync(join(root, 'pnpm-lock.yaml'))) return BuildSystem.PNPM;
    return BuildSystem.AUTO;
  }

  detectInstallSystem(root: string): InstallSystem {
    if (this._detectBinary('npm')) return InstallSystem.NPM;
    if (this._detectBinary('pnpm')) return InstallSystem.NPM;
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

  private _findTsFile(cwd: string): string | null {
    for (const name of ['index.ts', 'main.ts', 'app.ts', 'src/index.ts']) {
      const resolved = join(cwd, name);
      if (existsSync(resolved)) return name;
    }
    return null;
  }

  private _runTsx(cwd: string, script: string, args?: string[], start?: number): Promise<EngineTaskResult> {
    const startTime = start ?? Date.now();
    return new Promise((resolve) => {
      const proc = spawn('tsx', [script, ...(args ?? [])], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.TYPESCRIPT,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `tsx ${script} ${(args ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.TYPESCRIPT, error: 'Failed to spawn tsx' }));
    });
  }

  private _runTsNode(cwd: string, script: string, args?: string[], start?: number): Promise<EngineTaskResult> {
    const startTime = start ?? Date.now();
    return new Promise((resolve) => {
      const proc = spawn('ts-node', [script, ...(args ?? [])], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.TYPESCRIPT,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `ts-node ${script} ${(args ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.TYPESCRIPT, error: 'Failed to spawn ts-node' }));
    });
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
          language: Language.TYPESCRIPT,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.TYPESCRIPT, error: 'Failed to spawn prettier' }));
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
          language: Language.TYPESCRIPT,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          problems,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.TYPESCRIPT, error: 'Failed to spawn eslint' }));
    });
  }
}
