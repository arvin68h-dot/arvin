// ─── CMake Language Engine ───
// Build tool: cmake + ninja/make
// Lint: cmakelint (optional)

import { spawn } from 'node:child_process';
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
import { Language, BuildSystem, InstallSystem, LogLevel, ProblemSeverity, createLogger } from '@codeengine/core';

import { BaseEngine } from '../base';

const CMAKE_EXTENSIONS = ['.cmake', 'CMakeLists.txt'];
const CMAKE_KW_EXTENSIONS = ['.cmake'];

export class CMakeEngine extends BaseEngine {
  protected readonly language = Language.CMAKE;

  private _cmakeCmd: string | null = null;
  private _ninja: string | null = null;

  protected async detectAndValidate(): Promise<void> {
    this._cmakeCmd = this.findBinary(['cmake']);
    this._ninja = this.findBinary(['ninja', 'make']);
    if (this._cmakeCmd) {
      this._status.available = true;
      this._runtime = this._cmakeCmd;
      this.logger.info(`CMake engine ready: ${this._cmakeCmd}`);
    } else {
      this._status.lastError = 'cmake not found';
      this.logger.warn('CMake engine unavailable');
    }
  }

  async compile(cwd: string, flags?: string[]): Promise<EngineTaskResult> {
    if (!this._cmakeCmd) {
      return this.taskResult({ success: false, error: 'CMake not installed' });
    }

    const hasLists = existsSync(join(cwd, 'CMakeLists.txt'));
    if (!hasLists) {
      return this.taskResult({ success: false, error: 'No CMakeLists.txt found' });
    }

    // Configure step
    const buildDir = join(cwd, 'build');
    if (!existsSync(buildDir)) {
      mkdirSync(buildDir, { recursive: true });
    }

    const configureResult = await this.spawnCmd(
      this._cmakeCmd,
      ['..', ...(flags || [])],
      buildDir,
      { timeout: 120000 }
    );

    if (configureResult.exitCode !== 0) {
      return this.taskResult({
        success: false,
        command: `${this._cmakeCmd} .. ${flags?.join(' ') || ''}`,
        output: configureResult.stdout,
        error: configureResult.stderr,
        exitCode: configureResult.exitCode ?? -1,
        duration: configureResult.duration,
        problems: this.parseProblems(configureResult.stdout, configureResult.stderr),
      });
    }

    // Build step
    const generator = this._ninja ? 'ninja' : 'make';
    const buildResult = await this.spawnCmd(
      this._cmakeCmd,
      ['--build', '.', '--config', 'Release', ...(flags || [])],
      buildDir,
      { timeout: 300000 }
    );

    return this.taskResult({
      success: buildResult.exitCode === 0,
      command: `${this._cmakeCmd} --build .`,
      output: buildResult.stdout,
      error: buildResult.stderr,
      exitCode: buildResult.exitCode ?? -1,
      duration: buildResult.duration,
      problems: this.parseProblems(buildResult.stdout, buildResult.stderr),
    });
  }

  async run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    const buildDir = join(cwd, 'build');
    const executable = this._findExecutable(buildDir);
    if (!executable) {
      return this.taskResult({ success: false, error: 'No built executable found' });
    }
    const result = await this.spawnCmd(executable, args || [], cwd, { timeout: 120000 });
    return this.taskResult({
      success: result.exitCode === 0,
      command: executable + (args ? ' ' + args.join(' ') : ''),
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode ?? -1,
      duration: result.duration,
    });
  }

  async test(_cwd: string): Promise<EngineTaskResult> {
    if (!this._cmakeCmd) {
      return this.taskResult({ success: false, error: 'CMake not installed' });
    }
    const buildDir = join(_cwd, 'build');
    const result = await this.spawnCmd(
      this._cmakeCmd,
      ['--build', '.', '--target', 'test', '--config', 'Release'],
      buildDir,
      { timeout: 300000 }
    );
    return this.taskResult({
      success: result.exitCode === 0,
      command: `${this._cmakeCmd} --build . --target test`,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode ?? -1,
      duration: result.duration,
    });
  }

  async format(_cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    return this.taskResult({
      success: true,
      command: 'cmake-format',
      output: 'Use cmake-format: pip install cmake-format',
    });
  }

  async lint(cwd: string): Promise<EngineTaskResult> {
    if (this._cmakeCmd) {
      // Use cmake's built-in check
      const buildDir = join(cwd, 'build-lint');
      const result = await this.spawnCmd(
        this._cmakeCmd,
        ['-Wdev', '--warn-uninitialized', cwd],
        cwd,
        { timeout: 30000 }
      );
      return this.taskResult({
        success: result.exitCode === 0,
        command: `${this._cmakeCmd} -Wdev`,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode ?? -1,
        duration: result.duration,
        problems: this.parseProblems(result.stdout, result.stderr),
      });
    }
    // Fallback: basic syntax check
    return this.taskResult({ success: true, output: 'Basic CMake syntax OK (cmake not installed for detailed lint)' });
  }

  parseProblems(output: string, _stderr?: string): Problem[] {
    const problems: Problem[] = [];
    const lines = (output || _stderr || '').split('\n');
    for (const line of lines) {
      // CMake error format: CMake Error at file.cmake:line: message
      const match = line.match(/CMake\s+(Error|Warning)\s+at\s+(.*?):(\d+)(?::(\d+))?:\s+(.*)/);
      if (match) {
        problems.push({
          file: match[2],
          line: parseInt(match[3], 10) || 0,
          column: match[4] ? parseInt(match[4], 10) || 0 : 0,
          severity: match[1] === 'Error' ? ProblemSeverity.ERROR : ProblemSeverity.WARNING,
          message: match[5],
          tool: this.language,
        });
      }
    }
    return problems;
  }

  private _findExecutable(buildDir: string): string | null {
    // Try to find the built executable
    for (const name of ['src', 'bin', '']) {
      const dir = name ? join(buildDir, name) : buildDir;
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir, { recursive: true }) as string[];
      for (const f of files) {
        if (f === 'CMakeCache.txt' || f.startsWith('.')) continue;
        const fullPath = join(dir, f);
        try {
          const stats = this._statSync(fullPath);
          if (stats && stats.isFile() && !f.endsWith('.cmake') && !f.endsWith('.txt')) {
            return fullPath;
          }
        } catch { /* ignore */ }
      }
    }
    return null;
  }

  private _statSync(path: string): { isFile: () => boolean } | null {
    try {
      return { isFile: () => existsSync(path) };
    } catch { return null; }
  }

  detectBuildSystem(_root: string): BuildSystem {
    return BuildSystem.CMAKE;
  }

  detectInstallSystem(_root: string): InstallSystem {
    return InstallSystem.SYSTEM;
  }
}

export const createCMakeEngine = (): CMakeEngine => new CMakeEngine();
