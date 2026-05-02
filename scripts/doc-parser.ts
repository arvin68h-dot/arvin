#!/usr/bin/env node
/**
 * CodeEngine 文档同步 - 解析器
 *
 * 作用：从 git diff 中解析变更内容，识别需要更新手册的地方。
 *
 * 使用方式：
 *   1. 手动：node scripts/doc-parser.ts HEAD~1 HEAD
 *   2. 自动：由 docs-sync.ts 调用
 *
 * 输出格式：
 *   { changes: Change[] }
 *
 * 变更类型：
 *   - schema: 数据库表结构变更（CREATE TABLE, ALTER TABLE）
 *   - cli: CLI 命令变更（command(), addCommand()）
 *   - config: 配置项变更（env:, CONFIG:, settings）
 *   - version: 版本号变更
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';

// ─── 类型定义 ───

interface Change {
  type: 'schema' | 'cli' | 'config' | 'version' | 'feature';
  file: string;
  summary: string;
  details: string[];
}

interface ParseResult {
  changes: Change[];
  diff: string;
  fromCommit: string;
  toCommit: string;
}

// ─── Git 差异获取 ───

/**
 * 获取两个 git 提交之间的差异
 * @param from — 起始提交（如 HEAD~1）
 * @param to   — 目标提交（如 HEAD）
 * @returns 完整的 git diff 字符串
 */
