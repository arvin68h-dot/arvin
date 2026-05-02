#!/usr/bin/env node
/**
 * CodeEngine 文档同步工具
 *
 * 作用：自动检测代码变更，同步更新操作手册。
 *
 * 使用方式：
 *   1. 正常模式（dry-run）: node scripts/docs-sync.ts
 *      → 只显示变更，不修改文件
 *   2. 实际更新: node scripts/docs-sync.ts --apply
 *      → 修改手册文件
 *   3. 自动提交: node scripts/docs-sync.ts --apply --auto-commit
 *      → 修改手册并 git commit
 *
 * 工作原理：
 *   1. 获取 git diff（上次提交到当前）
 *   2. 用 doc-parser.ts 解析变更
 *   3. 用 doc-updater.ts 更新手册
 *   4. （可选）自动 git add + commit
 */

import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── 命令行参数解析 ───

function parseArgs(): { dryRun: boolean; autoCommit: boolean; from?: string; to?: string } {
  const args = process.argv.slice(2);
  
  // 默认 dry-run
  let dryRun = !args.includes('--apply');
  let autoCommit = args.includes('--auto-commit');
  let from: string | undefined;
  let to: string | undefined;

  // 如果 --apply 后面还有 --dry-run，覆盖
  if (args.includes('--dry-run')) {
    dryRun = true;
  }

  // 从/to 参数
  const fromIdx = args.indexOf('--from');
  if (fromIdx >= 0 && args[fromIdx + 1]) {
    from = args[fromIdx + 1];
  }

  const toIdx = args.indexOf('--to');
  if (toIdx >= 0 && args[toIdx + 1]) {
    to = args[toIdx + 1];
  }

  return { dryRun, autoCommit, from, to };
}

// ─── Git 操作 ───

/**
 * 获取当前最新提交
 */
function getLatestCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

/**
 * 检查是否有未提交的修改
 */
