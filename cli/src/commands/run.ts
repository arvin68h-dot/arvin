#!/usr/bin/env node
/**
 * Run 命令 — 启动 CodeEngine 交互式对话模式
 *
 * 用法:
 *   codeengine run              启动交互式对话
 *   codeengine run [prompt]     执行单次任务
 *   codeengine run --help       显示帮助信息
 *
 * 交互模式:
 *   在 REPL 中输入自然语言指令，CodeEngine 会自动：
 *   1. 理解用户意图
 *   2. 调用相应工具完成任务
 *   3. 返回结果
 *   4. 等待下一条指令
 *
 *   输入 /exit 退出，输入 /help 查看帮助
 */

import { SessionManager } from '@codeengine/engine';
import { ToolRegistry } from '@codeengine/tool';
import { UserRole, LogLevel, createLogger, type RuntimeContext } from '@codeengine/core';

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

// 全局会话和工具注册
let _sessionManager: SessionManager | null = null;
let _toolRegistry: ToolRegistry | null = null;
let _sessionId: string | null = null;

/**
 * 初始化会话管理器和工具注册表
 */
function initSessionManager(): SessionManager {
  if (!_sessionManager) {
    _sessionManager = new SessionManager();
  }
  return _sessionManager;
}

/**
 * 获取当前会话 ID，如果不存在则创建新会话
 * @returns 当前会话 ID
 */
function getCurrentSessionId(): string {
  if (!_sessionId) {
    const sm = initSessionManager();
    const session = sm.createSession({ title: 'CLI Session' });
    _sessionId = session.id;
  }
  return _sessionId;
}

/**
 * 显示加载指示器 — 在终端中显示旋转动画
 * @param message — 加载提示信息
 */
function showLoading(message: string): () => void {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let idx = 0;

  process.stdout.write(`${DIM}[${frames[idx]}] ${message}${RESET}`);

  const interval = setInterval(() => {
    idx = (idx + 1) % frames.length;
    const cur = `${DIM}[${frames[idx]}] ${message}${RESET}`;
    // 覆盖当前行
    process.stdout.write(`\x1b[2K\r${cur}`);
  }, 80);

  // 返回停止函数
  return () => {
    clearInterval(interval);
    process.stdout.write(`\x1b[2K\r${GREEN}[✔]${RESET} ${message}\n`);
  };
}

/**
 * 显示欢迎信息和帮助提示
 */
