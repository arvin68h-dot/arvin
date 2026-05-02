// ─── C# Language Engine ───
// Toolchain: dotnet
// Build: dotnet build
// Format: dotnet format
// Lint: dotnet format (no separate lint tool for .NET)

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

export class CsEngine implements LanguageEngine {
  private logger = createLogger({ name: 'engine:cs', level: LogLevel.INFO });
  private config?: EngineConfig;
  private _dotnet: string | null = null;
  private _status: EngineStatus = { language: Language.CSHARP, available: false };

  // ── Core methods ──

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    // Detect dotnet
    try {
      const { stdout } = require('child_process').spawnSync('dotnet', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (stdout) {
        this._dotnet = 'dotnet';
        this._status = {
          language: Language.CSHARP,
          available: true,
          version: `dotnet ${stdout.trim()}`,
          executablePath: 'dotnet',
        };
      }
    } catch {
      this._status.lastError = '.NET SDK not found';
    }
    this.logger.info(`C# engine initialized: dotnet=${this._dotnet}, available=${this._status.available}`);
  }

  compile(cwd: string, flags?: string[]): Promise<EngineTaskResult> {
    if (!this._dotnet) {
      return Promise.resolve({ success: false, language: Language.CSHARP, error: 'dotnet not available' });
    }
    const startTime = Date.now();
    const allFlags = ['build', '--no-restore', ...(flags ?? [])];
    return new Promise((resolve) => {
      const proc = spawn('dotnet', allFlags, { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.CSHARP,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: `dotnet build --no-restore ${(flags ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.CSHARP, error: 'Failed to spawn dotnet' }));
    });
  }

  run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    if (!this._dotnet) {
      return Promise.resolve({ success: false, language: Language.CSHARP, error: 'dotnet not available' });
    }
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('dotnet', ['run', '--no-build', '--', ...(args ?? [])], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.CSHARP,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `dotnet run --no-build -- ${(args ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.CSHARP, error: 'Failed to spawn dotnet' }));
    });
  }

  test(cwd: string): Promise<EngineTaskResult> {
    if (!this._dotnet) {
      return Promise.resolve({ success: false, language: Language.CSHARP, error: 'dotnet not available' });
    }
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('dotnet', ['test', '--no-build', '--logger', 'console;verbosity=normal'], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.CSHARP,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: 'dotnet test --no-build',
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.CSHARP, error: 'Failed to spawn dotnet test' }));
    });
  }

  format(cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    if (!this._dotnet) {
      return Promise.resolve({ success: false, language: Language.CSHARP, error: 'dotnet not available' });
    }
    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('dotnet', ['format', 'whitespace', '.'], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.CSHARP,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: 'dotnet format whitespace .',
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.CSHARP, error: 'Failed to spawn dotnet format' }));
    });
  }

  lint(cwd: string): Promise<EngineTaskResult> {
    // .NET uses dotnet build for linting (compiler warnings = lints)
    return this.compile(cwd, ['--no-incremental']);
  }

  parseProblems(output: string, stderr?: string): Problem[] {
    const combined = (output || stderr || '').trim();
    if (!combined) return [];

    const problems: Problem[] = [];
    // MSBuild/dotnet format: path( line,col): error MSB####: message
    const msbuildPattern = /^(.+)\((\d+),(\d+)\):\s*(error|warning)\s+(MSB\d+|CS\d+):\s*(.+)$/;
    // Single line: path:line: message
    const singlePattern = /^(.+):(\d+):\s*(error|warning):\s*(.+)$/;

    for (const line of combined.split('\n')) {
      let match = line.match(msbuildPattern);
      if (!match) match = line.match(singlePattern);
      if (match) {
        const sev = match[4] === 'error' ? ProblemSeverity.ERROR : ProblemSeverity.WARNING;
        const col = match[3] ? parseInt(match[3], 10) : 0;
        const code = match[5] || undefined;
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: col,
          severity: sev,
          message: match[5] || match[6],
          code,
          tool: 'msbuild',
        });
      }
    }
    return problems;
  }

  detectBuildSystem(root: string): BuildSystem {
    if (existsSync(join(root, 'sln')) || existsSync(join(root, '*.sln'))) return BuildSystem.AUTO;
    if (existsSync(join(root, '*.csproj'))) return BuildSystem.AUTO;
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
}