function getDiff(from: string, to: string): string {
  try {
    return execSync(
      `git diff ${from} ${to} -- src/ packages/ cli/`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
  } catch (err) {
    console.error(`[doc-parser] 获取 diff 失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * 获取两个提交之间的文件名列表
 */
function getChangedFiles(from: string, to: string): string[] {
  try {
    const output = execSync(
      `git diff --name-only ${from} ${to} -- packages/ cli/ src/`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    return output ? output.split('\n').filter(f => f.endsWith('.ts') || f.endsWith('.tsx')) : [];
  } catch {
    return [];
  }
}

// ─── 变更解析 ───

/**
 * 从 diff 中提取变更的文件和行内容
 */
function parseDiffLines(diff: string): Array<{ file: string; lines: string[] }> {
  const result: Array<{ file: string; lines: string[] }> = [];
  const fileRegex = /^diff --git a\/(.+?) b\/(.+?)$/gm;
  let match;

  while ((match = fileRegex.exec(diff)) !== null) {
    const file = match[2];
    if (!file) continue;
    // 提取该文件的变更行
    const fileDiff = diff.slice(match.index + match[0].length);
    const nextMatch = fileRegex.exec(diff);
    const endPos = nextMatch ? nextMatch.index : fileDiff.length;
    const lines = fileDiff.slice(0, endPos)
      .split('\n')
      .filter(l => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'))
      .map(l => l.slice(1));
    if (lines.length > 0) {
      result.push({ file, lines });
    }
  }
  return result;
}

// ─── 变更分类 ───

/**
 * 检查变更是否涉及数据库表结构
 */
function analyzeSchemaChange(lines: string[]): string[] {
  const findings: string[] = [];
  const tablePatterns = [
    /CREATE\s+TABLE\s+(\w+)/i,
    /ALTER\s+TABLE\s+(\w+)\s+(ADD|DROP|MODIFY|RENAME)\s+/i,
    /DROP\s+TABLE\s+(\w+)/i,
    /CREATE\s+INDEX\s+(\w+)/i,
  ];
  for (const line of lines) {
    for (const pattern of tablePatterns) {
      const m = line.match(pattern);
      if (m) {
        const action = line.includes('CREATE') ? '新增' : line.includes('DROP') ? '删除' : '修改';
        findings.push(`${action}数据库对象: ${m[1]}`);
      }
    }
  }
  return findings;
}

/**
 * 检查变更是否涉及 CLI 命令
 */
function analyzeCliChange(lines: string[]): string[] {
  const findings: string[] = [];
  const commandPatterns = [
    /command\(\s*['"](\w[\w-]*)['"]/,
    /addCommand\(\s*['"](\w[\w-]*)['"]/,
    /\.command\(\s*['"](\w[\w-]*)['"]/,
    /export\s+async\s+function\s+run\(\),
    /console\.log\(`\s*(?:.+?\s+)?(?:用法|命令|参数|例子|示例):/,
  ];
  for (const line of lines) {
    for (const pattern of commandPatterns) {
      const m = line.match(pattern);
      if (m && m[1] && !m[1].startsWith('//')) {
        findings.push(`CLI 命令变更: ${m[1]}`);
      }
    }
  }
  return findings;
}

/**
 * 检查变更是否涉及配置项
 */
function analyzeConfigChange(lines: string[]): string[] {
  const findings: string[] = [];
  const configPatterns = [
    /['"]?ENV['"]?\s*[=:]?\s*['"](\w+)/,
    /['"]?CONFIG['"]?\s*[=:]?\s*['"](\w+)/,
    /['"]?settings['"]?\s*[.:]\s*\{/,
    /addSetting\(/,
    /process\.env\.(\w+)/,
    /['"]codengine_email_host['"]/,
  ];
  for (const line of lines) {
    for (const pattern of configPatterns) {
      const m = line.match(pattern);
      if (m && m[1]) {
        findings.push(`配置变更: ${m[1]}`);
      }
    }
  }
  return findings;
}

/**
 * 检查变更是否涉及版本
 */
function analyzeVersionChange(lines: string[]): string[] {
  const findings: string[] = [];
  const versionPatterns = [
    /['"]?version['"]?\s*:\s*['"](\d+\.\d+\.\d+)['"]/,
    /==\s*v?(\d+\.\d+\.\d+)\s*==/,
    /# v?(\d+\.\d+\.\d+)/,
  ];
  for (const line of lines) {
    for (const pattern of versionPatterns) {
      const m = line.match(pattern);
      if (m && m[1]) {
        findings.push(`版本变更: ${m[1]}`);
      }
    }
  }
  return findings;
}

// ─── 主解析函数 ───

/**
 * 解析 git diff，提取需要更新文档的变更
 * @param from — 起始提交
 * @param to   — 目标提交
 * @returns 变更列表
 */
export function parseChanges(from: string, to: string): ParseResult {
  const diff = getDiff(from, to);
  const files = parseDiffLines(diff);

  const changes: Change[] = [];

  for (const { file, lines } of files) {
    // 跳过测试文件和 JS 编译文件
    if (file.includes('/tests/') || file.includes('/tests-') || file.endsWith('.d.ts')) {
      continue;
    }

    const schema = analyzeSchemaChange(lines);
    const cli = analyzeCliChange(lines);
    const config = analyzeConfigChange(lines);
    const version = analyzeVersionChange(lines);

    if (schema.length > 0) {
      changes.push({
        type: 'schema',
        file,
        summary: `数据库结构变更 (${file.split('/').pop()})`,
        details: schema,
      });
    }

    if (cli.length > 0) {
      changes.push({
        type: 'cli',
        file,
        summary: `CLI 命令变更 (${file.split('/').pop()})`,
        details: cli,
      });
    }

    if (config.length > 0) {
      changes.push({
        type: 'config',
        file,
        summary: `配置项变更 (${file.split('/').pop()})`,
        details: config,
      });
    }

    if (version.length > 0) {
      changes.push({
        type: 'version',
        file,
        summary: `版本信息变更 (${file.split('/').pop()})`,
        details: version,
      });
    }
  }

  return {
    changes,
    diff,
    fromCommit: from,
    toCommit: to,
  };
}

// ─── 命令行入口 ───

function main(): void {
  const args = process.argv.slice(2);
  const from = args[0] || 'HEAD~1';
  const to = args[1] || 'HEAD';

  console.log(`[doc-parser] 分析变更: ${from} → ${to}\n`);

  const result = parseChanges(from, to);

  console.log(`[doc-parser] 发现 ${result.changes.length} 项变更:\n`);

  if (result.changes.length === 0) {
    console.log('  无需要更新文档的变更');
    return;
  }

  for (const change of result.changes) {
    console.log(`  [${change.type.toUpperCase()}] ${change.summary}`);
    for (const detail of change.details) {
      console.log(`    • ${detail}`);
    }
  }

  // 输出 JSON 格式供更新器使用
  if (args.includes('--json')) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(result.changes, null, 2));
  }
}

if (require.main === module) {
  main();
}
