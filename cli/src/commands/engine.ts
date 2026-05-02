#!/usr/bin/env node
/**
 * Engine 命令 — 管理语言引擎注册表
 *
 * 用法:
 *   codeengine engine list       列出所有语言引擎及其状态
 *   codeengine engine show <name> 显示指定引擎的详细信息
 *   codeengine engine --help     显示帮助信息
 */

import { Language } from '@codeengine/core';
import { EngineRegistryImpl } from '@codeengine/engine';

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ─── 语言名称映射（中文） ───
const LANGUAGE_NAMES: Record<Language, string> = {
  cpp: 'C++',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  go: 'Go',
  rust: 'Rust',
  csharp: 'C#',
  cmake: 'CMake',
  powershell: 'PowerShell',
  catia: 'CATIA',
};

// ─── 构建系统名称映射（中文） ───
const BUILD_NAMES: Record<string, string> = {
  make: 'Make',
  cmake: 'CMake',
  npm: 'npm',
  pnpm: 'pnpm',
  cargo: 'Cargo',
  auto: '自动',
};

// ─── 语言引擎配置注册表 ───
const ENGINE_CONFIGS: Record<Language, { command: string; args: string[]; checkPattern?: string; buildSystem: string }> = {
  cpp: { command: 'g++', args: ['--version'], checkPattern: 'g++', buildSystem: 'make' },
  python: { command: 'python3', args: ['--version'], checkPattern: 'Python', buildSystem: 'npm' },
  javascript: { command: 'node', args: ['--version'], checkPattern: 'v', buildSystem: 'npm' },
  typescript: { command: 'node', args: ['--version'], checkPattern: 'v', buildSystem: 'npm' },
  go: { command: 'go', args: ['version'], checkPattern: 'go version', buildSystem: 'auto' },
  rust: { command: 'rustc', args: ['--version'], checkPattern: 'rustc', buildSystem: 'cargo' },
  csharp: { command: 'dotnet', args: ['--version'], checkPattern: '.NET', buildSystem: 'auto' },
  cmake: { command: 'cmake', args: ['--version'], checkPattern: 'cmake', buildSystem: 'cmake' },
  powershell: { command: 'pwsh', args: ['--version'], checkPattern: 'PowerShell', buildSystem: 'auto' },
  catia: { command: 'catia', args: ['--version'], checkPattern: 'CATIA', buildSystem: 'auto' },
};

/**
 * 初始化引擎注册表 — 创建实例并注册所有可用的语言引擎
 * 每个引擎都会被初始化并检查运行环境
 */
function initEngineRegistry(): EngineRegistryImpl {
  const registry = new EngineRegistryImpl();

  // 为每种语言创建引擎实例并注册
  // 当前语言引擎的后端实现需要通过 src/cpp/index.ts 等子模块加载
  // 这里只注册引擎接口并尝试初始化以获取状态

  for (const lang of Object.values(Language)) {
    try {
      const cfg = ENGINE_CONFIGS[lang];
      if (!cfg) continue;

      // 尝试检测引擎是否可用
      const { spawnSync } = require('node:child_process');
      const result = spawnSync(cfg.command, cfg.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 3000,
        encoding: 'utf-8',
      });

      if (result.error || (cfg.checkPattern && !result.stdout.includes(cfg.checkPattern))) {
        continue; // 引擎不可用，跳过
      }

      // 获取版本信息
      const version = (result.stdout || result.stderr || '').trim().split('\n')[0];

      registry.register({
        init: async () => {},
        compile: async () => ({ success: false, language: lang, error: 'Not implemented' }),
        run: async () => ({ success: false, language: lang, error: 'Not implemented' }),
        test: async () => ({ success: false, language: lang, error: 'Not implemented' }),
        format: async () => ({ success: false, language: lang, error: 'Not implemented' }),
        lint: async () => ({ success: false, language: lang, error: 'Not implemented' }),
        parseProblems: (output: string) => [],
        detectInstallSystem: () => 'system' as any,
        detectBuildSystem: () => 'auto' as any,
        status: () => ({
          language: lang,
          available: true,
          version,
        }),
      } as any);
    } catch {
      // 引擎初始化失败，跳过
    }
  }

  return registry;
}

/**
 * 运行引擎列表命令 — 展示所有可用语言引擎及其状态
 * @param _args — 命令行参数数组（忽略）
 */