function showWelcome(): void {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║   CodeEngine — 全场景 AI 编码引擎    ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}\n`);
  console.log(`  ${DIM}在下方输入你的需求，CodeEngine 会自动完成。${RESET}`);
  console.log(`\n  ${BOLD}命令:${RESET}`);
  console.log(`    /exit              退出对话模式`);
  console.log(`    /help              显示帮助信息`);
  console.log(`    /session           查看当前会话`);
  console.log(`    /checkpoint        创建检查点快照`);
  console.log(`    /clear             清空屏幕`);
  console.log(`\n  ${DIM}按 Ctrl+C 组合键退出，或输入 /exit${RESET}\n`);
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`\n${BOLD}帮助信息${RESET}\n`);
  console.log(`  CodeEngine 是一个全场景 AI 编码引擎，支持：`);
  console.log(`\n  ${BOLD}功能:${RESET}`);
  console.log(`    • 代码编写 — 用自然语言描述需求`);
  console.log(`    • 文件操作 — 读写、编辑、搜索文件`);
  console.log(`    • 版本控制 — Git 操作集成`);
  console.log(`    • Shell 执行 — 安全执行命令`);
  console.log(`    • 检查点 — 创建和恢复代码快照`);
  console.log(`    • 技能匹配 — 自动匹配最佳技能`);
  console.log(`    • 任务规划 — 自动分解和规划任务`);
  console.log(`    • 多语言引擎 — C++/Python/JS/TS/Go/Rust 等`);
  console.log(`\n  ${BOLD}使用示例:${RESET}`);
  console.log(`    创建一个 Python Flask Web 应用`);
  console.log(`    将 main.py 重构为模块化结构`);
  console.log(`    搜索项目中所有 TODO 注释`);
  console.log(`    创建 Git 分支并提交更改`);
  console.log(`\n  ${BOLD}命令:${RESET}`);
  console.log(`    /exit              退出对话模式`);
  console.log(`    /help              显示此帮助信息`);
  console.log(`    /session           查看当前会话状态`);
  console.log(`    /checkpoint        创建代码检查点`);
  console.log(`    /clear             清空终端`);
  console.log('');
}

/**
 * 显示会话状态
 */
function showSessionStatus(): void {
  const sm = initSessionManager();
  if (!_sessionId) {
    console.log(`  ${YELLOW}无活跃会话${RESET}`);
    return;
  }

  const session = sm.getSession(_sessionId);
  if (!session) {
    console.log(`  ${YELLOW}会话已过期${RESET}`);
    return;
  }

  const messages = sm.getMessages(_sessionId);

  console.log(`\n${BOLD}当前会话${RESET}`);
  console.log(`  ID:       ${session.id}`);
  console.log(`  标题:     ${session.title}`);
  console.log(`  消息数:   ${messages.length}`);
  console.log(`  创建时间: ${new Date(session.created_at).toLocaleString('zh-CN')}`);

  // 统计各类消息数量
  const roleCounts = new Map<string, number>();
  for (const msg of messages) {
    const count = roleCounts.get(msg.role) || 0;
    roleCounts.set(msg.role, count + 1);
  }

  console.log(`\n  ${BOLD}消息统计:${RESET}`);
  for (const [role, count] of roleCounts) {
    console.log(`    ${role}: ${count}`);
  }
}

/**
 * 创建检查点快照
 */
async function createCheckpoint(): Promise<void> {
  const { CheckpointManager } = require('@codeengine/checkpoint');
  const manager = new CheckpointManager(process.cwd());

  const name = `auto-${Date.now()}`;
  try {
    const checkpoint = await manager.create(name, `Auto checkpoint at ${new Date().toLocaleString('zh-CN')}`);
    console.log(`\n  ${GREEN}[OK]${RESET} 检查点已创建: ${checkpoint.id.slice(0, 12)}`);
  } catch (err) {
    console.log(`\n  ${RED}[ERROR]${RESET} 创建检查点失败: ${(err as Error).message}`);
  }
}

/**
 * 清屏
 */
function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[0f');
}

/**
 * 处理用户输入 — 解析命令并执行
 * @param input — 用户输入的指令
 */
async function processInput(input: string): Promise<void> {
  // 命令处理
  const trimmed = input.trim();

  if (!trimmed) {
    return;
  }

  if (trimmed === '/exit' || trimmed === '/quit') {
    console.log(`\n  ${GREEN}[OK]${RESET} 感谢使用 CodeEngine！再见 👋\n`);
    process.exit(0);
  }

  if (trimmed === '/help') {
    showHelp();
    return;
  }

  if (trimmed === '/session') {
    showSessionStatus();
    return;
  }

  if (trimmed === '/checkpoint') {
    await createCheckpoint();
    return;
  }

  if (trimmed === '/clear') {
    clearScreen();
    return;
  }

  // 普通对话：显示用户消息
  console.log(`\n${BOLD}${CYAN}你:${RESET} ${DIM}${trimmed}${RESET}`);

  // 模拟处理（因为完整 Agent 循环需要 LLM 连接）
  // 在实际使用中，这里会连接到 Agent 核心循环
  const stopLoading = showLoading('正在处理你的请求...');

  // 给一个简短的模拟延迟
  await new Promise(resolve => setTimeout(resolve, 500));

  stopLoading();

  // 添加消息到会话
  const sm = initSessionManager();
  const sessionId = getCurrentSessionId();
  sm.addMessage(sessionId, {
    id: crypto.randomUUID(),
    role: UserRole.USER,
    content: trimmed,
    timestamp: Date.now(),
  });

  // 输出模拟响应（实际应用由 Agent 核心提供）
  console.log(`\n${BOLD}${MAGENTA}CodeEngine:${RESET} 收到你的请求: ${trimmed}`);
  console.log(`\n  ${DIM}（简化模式 — Agent 核心循环需要 LLM 提供者配置。`);
  console.log(`   使用 ${CYAN}codeengine config set providers.ollama.model <model>${RESET} 配置模型。）${RESET}\n`);
}

/**
 * 设置 stdin 为原始模式，使 Ctrl+C 可以被捕获
 */
function setupRawMode(): void {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');
}

/**
 * 退出处理器 — 处理 Ctrl+C
 */
function setupInterruptHandler(): void {
  process.on('SIGINT', () => {
    console.log('\n');
  });
}

/**
 * 运行交互式对话模式
 * @param args — 命令行参数数组（忽略）
 */
export async function run(_args: string[]): Promise<void> {
  // 检查是否有单次任务参数
  const task = _args.join(' ');
  if (task) {
    // 单次任务模式
    const sm = initSessionManager();
    const sessionId = getCurrentSessionId();

    console.log(`\n${BOLD}${CYAN}CodeEngine${RESET} — 执行任务: ${task}`);
    console.log(`\n  ${DIM}处理中...${RESET}\n`);

    sm.addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: UserRole.USER,
      content: task,
      timestamp: Date.now(),
    });

    // 模拟处理
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`\n  ${MAGENTA}CodeEngine${RESET}: 任务已提交: ${task}`);
    console.log(`\n${DIM}（简化模式 — 完整执行需要 LLM 连接）${RESET}\n`);
    return;
  }

  // 交互式模式
  setupInterruptHandler();

  showWelcome();

  // 读取输入
  const readline = await import('node:readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}${BOLD}▸ ${RESET}`,
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    await processInput(line);
    rl.prompt();
  }).on('close', () => {
    console.log(`\n  ${GREEN}[OK]${RESET} 会话结束。再见 👋\n`);
    process.exit(0);
  });
}
