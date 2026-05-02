#!/usr/bin/env node
/**
 * Session 命令 — 管理 CodeEngine 会话
 *
 * 用法:
 *   codeengine session list       列出所有会话
 *   codeengine session show <id>  显示指定会话的详细信息
 *   codeengine session --help     显示帮助信息
 */

import { SessionManager } from '@codeengine/engine';

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// 全局会话管理器实例
let _sessionManager: SessionManager | null = null;

function getSessionManager(): SessionManager {
  if (!_sessionManager) {
    _sessionManager = new SessionManager();
  }
  return _sessionManager;
}

/**
 * 格式化时间戳为可读日期字符串
 * @param timestamp — 毫秒时间戳
 * @returns 格式化后的日期字符串
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 运行会话列表命令 — 展示所有已创建的会话
 * @param _args — 命令行参数数组（忽略）
 */
export async function runSessionList(_args: string[]): Promise<void> {
  const sm = getSessionManager();
  const sessionIds = sm.listSessions();

  if (sessionIds.length === 0) {
    console.log(`  ${YELLOW}无活跃会话${RESET}`);
    console.log(`  ${CYAN}codeengine run${RESET} 创建新会话`);
    return;
  }

  console.log(`\n${BOLD}活跃会话 (${sessionIds.length} 个)${RESET}\n`);

  // 打印表格
  console.log(`  ${CYAN}ID${RESET}${' '.repeat(30)}  ${'标题'.padEnd(20)}  ${'消息数'.padEnd(8)}  ${'创建时间'}`);
  console.log(`  ${'─'.repeat(32)}  ${'─'.repeat(20)}  ${'─'.repeat(8)}  ${'─'.repeat(20)}`);

  for (const id of sessionIds) {
    const session = sm.getSession(id);
    if (!session) continue;

    // 截断 ID 为前 12 位
    const idLabel = id.slice(0, 12) + '...';
    const title = (session.title || '未命名').slice(0, 20);
    const msgCount = String(session.message_count).padEnd(8);
    const time = formatDate(session.created_at);

    console.log(`  ${CYAN}${idLabel}${RESET}  ${title.padEnd(20)}  ${msgCount}  ${time}`);
  }

  console.log(`\n使用 ${CYAN}codeengine session show <id>${RESET} 查看会话详情`);
}

/**
 * 运行会话详情命令 — 显示指定会话的完整信息
 * @param args — 命令行参数数组，预期格式: [<sessionId>]
 */
export async function runSessionShow(args: string[]): Promise<void> {
  const sm = getSessionManager();
  const sessionId = args[0];

  if (!sessionId) {
    console.error(`  ${RED}请提供会话 ID${RESET}`);
    console.error(`  用法: codeengine session show <session-id>`);
    console.error(`  使用 ${CYAN}codeengine session list${RESET} 查看所有会话`);
    process.exit(1);
  }

  const session = sm.getSession(sessionId);
  if (!session) {
    console.error(`  ${RED}会话未找到: ${sessionId}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${BOLD}会话详情${RESET}\n`);
  console.log(`  ID:       ${session.id}`);
  console.log(`  标题:     ${session.title}`);
  console.log(`  提供者:   ${session.provider_id}`);
  console.log(`  模型:     ${session.model}`);
  console.log(`  消息数:   ${session.message_count}`);
  console.log(`  创建时间: ${formatDate(session.created_at)}`);
  console.log(`  更新时间: ${formatDate(session.updated_at)}`);
  console.log(`  检查点:   ${session.current_checkpoint || '无'}`);

  // 显示设置信息
  console.log(`\n  ${BOLD}设置:${RESET}`);
  for (const [key, value] of Object.entries(session.settings || {})) {
    console.log(`    ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }

  // 显示工具信息
  if (session.tools && session.tools.length > 0) {
    console.log(`\n  ${BOLD}已注册工具:${RESET}`);
    for (const tool of session.tools) {
      console.log(`    - ${tool.name}: ${tool.description.slice(0, 60)}`);
    }
  }

  // 显示权限条目
  if (session.permission_entries && session.permission_entries.length > 0) {
    console.log(`\n  ${BOLD}权限条目:${RESET}`);
    for (const entry of session.permission_entries) {
      console.log(`    - ${entry.tool}: ${entry.level}${entry.pattern ? ` [${entry.pattern}]` : ''}`);
    }
  }
}

/**
 * 运行会话命令入口 — 根据子命令路由到对应处理器
 * @param args — 完整的命令行参数数组（已去掉 'session' 本身）
 */
export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (command === 'list' || !command) {
    await runSessionList(args.slice(1));
  } else if (command === 'show') {
    await runSessionShow(args.slice(1));
  } else if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`\n${BOLD}会话管理${RESET}\n`);
    console.log(`  用法: codeengine session [命令] [参数]\n`);
    console.log(`  命令:`);
    console.log(`    list              列出所有活跃会话`);
    console.log(`    show <id>         显示指定会话的详细信息`);
    console.log(`    --help            显示此帮助信息\n`);
  } else {
    console.error(`  未知子命令: ${command}`);
    console.error(`  使用 codeengine session --help 查看用法`);
    process.exit(1);
  }
}
