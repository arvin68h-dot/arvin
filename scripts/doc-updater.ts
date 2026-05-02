#!/usr/bin/env node
/**
 * CodeEngine 文档同步 - 更新器
 *
 * 作用：根据解析的变更，自动更新操作手册。
 *
 * 工作方式：
 *   1. 读取操作手册原文
 *   2. 根据变更类型，在对应章节插入/更新内容
 *   3. 输出到 stdout 或写入文件
 *
 * 使用方式：
 *   1. 从 stdin 接收 JSON 格式的变更列表
 *   2. 读取 docs/操作手册.md 作为模板
 *   3. 输出更新后的内容
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'node:path';

// ─── 类型定义 ───

interface DocChange {
  type: 'schema' | 'cli' | 'config' | 'version' | 'feature';
  file: string;
  summary: string;
  details: string[];
}

// ─── 手册章节锚点 ───

// 操作手册中各个章节的标题锚点
const SECTIONS = {
  版本: '## 版本信息',
  数据库: '## 数据库',
  CLI命令: '## CLI 命令',
  配置: '## 配置项',
  使用流程: '## 使用流程',
  项目结构: '## 项目结构',
};

// ─── 变更格式化 ───

/**
 * 将变更转换为适合插入手册的 Markdown 格式
 */
function formatChangeForDocs(change: DocChange): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString().split('T')[0];

  switch (change.type) {
    case 'schema':
      lines.push(`\n### v${change.details.length > 0 ? change.details[0].match(/\d+\.\d+\.\d+/)?.[0] || 'NEXT' : 'NEXT'} 数据库变更 (${timestamp})`);
      for (const detail of change.details) {
        lines.push(`- ${detail}`);
      }
      lines.push('');
      break;

    case 'cli':
      lines.push(`\n### CLI 新命令/更新 (${timestamp})`);
      for (const detail of change.details) {
        const cmdMatch = detail.match(/CLI 命令变更: (\w[\w-]*)/);
        if (cmdMatch) {
          lines.push(`- **${cmdMatch[1]}** — 此命令已更新或新增`);
        } else {
          lines.push(`- ${detail}`);
        }
      }
      lines.push('');
      break;

    case 'config':
      lines.push(`\n### 配置项变更 (${timestamp})`);
      for (const detail of change.details) {
        const keyMatch = detail.match(/配置变更: (.+)/);
        if (keyMatch) {
          lines.push(`- **${keyMatch[1]}** — 此配置项已更新或新增`);
        } else {
          lines.push(`- ${detail}`);
        }
      }
      lines.push('');
      break;

    case 'version':
      lines.push(`\n### 版本更新 (${timestamp})`);
      for (const detail of change.details) {
        const verMatch = detail.match(/版本变更: (\d+\.\d+\.\d+)/);
        if (verMatch) {
          lines.push(`- 版本号升级为 **v${verMatch[1]}**`);
        } else {
          lines.push(`- ${detail}`);
        }
      }
      lines.push('');
      break;

    case 'feature':
    default:
      lines.push(`\n### 新功能/更新 (${timestamp})`);
      for (const detail of change.details) {
        lines.push(`- ${detail}`);
      }
      lines.push('');
      break;
  }

  return lines.join('\n');
}

// ─── 插入逻辑 ───

/**
 * 在手册中指定锚点后面插入内容
 */
function insertAfterAnchor(content: string, anchor: string, insert: string): string {
  const index = content.indexOf(anchor);
  if (index === -1) {
    // 如果锚点不存在，插入到文档末尾（之前）
    console.error(`  [WARN] 章节锚点 "${anchor}" 未找到，将在末尾追加`);
    return content + insert;
  }
  // 找到锚点所在行的行尾
  const endOfLine = content.indexOf('\n', index);
  if (endOfLine === -1) {
    return content + insert;
  }
  return content.slice(0, endOfLine + 1) + insert + content.slice(endOfLine + 1);
}

/**
 * 处理所有变更并更新手册
 */
function updateManual(changes: DocChange[]): string {
  const manualPath = path.join(process.cwd(), 'docs', '操作手册.md');
  
  if (!fs.existsSync(manualPath)) {
    console.error(`[doc-updater] 操作手册未找到: ${manualPath}`);
    process.exit(1);
  }

  let content = fs.readFileSync(manualPath, 'utf-8');
  let updated = false;

  // 按类型分组变更
  const byType: Record<string, DocChange[]> = {};
  for (const change of changes) {
    if (!byType[change.type]) byType[change.type] = [];
    byType[change.type].push(change);
  }

  // 处理版本变更
  if (byType.version && byType.version.length > 0) {
    const verInsert = formatChangeForDocs(byType.version[0]);
    content = insertAfterAnchor(content, SECTIONS.版本, verInsert);
    updated = true;
  }

  // 处理数据库变更
  if (byType.schema && byType.schema.length > 0) {
    const schemaInsert = byType.schema.map(formatChangeForDocs).join('\n');
    content = insertAfterAnchor(content, SECTIONS.数据库, schemaInsert);
    updated = true;
  }

  // 处理 CLI 变更
  if (byType.cli && byType.cli.length > 0) {
    const cliInsert = byType.cli.map(formatChangeForDocs).join('\n');
    content = insertAfterAnchor(content, SECTIONS.CLI命令, cliInsert);
    updated = true;
  }

  // 处理配置变更
  if (byType.config && byType.config.length > 0) {
    const configInsert = byType.config.map(formatChangeForDocs).join('\n');
    content = insertAfterAnchor(content, SECTIONS.配置, configInsert);
    updated = true;
  }

  // 处理通用功能变更（无特定章节）
  if (byType.feature && byType.feature.length > 0) {
    const featureInsert = byType.feature.map(formatChangeForDocs).join('\n');
    content = insertAfterAnchor(content, SECTIONS.使用流程, featureInsert);
    updated = true;
  }

  // 更新文档修改日期（如果在标题行附近找到日期）
  const dateMatch = content.match(/\n最后更新：(.+)\n/);
  if (dateMatch) {
    const today = new Date().toISOString().split('T')[0];
    content = content.replace(dateMatch[0], `\n最后更新：${today}\n`);
  }

  console.log(`[doc-updater] 手册已更新 (${updated ? '有变更' : '无实质变更'})`);
  return content;
}

// ─── 命令行入口 ───

function main(): void {
  const args = process.argv.slice(2);
  const outputFile = args.includes('--output') || args.includes('-o')
    ? args[args.indexOf('--output') + 1 || args.indexOf('-o') + 1]
    : null;

  // 从 stdin 读取 JSON
  let json = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', chunk => { json += chunk; });
  process.stdin.on('end', () => {
    try {
      const changes: DocChange[] = JSON.parse(json);
      const result = updateManual(changes);
      
      if (outputFile) {
        fs.writeFileSync(outputFile, result, 'utf-8');
        console.log(`[doc-updater] 已写入: ${outputFile}`);
      } else {
        // 输出到 stdout
        console.log(result);
      }
    } catch (err) {
      console.error(`[doc-updater] 解析输入失败: ${(err as Error).message}`);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  main();
}
