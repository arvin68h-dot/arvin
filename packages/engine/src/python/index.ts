// ─── Python Language Engine ───
// Interpreters: python3 / python
// Formatter: ruff format > black
// Linter: ruff check > flake8 / mypy
// Test: pytest / python -m unittest

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

export class PythonEngine implements LanguageEngine {
  private logger = createLogger({ name: 'engine:python', level: LogLevel.INFO });
  private config?: EngineConfig;
  private _interpreter: string | null = null;
  private _status: EngineStatus = { language: Language.PYTHON, available: false };

  // ── Binary detection ──

  private detectInterpreter(): string | null {
    const candidates = ['python3', 'python'];
    for (const interp of candidates) {
      try {
        spawn(interp, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] }).on('close', (code) => {
          if (code === 0) this._interpreter = interp;
        });
        // Simpler approach: just try running
        return interp;
      } catch {
        continue;
      }
    }
    return null;
  }

  // ── Core methods ──

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    // Detect python3 or python
    try {
      spawn('python3', ['--version'], { stdio: 'ignore' }).on('close', (code) => {
        if (code === 0) {
          this._interpreter = 'python3';
          this._status.available = true;
        } else {
          this._detectAltInterpreter();
        }
      });
    } catch {
      this._detectAltInterpreter();
    }

    if (!this._status.available) {
      this._status.lastError = 'No Python interpreter found (python3 / python)';
    }

    this.logger.info(`Python engine initialized: interpreter=${this._interpreter}, available=${this._status.available}`);
  }

  private _detectAltInterpreter(): void {
    try {
      spawn('python', ['--version'], { stdio: 'ignore' }).on('close', (code) => {
        if (code === 0) {
          this._interpreter = 'python';
          this._status.available = true;
        }
      });
    } catch {
      this._status.lastError = 'No Python interpreter found';
    }
  }

  compile(cwd: string, _flags?: string[]): Promise<EngineTaskResult> {
    // Python is interpreted, but we can compile to bytecode with -m py_compile
    const interp = this._interpreter || 'python3';
    const srcFiles = this._findPythonFiles(cwd);
    if (srcFiles.length === 0) {
      return Promise.resolve({
        success: false,
        language: Language.PYTHON,
        error: 'No Python files found',
      });
    }

    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn('python3', ['-m', 'py_compile', ...srcFiles], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.PYTHON,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `python3 -m py_compile ${srcFiles.join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.PYTHON, error: 'Failed to spawn python3' }));
    });
  }

  run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    const interp = this._interpreter || 'python3';
    const script = this._findMainPython(cwd) || 'main.py';

    const startTime = Date.now();
    return new Promise((resolve) => {
      const proc = spawn(interp, [script, ...(args ?? [])], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.PYTHON,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          command: `${interp} ${script} ${(args ?? []).join(' ')}`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.PYTHON, error: 'Failed to spawn interpreter' }));
    });
  }

  test(cwd: string): Promise<EngineTaskResult> {
    const testCmd = this.config?.testCommand || 'pytest';
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = spawn(testCmd, ['--tb=short', '-q'], { cwd });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(stdout, stderr);
        resolve({
          success: code === 0,
          language: Language.PYTHON,
          output: stdout,
          error: stderr,
          exitCode: code ?? undefined,
          problems,
          command: `${testCmd} --tb=short -q`,
          duration: Date.now() - startTime,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.PYTHON, error: 'Failed to spawn test runner' }));
    });
  }

  format(cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    const startTime = Date.now();
    // Try ruff format first, fallback to black
    if (this._detectBinary('ruff')) {
      return this._runRuffFormat(cwd, startTime);
    }
    if (this._detectBinary('black')) {
      return this._runBlackFormat(cwd, startTime);
    }
    return Promise.resolve({
      success: false,
      language: Language.PYTHON,
      error: 'No Python formatter found (ruff, black)',
    });
  }

  lint(cwd: string): Promise<EngineTaskResult> {
    const startTime = Date.now();
    // Try ruff check first, fallback to flake8 / mypy
    if (this._detectBinary('ruff')) {
      return this._runRuffLint(cwd, startTime);
    }
    if (this._detectBinary('flake8')) {
      return this._runFlake8Lint(cwd, startTime);
    }
    if (this._detectBinary('mypy')) {
      return this._runMypyLint(cwd, startTime);
    }
    return Promise.resolve({
      success: false,
      language: Language.PYTHON,
      error: 'No Python linter found (ruff, flake8, mypy)',
    });
  }

  parseProblems(output: string, stderr?: string): Problem[] {
    const combined = (output || stderr || '').trim();
    if (!combined) return [];

    const problems: Problem[] = [];
    // Traceback format: File "path", line N
    // Also supports: path:line: message
    const linePattern = /(.+?):(\d+):?\s*(error|warning|Error|Warning|Traceback.*):?\s*(.*)/;
    const tracebackPattern = /File\s+"([^"]+)",\s*line\s*(\d+)/;

    for (const line of combined.split('\n')) {
      let match = line.match(tracebackPattern);
      if (match) {
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: 0,
          severity: ProblemSeverity.ERROR,
          message: 'Traceback location',
          tool: 'python',
        });
        continue;
      }
      match = line.match(linePattern);
      if (match) {
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: 0,
          severity: /error/i.test(match[3]) ? ProblemSeverity.ERROR : ProblemSeverity.WARNING,
          message: match[4] || line,
          tool: 'python',
        });
      }
    }
    return problems;
  }

  detectBuildSystem(root: string): BuildSystem {
    if (existsSync(join(root, 'pyproject.toml'))) return BuildSystem.AUTO;
    if (existsSync(join(root, 'setup.py'))) return BuildSystem.AUTO;
    if (existsSync(join(root, 'setup.cfg'))) return BuildSystem.AUTO;
    if (existsSync(join(root, 'Makefile'))) return BuildSystem.MAKE;
    return BuildSystem.AUTO;
  }

  detectInstallSystem(root: string): InstallSystem {
    if (this._detectBinary('pip') || this._detectBinary('pip3')) return InstallSystem.PIP;
    if (this._detectBinary('pipx')) return InstallSystem.PIP;
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
      spawn(name, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'], shell: false }).on('close', () => {});
      return true;
    } catch {
      return false;
    }
  }

  private _findPythonFiles(cwd: string): string[] {
    const files: string[] = [];
    function searchRecursive(dir: string): void {
      try {
        const entries = readdirSync(cwd, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !['node_modules', '__pycache__', '.git', '.venv', 'venv'].includes(e.name)) {
            searchRecursive(join(cwd, e.name));
          } else if (e.isFile() && e.name.endsWith('.py')) {
            files.push(join(cwd, e.name));
          }
        }
      } catch { /* ignore */ }
    }
    searchRecursive(cwd);
    return files;
  }

  private _findMainPython(cwd: string): string | null {
    for (const name of ['main.py', 'app.py']) {
      if (existsSync(join(cwd, name))) return name;
    }
    return this._findPythonFiles(cwd)[0] || null;
  }

  private _runRuffFormat(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('ruff', ['format', '.'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.PYTHON,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.PYTHON, error: 'Failed to spawn ruff' }));
    });
  }

  private _runBlackFormat(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('black', ['.'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: Language.PYTHON,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.PYTHON, error: 'Failed to spawn black' }));
    });
  }

  private _runRuffLint(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('ruff', ['check', '.'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(out, err);
        resolve({
          success: code === 0,
          language: Language.PYTHON,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          problems,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.PYTHON, error: 'Failed to spawn ruff' }));
    });
  }

  private _runFlake8Lint(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('flake8', ['.'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(out, err);
        resolve({
          success: code === 0,
          language: Language.PYTHON,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          problems,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.PYTHON, error: 'Failed to spawn flake8' }));
    });
  }

  private _runMypyLint(cwd: string, start: number): Promise<EngineTaskResult> {
    return new Promise((resolve) => {
      const proc = spawn('mypy', ['.'], { cwd });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        const problems = this.parseProblems(out, err);
        resolve({
          success: code === 0,
          language: Language.PYTHON,
          output: out,
          error: err,
          exitCode: code ?? undefined,
          problems,
          duration: Date.now() - start,
        });
      });
      proc.on('error', () => resolve({ success: false, language: Language.PYTHON, error: 'Failed to spawn mypy' }));
    });
  }
}
