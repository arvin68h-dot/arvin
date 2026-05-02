// ─── CATIA Language Engine ───
// Platform: Windows (CATIA V5/V6)
// Scripts: CATScript (.cls, .CATScript), VBA (.cls)
// Note: CATIA runs as an external application; this engine provides
// support for writing, formatting, and validating CATIA automation scripts.

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const CATIA_EXTENSIONS = ['.CATPart', '.CATProduct', '.CATDrawing', '.cls', '.CATScript', '.vba', '.catvba'];
const CATIA_SCRIPT_EXTENSIONS = ['.CATScript', '.cls', '.vba'];

// Common CATIA API patterns for linting
const CATIA_API_KEYWORDS = [
  'CreateDatum', 'CreatePoint', 'CreateLine', 'CreateArc', 'CreateSketch',
  'CreatePad', 'CreatePocket', 'CreateRevolution', 'CreateHole',
  'GetTechnicalDrawings', 'GetCATIPrtPart', 'GetCATISpecObjectAttribute',
  'HybridShape', 'Body', 'Part', 'Product', 'Selection', 'Document',
  'CreateDatumArray', 'CreateShape', 'CreateBody', 'GetOwner',
  'MoveTo2dElement', 'MoveTo3dElement',
];

const CATIA_FORBIDDEN_PATTERNS = [
  // Common pitfalls
  /\bwhile\s+\(?\s*true\s*\)?/gi,  // infinite loop risk
  /System\.Exit\b/,                  // should use CATIA Quit
  /Process\.Start\b/,               // unsafe external execution
];

export class CatiaEngine extends BaseEngine {
  protected readonly language = Language.CATIA;

  private _catiaPath: string | null = null;

  protected async detectAndValidate(): Promise<void> {
    // CATIA only runs on Windows; try to detect it
    if (process.platform === 'win32') {
      this._catiaPath = this.findBinary(['catv5', 'catia', 'startcat']);
    }
    this._status.available = !!this._catiaPath;
    this._runtime = this._catiaPath;
    if (this._catiaPath) {
      this.logger.info(`CATIA engine ready: ${this._catiaPath}`);
    } else {
      this.logger.info('CATIA engine: running in compatibility mode (no CATIA installed)');
      this._status.available = true; // Still available for scripting support
      this._status.version = 'compatibility';
    }
  }

  async compile(_cwd: string, _flags?: string[]): Promise<EngineTaskResult> {
    // CATScript is interpreted — no compilation step
    return this.taskResult({
      success: true,
      command: 'CATScript syntax check',
      output: 'CATScript is interpreted; use lint() for validation.',
    });
  }

  async run(cwd: string, args?: string[]): Promise<EngineTaskResult> {
    if (!this._catiaPath) {
      return this.taskResult({
        success: false,
        error: 'CATIA is not installed. CATScript can only be run inside CATIA application on Windows.',
        command: 'catia',
      });
    }
    const script = this._findMainScript(cwd) || (args && args[0]) || '';
    if (!script) {
      return this.taskResult({ success: false, error: 'No CATScript found' });
    }
    // CATIA runs scripts internally; external execution is limited
    return this.taskResult({
      success: false,
      error: 'CATScript requires CATIA application to execute. Use CATIA\'s macro runner.',
      command: `catia -script ${script}`,
    });
  }

  async test(cwd: string): Promise<EngineTaskResult> {
    const scripts = this._findCatiaScripts(cwd);
    if (scripts.length === 0) {
      return this.taskResult({ success: true, output: 'No CATScript files found to test.' });
    }
    // Run lint checks on test files
    const lintResult = await this.lint(cwd);
    return this.taskResult({
      success: !(lintResult.problems && lintResult.problems.filter(p => p.severity === ProblemSeverity.ERROR).length > 0),
      command: 'catia-test (lint-based)',
      output: lintResult.output,
      problems: lintResult.problems,
      duration: lintResult.duration,
    });
  }

  async format(cwd: string, files?: string[]): Promise<EngineTaskResult> {
    const targets = files || this._findCatiaScripts(cwd);
    const formattedFiles: string[] = [];
    for (const file of targets) {
      const fullPath = join(cwd, file);
      if (!existsSync(fullPath)) continue;
      const content = readFileSync(fullPath, 'utf-8');
      const formattedContent = this._formatCatiaContent(content);
      writeFileSync(fullPath, formattedContent, 'utf-8');
      formattedFiles.push(file);
    }
    return this.taskResult({
      success: true,
      command: `catia-format ${targets.length} files`,
      output: `Formatted ${targets.length} files`,
    });
  }

