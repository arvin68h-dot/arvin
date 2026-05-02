#!/usr/bin/env node
/**
 * CodeEngine CLI 入口
 * 全场景 AI 编码引擎
 *
 * 用法:
 *   codeengine version              显示版本信息
 *   codeengine tool list            列出所有工具
 *   codeengine engine list          列出所有语言引擎
 *   codeengine session list         列出所有会话
 *   codeengine checkpoint create    创建检查点
 *   codeengine skill list           列出所有技能
 *   codeengine config list          显示配置
 *   codeengine db version           查看数据库版本和迁移状态
 *   codeengine run                  交互式对话模式
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * 动态导入命令模块 — 使用 ESM import() 实现路由
 * @param commandName — 命令名称（如 'version', 'tool', 'engine'）
 * @returns 命令模块的 run 函数
 */
async function importCommand(commandName: string): Promise<{ run: (args: string[]) => Promise<void> }> {
  // 对于 run 命令，使用 __dirname 构建路径
  // 对于子命令（如 tool show），分别导入对应模块
  const module = await import(`./commands/${commandName}.js`);
  return module as any;
}

/**
 * 运行单个命令
 * @param commandName — 命令名称
 * @param args — 命令参数数组
 */
async function runCommand(commandName: string, args: string[]): Promise<void> {
  const mod = await importCommand(commandName);
  await mod.run(args);
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  const version = '0.1.0';
  console.log(`\n${BOLD}${GREEN}CodeEngine${RESET} v${version} — 全场景 AI 编码引擎`);
  console.log('');
  console.log(`${BOLD}用法:${RESET}`);
  console.log(`  codeengine <命令> [参数]`);
  console.log('');
  console.log(`${BOLD}主要命令:${RESET}`);
  console.log(`  ${GREEN}run${RESET}              启动交互式对话模式`);
  console.log(`  ${GREEN}version${RESET}           显示版本信息`);
  console.log('');
  console.log(`${BOLD}工具管理:${RESET}`);
  console.log(`  ${CYAN}tool list${RESET}        列出所有已注册工具`);
  console.log(`  ${CYAN}tool show <name>${RESET} 显示工具详情`);
  console.log('');
  console.log(`${BOLD}引擎管理:${RESET}`);
  console.log(`  ${CYAN}engine list${RESET}      列出所有语言引擎`);
  console.log(`  ${CYAN}engine show <name>${RESET} 显示引擎详情`);
  console.log('');
  console.log(`${BOLD}会话管理:${RESET}`);
  console.log(`  ${CYAN}session list${RESET}     列出所有会话`);
  console.log(`  ${CYAN}session show <id>${RESET} 显示会话详情`);
  console.log('');
  console.log(`${BOLD}检查点:${RESET}`);
  console.log(`  ${CYAN}checkpoint list${RESET}     列出所有检查点`);
  console.log(`  ${CYAN}checkpoint create${RESET}   创建检查点`);
  console.log(`  ${CYAN}checkpoint restore <id>${RESET} 恢复检查点`);
  console.log(`  ${CYAN}checkpoint delete <id>${RESET}  删除检查点`);
  console.log(`  ${CYAN}checkpoint compare <id1> <id2>${RESET} 比较检查点`);
  console.log('');
  console.log(`${BOLD}技能:${RESET}`);
  console.log(`  ${CYAN}skill list${RESET}         列出所有技能`);
  console.log(`  ${CYAN}skill show <name>${RESET}   显示技能详情`);
  console.log(`  ${CYAN}skill enable <name>${RESET} 启用技能`);
  console.log(`  ${CYAN}skill disable <name>${RESET} 禁用技能`);
  console.log(`  ${CYAN}skill remove <name>${RESET} 删除技能`);
  console.log('');
  console.log(`${BOLD}配置:${RESET}`);
  console.log(`  ${CYAN}config list${RESET}        列出所有配置`);
  console.log(`  ${CYAN}config get <key>${RESET}   获取配置值`);
  console.log(`  ${CYAN}config set <key> <value>${RESET}  设置配置值`);
  console.log('');
  console.log(`${BOLD}数据库:${RESET}`);
  console.log(`  ${CYAN}db version${RESET}         查看数据库版本`);
  console.log(`  ${CYAN}db migrations${RESET}      列出所有迁移`);
  console.log('');
  console.log(`  ${GREEN}help${RESET}               显示此帮助信息`);
  console.log('');
}

// ─── 主入口 ───
(async () => {
const args = process.argv.slice(2);
const command = args[0] || 'help';

// 处理快捷参数
if (command === '--version' || command === '-v') {
  await runCommand('version', []);
} else if (command === '--help' || command === '-h' || command === 'help' || command === '') {
  showHelp();
} else if (command === 'run') {
  try {
    await runCommand('run', args.slice(1));
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 运行失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (command === 'version') {
  try {
    await runCommand('version', []);
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 版本查询失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (command === 'tool') {
  try {
    await runCommand('tool', args.slice(1));
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 工具命令失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (command === 'engine') {
  try {
    await runCommand('engine', args.slice(1));
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 引擎命令失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (command === 'session') {
  try {
    await runCommand('session', args.slice(1));
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 会话命令失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (command === 'checkpoint') {
  try {
    await runCommand('checkpoint', args.slice(1));
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 检查点命令失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (command === 'skill') {
  try {
    await runCommand('skill', args.slice(1));
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 技能命令失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (command === 'config') {
  try {
    await runCommand('config', args.slice(1));
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 配置命令失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (command === 'db') {
  try {
    await runCommand('db', args.slice(1));
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 数据库命令失败: ${(err as Error).message}`);
    process.exit(1);
  }
} else {
  console.error(`\n${RED}[ERROR]${RESET} 未知命令: ${command}`);
  console.error(`  使用 ${GREEN}codeengine help${RESET} 查看所有可用命令`);
  process.exit(1);
}
})();
