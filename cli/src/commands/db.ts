#!/usr/bin/env node
/**
 * Database 命令 — 管理 CodeEngine 数据库
 *
 * 用法:
 *   codeengine db version        显示当前数据库版本
 *   codeengine db migrations     列出所有迁移
 *   codeengine db --help         显示帮助信息
 */

import { getDbVersion, listMigrations } from '@codeengine/storage';

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * 运行数据库版本命令 — 显示当前数据库版本
 */
async function runVersion(): Promise<void> {
  const version = getDbVersion();
  console.log(`\n${BOLD}数据库版本${RESET}\n`);
  console.log(`  当前版本: v${version}`);
  console.log(`  状态: ${GREEN}✓ 正常运行${RESET}`);
  console.log(`\n使用说明:`);
  console.log(`  数据库会自动升级，无需手动操作`);
  console.log(`  使用 ${CYAN}codeengine db migrations${RESET} 查看迁移历史`);
}

/**
 * 运行迁移列表命令 — 显示所有迁移及其执行状态
 */
async function runMigrationsList(): Promise<void> {
  const migrationList = listMigrations();
  
  console.log(`\n${BOLD}数据库迁移${RESET}\n`);
  console.log(`  ${CYAN}版本${RESET}${' '.repeat(6)}  ${'迁移描述'.padEnd(50)}  ${'状态'}`);
  console.log(`  ${'─'.repeat(70)}`);
  
  for (const m of migrationList) {
    const versionLabel = `v${m.version}`.padEnd(12);
    const nameLabel = m.name.padEnd(50);
    const status = m.executed
      ? `${GREEN}✓ 已执行${RESET}`
      : `${YELLOW}○ 未执行${RESET}`;
    console.log(`  ${versionLabel}  ${nameLabel}  ${status}`);
  }
  
  console.log(`\n${BOLD}如何添加迁移:${RESET}`);
  console.log(`  1. 在 packages/storage/src/migrations/ 创建新文件（如 002_xxx.ts）`);
  console.log(`  2. 递增 packages/storage/src/migrations/types.ts 中的 CURRENT_SCHEMA_VERSION`);
  console.log(`  3. 在 migrations/index.ts 的 migrations 数组中注册新迁移`);
  console.log(`  4. 系统启动时会自动执行未运行的迁移`);
}

/**
 * 运行数据库命令入口 — 根据子命令路由
 * @param args — 命令行参数数组（已去掉 'db' 本身）
 */
export async function run(args: string[]): Promise<void> {
  const command = args[0];
  
  if (command === 'version' || !command) {
    await runVersion();
  } else if (command === 'migrations' || command === 'list') {
    await runMigrationsList();
  } else if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`\n${BOLD}${GREEN}数据库管理${RESET}\n`);
    console.log(`  用法: codeengine db [命令] [参数]\n`);
    console.log(`  命令:`);
    console.log(`    version              显示当前数据库版本`);
    console.log(`    migrations           列出所有数据库迁移`);
    console.log(`    --help               显示此帮助信息\n`);
    console.log(`  ${BOLD}说明:${RESET}`);
    console.log(`    CodeEngine 的数据库会自动升级。`);
    console.log(`    当有新版本的数据库结构时，系统会在启动时`);
    console.log(`    自动执行增量迁移，不会丢失任何数据。`);
    console.log(`    手动运行迁移时无需操作，系统会自动处理。\n`);
  } else {
    console.error(`  ${RED}未知子命令: ${command}${RESET}`);
    console.error(`  使用 ${CYAN}codeengine db --help${RESET} 查看用法`);
    process.exit(1);
  }
}