function hasUncommittedChanges(): boolean {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * 执行 git commit
 */
function gitCommit(message: string): void {
  try {
    execSync(`git add docs/操作手册.md`, { stdio: 'pipe' });
    execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
    console.log(`[docs-sync] 已提交: ${message}`);
  } catch (err) {
    console.error(`[docs-sync] git commit 失败: ${(err as Error).message}`);
  }
}

// ─── 文档同步核心 ───

/**
 * 从 git diff 获取变更的 JSON
 */
function getChangeJson(from: string, to: string): string {
  try {
    const parserPath = path.join(process.cwd(), 'scripts', 'doc-parser.ts');
    const tsNodePath = path.join(process.cwd(), 'node_modules', '.bin', 'ts-node');
    const npxPath = path.join(process.cwd(), 'node_modules', '.bin', 'npx');

    // 尝试用 ts-node（如果有）
    if (fs.existsSync(tsNodePath)) {
      const result = execSync(
        `${tsNodePath} ${parserPath} ${from} ${to} --json`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      // 提取 JSON 部分（在 "--- JSON ---" 标记之后）
      const jsonIdx = result.indexOf('--- JSON ---');
      if (jsonIdx >= 0) {
        return result.slice(jsonIdx + '--- JSON ---'.length).trim();
      }
    }

    // 尝试用 npx ts-node
    const result = execSync(
      `npx ts-node ${parserPath} ${from} ${to} --json`,
      { encoding: 'utf-8', stdio: 'pipe', timeout: 30000 }
    );
    const jsonIdx = result.indexOf('--- JSON ---');
    if (jsonIdx >= 0) {
      return result.slice(jsonIdx + '--- JSON ---'.length).trim();
    }
  } catch (err) {
    // 如果解析失败，尝试手动构造简化 diff
    console.error(`[docs-sync] 解析器执行失败，使用简化模式: ${(err as Error).message}`);
  }

  // 简化模式：只列出变更文件
  try {
    const changedFiles = execSync(
      `git diff --name-only ${from} ${to} -- packages/ cli/ src/`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    if (!changedFiles) {
      return '[]';
    }

    // 按类型分类文件
    const schemaFiles: string[] = [];
    const cliFiles: string[] = [];
    const configFiles: string[] = [];
    const otherFiles: string[] = [];

    for (const file of changedFiles.split('\n').filter(Boolean)) {
      if (file.includes('storage') && (file.includes('migration') || file.includes('index'))) {
        schemaFiles.push(file);
      } else if (file.includes('cli') && file.includes('command')) {
        cliFiles.push(file);
      } else if (file.includes('config')) {
        configFiles.push(file);
      } else {
        otherFiles.push(file);
      }
    }

    const changes: any[] = [];
    if (schemaFiles.length > 0) {
      changes.push({ type: 'schema', file: schemaFiles[0], summary: `数据库变更 (${schemaFiles.length} 个文件)`, details: schemaFiles });
    }
    if (cliFiles.length > 0) {
      changes.push({ type: 'cli', file: cliFiles[0], summary: `CLI 命令变更 (${cliFiles.length} 个文件)`, details: cliFiles });
    }
    if (configFiles.length > 0) {
      changes.push({ type: 'config', file: configFiles[0], summary: `配置变更 (${configFiles.length} 个文件)`, details: configFiles });
    }
    if (otherFiles.length > 0) {
      changes.push({ type: 'feature', file: otherFiles[0], summary: `功能变更 (${otherFiles.length} 个文件)`, details: otherFiles });
    }

    return JSON.stringify(changes);
  } catch {
    return '[]';
  }
}

// ─── 执行文档同步 ───

async function runSync(dryRun: boolean, autoCommit: boolean): Promise<void> {
  console.log('[docs-sync] 开始文档同步\n');

  // 检查是否有需要分析的变更
  const latest = getLatestCommit();
  let from: string;
  let to = 'HEAD';

  if (latest) {
    from = `${latest}~1`;
  } else {
    console.log('[docs-sync] 首次提交，跳过差异分析');
    from = '';
  }

  if (!from) {
    console.log('[docs-sync] 无历史提交，跳过同步');
    return;
  }

  // 获取变更 JSON
  console.log(`[docs-sync] 分析变更: ${from} → ${to}`);
  const json = getChangeJson(from, to);

  // 检查手册是否存在
  const manualPath = path.join(process.cwd(), 'docs', '操作手册.md');
  if (!fs.existsSync(manualPath)) {
    console.error('[docs-sync] 操作手册未找到，请先创建');
    process.exit(1);
  }

  // 获取手册原始内容用于比较
  const originalContent = fs.readFileSync(manualPath, 'utf-8');
  console.log(`[docs-sync] 当前手册: ${manualPath}`);
  console.log(`[docs-sync] 手册行数: ${originalContent.split('\n').length}\n`);

  // 运行更新器
  const updaterPath = path.join(process.cwd(), 'scripts', 'doc-updater.ts');
  
  const updaterProcess = spawn(
    process.platform === 'win32' ? 'node' : 'node',
    [updaterPath, dryRun ? '' : '--output', ''],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_PATH: path.join(process.cwd(), 'node_modules') },
    }
  );

  // 发送 JSON 数据到更新器
  updaterProcess.stdin.write(json);
  updaterProcess.stdin.end();

  // 收集输出
  let stdout = '';
  let stderr = '';
  updaterProcess.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  updaterProcess.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

  // 等待完成
  await new Promise<void>((resolve) => {
    updaterProcess.on('close', (code) => {
      if (code === 0 && stdout) {
        const newContent = stdout.trim();
        
        // 检查是否有实际变更
        if (newContent === originalContent) {
          console.log('[docs-sync] 无需要更新的内容');
        } else {
          // 有变更
          console.log(`[docs-sync] 检测到文档变更`);
          console.log(`[docs-sync] 新文档行数: ${newContent.split('\n').length}`);
          console.log(`[docs-sync] 旧文档行数: ${originalContent.split('\n').length}\n`);

          if (dryRun) {
            console.log('[docs-sync] ===== dry-run 模式，不写入文件 =====\n');
            console.log('[docs-sync] 变更预览:\n');
            // 简单显示新增行
            const origLines = originalContent.split('\n');
            const newLines = newContent.split('\n');
            let added = 0;
            for (let i = 0; i < newLines.length; i++) {
              if (i >= origLines.length || newLines[i] !== origLines[i]) {
                added++;
                if (added <= 20) {
                  console.log(`  + ${newLines[i]}`);
                }
              }
            }
            if (added > 20) console.log(`  ... 以及 ${added - 20} 行更多变更`);
            console.log(`\n[docs-sync] 使用 --apply 参数写入实际变更`);
          } else {
            // 写入文件
            fs.writeFileSync(manualPath, newContent, 'utf-8');
            console.log(`[docs-sync] 手册已更新: ${manualPath}`);

            if (autoCommit) {
              console.log('\n[docs-sync] 正在自动提交...');
              const date = new Date().toISOString().split('T')[0];
              const verMatch = stdout.match(/v(\d+\.\d+\.\d+)/);
              const version = verMatch ? verMatch[1] : 'NEXT';
              gitCommit(`docs: 同步操作手册 v${version} (${date})`);
            }
          }
        }
      } else {
        console.error(`[docs-sync] 更新器失败 (exit ${code})`);
        if (stderr) console.error(stderr);
      }
      resolve();
    });
  });

  if (stderr && dryRun) {
    console.log(`\n[docs-sync] stderr: ${stderr}`);
  }
}

// ─── 主入口 ───

function main(): void {
  const { dryRun, autoCommit } = parseArgs();

  if (dryRun) {
    console.log('[docs-sync] 模式: dry-run（预览变更，不写入文件）');
  } else {
    console.log('[docs-sync] 模式: apply（实际更新文件）');
    if (autoCommit) {
      console.log('[docs-sync] 自动提交: 开启\n');
    }
  }

  runSync(dryRun, autoCommit).catch(err => {
    console.error(`\n[docs-sync] 同步失败: ${err.message}`);
    process.exit(1);
  });
}

main();