  async lint(cwd: string): Promise<EngineTaskResult> {
    const scripts = this._findCatiaScripts(cwd);
    const problems: Problem[] = [];

    for (const script of scripts) {
      const fullPath = join(cwd, script);
      if (!existsSync(fullPath)) continue;
      const content = readFileSync(fullPath, 'utf-8');
      const fileProblems = this._lintCatiaScript(script, content);
      problems.push(...fileProblems);
    }

    return this.taskResult({
      success: problems.filter(p => p.severity === ProblemSeverity.ERROR).length === 0,
      command: `catia-lint ${scripts.length} files`,
      problems,
      output: problems.length === 0 ? 'No issues found.' : `${problems.length} issue(s) found.`,
    });
  }

  parseProblems(output: string, _stderr?: string): Problem[] {
    return this._parseCatiaProblems(output);
  }

  // ── CATIA-specific helpers ──

  /** Returns available CATIA API knowledge (reference) */
  getApiKnowledge(): string[] {
    return [
      'Part: GetTechnicalDrawings(), GetProduct(), GetPart()',
      'HybridShape: CreatePoint(), CreateLine(), CreateArc(), CreateDatum()',
      'Body: CreatePad(), CreatePocket(), CreateRevolution(), CreateHole()',
      'Selection: CreateSelection(), Add(), Clear(), Search()',
      'Document: GetActiveDocument(), Save(), SaveAs(), Close()',
    ];
  }

  /** Generate a CATScript snippet for creating a feature */
  generateFeature(type: string, name: string): string {
    const templates: Record<string, string> = {
      point: `Dim point1 As HybridShapePointCoord
Set point1 = hybridShapeFactory1.AddNewPointCoord(0#, 0#, 0#)
point1.Name = "${name}"
hybridShapeBody1.AddHybridShape point1`,
      line: `Dim line1 As HybridShapePointPoint
Set line1 = hybridShapeFactory1.AddNewPointPoint(0#, 0#, 0#, 0#, 0#, 0#)
line1.Name = "${name}"
hybridShapeBody1.AddHybridShape line1`,
      pad: `Dim pad1 As HybridShapePad
Set pad1 = hybridShapeFactory1.AddNewPadFromCurve(hybridSketch1)
pad1.Name = "${name}"
hybridShapeBody1.AddHybridShape pad1`,
      hole: `Dim hole1 As HybridShapeHole
Set hole1 = hybridShapeFactory1.AddNewHole(hybridSketch1)
hole1.Name = "${name}"
hybridShapeBody1.AddHybridShape hole1`,
    };
    return templates[type.toLowerCase()] || `' ${type} "${name}" — not implemented yet`;
  }

  // ── Internal methods ──

  private _lintCatiaScript(filePath: string, content: string): Problem[] {
    const problems: Problem[] = [];
    const lines = content.split('\n');
    let lineNum = 0;

    for (const line of lines) {
      lineNum++;
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("'") || trimmed.startsWith('REM ')) continue;

      // Check for dangerous patterns
      for (const pattern of CATIA_FORBIDDEN_PATTERNS) {
        if (pattern.test(trimmed)) {
          problems.push({
            file: filePath,
            line: lineNum,
            column: 0,
            severity: ProblemSeverity.WARNING,
            message: `Dangerous pattern detected: ${pattern.source}`,
            tool: this.language,
          });
        }
      }

      // Check for common CATIA API usage errors
      if (trimmed.includes('Set ') && !trimmed.includes('=') && !trimmed.includes('Dim')) {
        problems.push({
          file: filePath,
          line: lineNum,
          column: 0,
          severity: ProblemSeverity.INFO,
          message: 'Set statement without Dim declaration — consider adding type declaration',
          tool: this.language,
        });
      }
    }

    return problems;
  }

  private _parseCatiaProblems(output: string): Problem[] {
    const problems: Problem[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/(.*?):(\d+):\s*(Error|Warning|Info):\s+(.*)/);
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

  private _formatCatiaContent(content: string): string {
    const lines = content.split('\n');
    return lines
      .map(line => {
        let trimmed = line.replace(/\t/g, '    ');
        // Trim trailing whitespace
        return trimmed.trimEnd();
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n';
  }

  private _findMainScript(cwd: string): string | null {
    for (const name of ['main.CATScript', 'run.CATScript', 'init.cls']) {
      if (existsSync(join(cwd, name))) return name;
    }
    const scripts = this._findCatiaScripts(cwd);
    return scripts[0] || null;
  }

  private _findCatiaScripts(cwd: string): string[] {
    const files: string[] = [];
    function recurse(dir: string): void {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !['node_modules', '__pycache__', '.git', 'venv'].includes(e.name)) {
            recurse(join(dir, e.name));
          } else if (e.isFile() && CATIA_SCRIPT_EXTENSIONS.some(ext => e.name.endsWith(ext))) {
            files.push(join(dir, e.name));
          }
        }
      } catch { /* ignore */ }
    }
    recurse(cwd);
    return files;
  }

  detectBuildSystem(_root: string): BuildSystem {
    return BuildSystem.AUTO;
  }

  detectInstallSystem(_root: string): InstallSystem {
    return InstallSystem.SYSTEM;
  }
}

export const createCatiaEngine = (): CatiaEngine => new CatiaEngine();
