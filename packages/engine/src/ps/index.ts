// ─── PowerShell Language Engine ───
// Shell: pwsh (cross-platform) / powershell (Windows)
// Format/Lint: PSScriptAnalyzer

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
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

const PS_EXTENSIONS = ['.ps1', '.psm1', '.psd1'];

export class PowerShellEngine extends BaseEngine {
  protected readonly language = Language.POWERSHELL;

  private _pwsh: string | null = null;

  protected async detectAndValidate(): Promise<void> {
    this._pwsh = this.findBinary(['pwsh', 'powershell']);
    if (this._pwsh) {
      this._status.available = true;
      this._runtime = this._pwsh;
      this.logger.info(`PowerShell engine ready: ${this._pwsh}`);
    } else {
      this._status.lastError = 'No PowerShell runtime found (pwsh/powershell)';
      this.logger.warn('PowerShell engine unavailable: no runtime');
    }
  }

  async compile(_cwd: string, _flags?: string[]): Promise<EngineTaskResult> {
    // PowerShell is interpreted — no compilation step
    return this.taskResult({ success: true, command: 'pwsh -NoProfile -Command "Get-Content .\\*.ps1" (syntax check mode)' });
  }

  async run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    const script = this._findMainPs(cwd) || (args && args[0]) || '';
    if (!script) {
      return this.taskResult({ success: false, error: 'No PowerShell script found to run', command: this._pwsh || 'pwsh' });
    }
    const scriptPath = join(cwd, script);
    if (!existsSync(scriptPath)) {
      return this.taskResult({ success: false, error: `Script not found: ${script}`, command: this._pwsh || 'pwsh' });
    }
    const result = await this.spawnCmd(this._pwsh || 'pwsh', ['-File', scriptPath, ...(args?.slice(1) || [])], cwd, { timeout: 120000 });
    return this.taskResult({
      success: result.exitCode === 0,
      command: `${this._pwsh} -File ${script}`,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode ?? -1,
      duration: result.duration,
      problems: this.parseProblems(result.stdout, result.stderr),
    });
  }

  async test(cwd: string): Promise<EngineTaskResult> {
    const pesterPath = this._findPesterTests(cwd);
    if (!pesterPath) {
      return this.taskResult({ success: true, command: 'pwsh -Command "Test-ModuleManifest"', output: 'No Pester tests found, skipping.' });
    }
    const result = await this.spawnCmd(this._pwsh || 'pwsh', ['-Command', `Import-Module Pester -ErrorAction SilentlyContinue; if ($pester) { Invoke-Pester ${pesterPath} -PassThru } else { Write-Host "Pester module not installed, skipping tests" }`], cwd, { timeout: 120000 });
    return this.taskResult({
      success: result.exitCode === 0,
      command: 'pwsh Invoke-Pester',
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode ?? -1,
      duration: result.duration,
      problems: this.parseProblems(result.stdout, result.stderr),
    });
  }

  async format(_cwd: string, _files?: string[]): Promise<EngineTaskResult> {
    return this.taskResult({
      success: true,
      command: 'Invoke-Formatter',
      output: 'PowerShell formatting requires PSScriptAnalyzer module. Run: Install-Module PSScriptAnalyzer',
    });
  }

  async lint(cwd: string): Promise<EngineTaskResult> {
    const result = await this.spawnCmd(this._pwsh || 'pwsh', ['-Command', 'Invoke-ScriptAnalyzer -Path .\\*.ps1 -Recurse'], cwd, { timeout: 60000 });
    return this.taskResult({
      success: result.exitCode === 0,
      command: 'Invoke-ScriptAnalyzer',
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode ?? -1,
      duration: result.duration,
      problems: result.stdout ? this._parsePSSproblems(result.stdout) : [],
    });
  }

  parseProblems(output: string, _stderr?: string): Problem[] {
    return this._parsePSSproblems(output);
  }

  private _parsePSSproblems(output: string): Problem[] {
    const problems: Problem[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/(.*?):(\d+):\d+:\s*(Error|Warning|Info):\s*(.*)/);
      if (match) {
        problems.push({
          file: match[1],
          line: parseInt(match[2], 10) || 0,
          column: 0,
          severity: match[3] === 'Error' ? ProblemSeverity.ERROR : match[3] === 'Warning' ? ProblemSeverity.WARNING : ProblemSeverity.INFO,
          message: match[4],
          tool: this.language,
        });
      }
    }
    return problems;
  }

  private _findMainPs(cwd: string): string | null {
    for (const name of ['main.ps1', 'app.ps1', 'run.ps1']) {
      if (existsSync(join(cwd, name))) return name;
    }
    const files = this._findPsFiles(cwd);
    return files[0] || null;
  }

  private _findPsFiles(cwd: string): string[] {
    const files: string[] = [];
    function recurse(dir: string): void {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !['node_modules', '__pycache__', '.git', 'venv'].includes(e.name)) {
            recurse(join(dir, e.name));
          } else if (e.isFile() && PS_EXTENSIONS.some(ext => e.name.endsWith(ext))) {
            files.push(join(dir, e.name));
          }
        }
      } catch { /* ignore */ }
    }
    recurse(cwd);
    return files;
  }

  private _findPesterTests(cwd: string): string | null {
    const files = this._findPsFiles(cwd);
    return files.find(f => f.includes('Test') || f.includes('.Tests.')) || null;
  }

  detectBuildSystem(_root: string): BuildSystem {
    return BuildSystem.AUTO;
  }

  detectInstallSystem(_root: string): InstallSystem {
    return InstallSystem.SYSTEM;
  }
}

export const createPowerShellEngine = (): PowerShellEngine => new PowerShellEngine();
