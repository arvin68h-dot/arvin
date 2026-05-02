// ─── C++ Language Engine ───
// Compilers: clang++ > g++ > c++
// Tools: clang-format, clang-tidy

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  EngineConfig,
  EngineStatus,
  EngineTaskResult,
  Problem,
  LanguageEngine,
} from '@codeengine/core';
import { BuildSystem, InstallSystem, Language, LogLevel, ProblemSeverity, createLogger } from '@codeengine/core';

const CPP_EXTENSIONS = ['.cpp', '.hpp', '.cc', '.h', '.cxx', '.hxx'];
const COMMON_SOURCES = ['*.cpp', '*.cc', '*.cxx', '*.c'];

export class CppEngine implements LanguageEngine {
  private logger = createLogger({ name: 'engine:cpp', level: LogLevel.INFO });
  private config?: EngineConfig;
  private _compiler: string | null = null;
  private _compilerVersion: string = '';
  private _status: EngineStatus = { language: Language.CPP, available: false };

  // ── Binary detection ──

  private detectCompiler(): string | null {
    const candidates = ['clang++', 'g++', 'c++'];
    for (const compiler of candidates) {
      try {
        spawnSync(compiler, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 3000 });
        return compiler;
      } catch {
        // try next
      }
    }
    return null;
  }

  private detectVersion(compiler: string): string {
    try {
      return spawnSync(compiler, ['--version'], { timeout: 3000 }).toString().split('\n')[0].trim();
    } catch {
      return '';
    }
  }

  // ── Core methods ──

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    this._compiler = this.detectCompiler();
    if (this._compiler) {
      this._compilerVersion = this.detectVersion(this._compiler);
      this._status = {
        language: Language.CPP,
        available: true,
        version: this._compilerVersion,
        executablePath: this._compiler,
      };
    } else {
      this._status = {
        language: Language.CPP,
        available: false,
        lastError: 'No C++ compiler found (clang++, g++, c++)',
      };
    }
    this.logger.info(`C++ engine initialized: compiler=${this._compiler}, available=${this._status.available}`);
  }

  compile(cwd: string, flags?: string[]): Promise<EngineTaskResult> {
    if (!this._compiler) {
      return Promise.resolve({
        success: false,
        language: Language.CPP,
        error: 'No C++ compiler available',
        problems: [],
      });
    }

    const allFlags = [
      '-Wall', '-Wextra',
      '-std=c++17',
      ...(this.config?.compilerFlags ?? []),
      ...(flags ?? []),
    ];

    // Find main source file
    const srcFile = this.findMainSource(cwd) || 'main.cpp';
    const outFile = join(cwd, 'main');
    const cmd = this._compiler;
    const args = [...allFlags, '-o', outFile, srcFile];
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = spawn(cmd, args, { cwd });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        const duration = Date.now() - startTime;
        const problems = this.parseProblems(stderr);
        resolve({
          success: code === 0,
          language: Language.CPP,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: `${cmd} ${args.join(' ')}`,
          duration,
        });
      });

      proc.on('error', () => {
        resolve({
          success: false,
          language: Language.CPP,
          error: 'Failed to spawn compiler',
        });
      });
    });
  }

  run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    const binary = join(cwd, 'main');
    if (!existsSync(binary)) {
      return Promise.resolve({
        success: false,
        language: Language.CPP,
        error: `Binary not found: ${binary}. Compile first.`,
      });
    }

    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn(binary, args ?? [], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.CPP,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `${binary} ${(args ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });

      proc.on('error', () => {
        resolve({ success: false, language: Language.CPP, error: 'Failed to spawn binary' });
      });
    });
  }

  test(_cwd: string): Promise<EngineTaskResult> {
    return Promise.resolve({
      success: false,
      language: Language.CPP,
      output: '',
      error: 'No standard test framework configured for C++',
    });
  }

  format(cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    if (!this.detectBinary('clang-format')) {
      return Promise.resolve({
        success: false,
        language: Language.CPP,
        error: 'clang-format not found',
      });
    }

    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('clang-format', ['-i', '-style=file', ...(cwd ? ['-output-replacements-xml', '-'] : [])], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.CPP,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: 'clang-format -i',
          duration: Date.now() - startTime,
        });
      });

      proc.on('error', () => {
        resolve({ success: false, language: Language.CPP, error: 'Failed to spawn clang-format' });
      });
    });
  }

  lint(cwd: string): Promise<EngineTaskResult> {
    if (!this.detectBinary('clang-tidy')) {
      return Promise.resolve({
        success: false,
        language: Language.CPP,
        error: 'clang-tidy not found',
      });
    }

    const sources = this.findAllSources(cwd);
    if (sources.length === 0) {
      return Promise.resolve({
        success: true,
        language: Language.CPP,
        output: 'No source files to lint',
        problems: [],
      });
    }

    const startTime = Date.now();
    return new Promise((resolve) => {
      const args = ['-header-filter=.', ...sources];
      const proc = spawn('clang-tidy', args, { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.CPP,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: `clang-tidy ${sources.join(' ')}`,
          duration: Date.now() - startTime,
        });
      });

      proc.on('error', () => {
        resolve({ success: false, language: Language.CPP, error: 'Failed to spawn clang-tidy' });
      });
    });
  }

  parseProblems(output: string, stderr?: string): Problem[] {
    const combined = (output || stderr || '').trim();
    if (!combined) return [];

    const problems: Problem[] = [];
    // GCC/Clang format: file:line:col: error: message
    const linePattern = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/;
    const singleLinePattern = /^(.+?):(\d+):\s*(error|warning):\s*(.+)$/;

    for (const line of combined.split('\n')) {
      let match = line.match(linePattern);
      if (!match) match = line.match(singleLinePattern);
      if (match) {
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          severity: match[4] === 'error' ? ProblemSeverity.ERROR : ProblemSeverity.WARNING,
          message: match[5],
          tool: 'clang',
        });
      }
    }
    return problems;
  }

  detectBuildSystem(root: string): BuildSystem {
    if (existsSync(join(root, 'CMakeLists.txt'))) return BuildSystem.CMAKE;
    if (existsSync(join(root, 'Makefile')) || existsSync(join(root, 'makefile'))) return BuildSystem.MAKE;
    return BuildSystem.AUTO;
  }

  detectInstallSystem(root: string): InstallSystem {
    if (this.detectBinary('apt')) return InstallSystem.APT;
    if (this.detectBinary('brew')) return InstallSystem.BREW;
    if (this.detectBinary('pacman')) return InstallSystem.SYSTEM;
    return InstallSystem.SYSTEM;
  }

  status(): EngineStatus {
    return this._status;
  }

  // ── Helpers ──

  private detectBinary(name: string): boolean {
    try {
      spawnSync(name, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  private findMainSource(cwd: string): string | null {
    const candidates = ['main.cpp', 'main.cc', 'main.cxx', 'main.c'];
    for (const c of candidates) {
      if (existsSync(join(cwd, c))) return c;
    }
    // fallback: find any .cpp
    for (const c of ['*.cpp', '*.cc', '*.cxx']) {
      // Simple check
      if (existsSync(join(cwd, '*.cpp'))) return '*.cpp';
    }
    return null;
  }

  private findAllSources(cwd: string): string[] {
    const { readdirSync, existsSync, join } = require('node:fs');
    const sources: string[] = [];
    const exts = ['.cpp', '.cc', '.cxx', '.h', '.hpp'];
    try {
      const entries = readdirSync(cwd, { recursive: true, withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && exts.includes(e.name.substring(e.name.lastIndexOf('.')))) {
          sources.push(join(cwd, e.path ? join(e.path, e.name) : e.name));
        }
      }
    } catch {
      // ignore
    }
    return sources;
  }
}