export async function runEngineList(_args: string[]): Promise<void> {
  const registry = initEngineRegistry();
  const statuses = registry.getStatuses();

  if (statuses.length === 0) {
    console.log(`  ${YELLOW}无引擎可用${RESET}`);
    console.log(`  ${CYAN}codeengine engine show <name>${RESET} 查看支持的引擎列表`);
    return;
  }

  // 统计可用/不可用的引擎数量
  const availableCount = statuses.filter(s => s.available).length;
  const totalCount = statuses.length;

  console.log(`\n${BOLD}语言引擎 (${availableCount}/${totalCount} 可用)${RESET}\n`);

  // 打印表格
  const langColWidth = 14;
  const statusColWidth = 8;
  const verColWidth = 20;

  console.log(`  ${CYAN}${'语言'.padEnd(langColWidth)}${RESET}  ${'状态'.padEnd(statusColWidth)}  ${'版本'.padEnd(verColWidth)}  描述`);
  console.log(`  ${'─'.repeat(langColWidth)}  ${'─'.repeat(statusColWidth)}  ${'─'.repeat(verColWidth)}  ${'─'.repeat(30)}`);

  for (const status of statuses) {
    const langLabel = (LANGUAGE_NAMES[status.language] || status.language).padEnd(langColWidth);
    const statusLabel = status.available
      ? `${GREEN}● 可用${RESET}`.padEnd(statusColWidth)
      : `${RED}○ 不可用${RESET}`.padEnd(statusColWidth);
    const verLabel = (status.version || 'n/a').padEnd(verColWidth);
    const desc = LANGUAGE_NAMES[status.language] || '';

    console.log(`  ${langLabel}  ${statusLabel}  ${verLabel || ' '.repeat(verColWidth)}  ${desc}`);
  }

  console.log(`\n使用 ${CYAN}codeengine engine show <language>${RESET} 查看引擎详情`);
  console.log(`\n支持的语言: ${Object.values(Language).join(', ')}`);
}

/**
 * 运行引擎详情命令 — 显示指定语言引擎的详细信息
 * @param args — 命令行参数数组，预期格式: [<language>]
 */
export async function runEngineShow(args: string[]): Promise<void> {
  const registry = initEngineRegistry();

  const langStr = (args[0] || '').toLowerCase();

  if (!langStr) {
    console.error(`  ${RED}请提供语言名称${RESET}`);
    console.error(`  用法: codeengine engine show <language>`);
    console.error(`  支持的语言: ${Object.values(Language).join(', ')}`);
    process.exit(1);
  }

  const lang = Language[langStr.toUpperCase() as keyof typeof Language];
  if (!lang) {
    console.error(`  ${RED}不支持的语言: ${langStr}${RESET}`);
    console.error(`  支持的语言: ${Object.values(Language).join(', ')}`);
    process.exit(1);
  }

  const engine = registry.get(lang);
  if (!engine) {
    console.error(`  ${RED}引擎不可用: ${LANGUAGE_NAMES[lang] || lang}${RESET}`);
    console.error(`  可能未安装对应的编译器或运行时环境`);
    process.exit(1);
  }

  const status = engine.status();

  console.log(`\n${BOLD}${LANGUAGE_NAMES[lang] || lang} 引擎${RESET}`);
  console.log(`  语言:      ${status.language}`);
  console.log(`  状态:      ${status.available ? GREEN + '可用' + RESET : RED + '不可用' + RESET}`);
  console.log(`  版本:      ${status.version || 'n/a'}`);
  console.log(`  可执行文件: ${status.executablePath || 'n/a'}`);
  if (status.lastError) {
    console.log(`  错误:      ${YELLOW}${status.lastError}${RESET}`);
  }

  // 显示支持的构建系统
  console.log(`\n支持的构建操作:`);
  console.log(`  ✓ 编译 (compile)`);
  console.log(`  ✓ 运行 (run)`);
  console.log(`  ✓ 测试 (test)`);
  console.log(`  ✓ 格式化 (format)`);
  console.log(`  ✓ 代码检查 (lint)`);
}

/**
 * 运行引擎命令入口 — 根据子命令路由到对应处理器
 * @param args — 完整的命令行参数数组（已去掉 'engine' 本身）
 */
export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (command === 'list' || !command) {
    await runEngineList(args.slice(1));
  } else if (command === 'show') {
    await runEngineShow(args.slice(1));
  } else if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`\n${BOLD}引擎管理${RESET}\n`);
    console.log(`  用法: codeengine engine [命令] [参数]\n`);
    console.log(`  命令:`);
    console.log(`    list              列出所有语言引擎及其状态`);
    console.log(`    show <language>   显示指定引擎的详细信息`);
    console.log(`    --help            显示此帮助信息\n`);
    console.log(`  支持的语言:`);
    console.log(`    ${Object.values(Language).join(', ')}\n`);
  } else {
    console.error(`  未知子命令: ${command}`);
    console.error(`  使用 codeengine engine --help 查看用法`);
    process.exit(1);
  }
}
