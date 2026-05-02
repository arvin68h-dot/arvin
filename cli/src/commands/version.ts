#!/usr/bin/env node
/**
 * Version 命令 — 显示 CodeEngine 版本信息和运行环境
 *
 * 用法: codeengine version
 *
 * 输出:
 *   CodeEngine v0.1.0
 *   Node.js v22.x.x | Platform: darwin/arm64
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 从 package.json 读取版本信息
let version = '0.1.0';
try {
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  version = pkg.version || version;
} catch {
  // fallback
}

/**
 * 运行版本命令 — 输出 CodeEngine 版本、Node.js 版本和平台信息
 * @param args — 命令行参数数组（忽略，直接输出版本信息）
 */
export async function run(_args: string[]): Promise<void> {
  console.log(`CodeEngine v${version}`);
  console.log(`Node.js v${process.version.slice(1)} | Platform: ${process.platform}/${process.arch}`);
  console.log(`Working directory: ${process.cwd()}`);
}
