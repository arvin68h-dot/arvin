// CodeEngine TUI — 终端界面应用主入口
// 基于 readline 实现简易交互式终端界面

import * as readline from 'node:readline';
import { stdout, stdin } from 'node:process';

// ─── 主题定义 ───
export const Theme = {
  prompt: '\x1b[36m>\x1b[0m ',     // Cyan 提示符
  user: '\x1b[32m',              // Green 用户消息
  assistant: '\x1b[33m',        // Yellow 助手消息
  tool: '\x1b[36m',             // Cyan 工具执行
  error: '\x1b[31m',            // Red 错误
  status: '\x1b[37m',           // White 状态
  bold: '\x1b[1m',              // 加粗
  dim: '\x1b[2m',               // 淡化
  reset: '\x1b[0m',             // 重置
  clear: '\x1b[2J\x1b[H',       // 清屏
  cursorHome: '\x1b[H',         // 光标归位
  cursorHide: '\x1b[?25l',      // 隐藏光标
  cursorShow: '\x1b[?25h',      // 显示光标
};

// ─── 状态枚举 ───
export type TUIStatus = 'idle' | 'running' | 'processing' | 'error';

// ─── TUI 应用 ───
export class TUIApp {
  private rl: readline.Interface;
  private status: TUIStatus = 'idle';
  private history: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; timestamp: number }[] = [];
  private currentTool?: string;

  constructor() {
    this.rl = readline.createInterface({
      input: stdin,
      output: stdout,
      prompt: Theme.prompt,
      historySize: 100,
    });
  }

  /**
   * 启动 TUI 界面
   */
  async start(onMessage?: (userInput: string) => Promise<string>): Promise<void> {
    this.renderBanner();
    this.setPrompt(Theme.prompt);

    this.rl.on('line', async (line: string) => {
      const input = line.trim();
      if (!input) return;

      if (input === '/quit' || input === '/exit') {
        this.exit();
        return;
      }
      if (input === '/clear') {
        this.clearScreen();
        return;
      }
      if (input === '/help') {
        this.showHelp();
        return;
      }

      // 记录用户消息
      this.history.push({
        role: 'user',
        content: input,
        timestamp: Date.now(),
      });

      // 输出用户消息
      stdout.write(`${Theme.user}${input}${Theme.reset}\n\n`);

      // 处理输入
      try {
        this.setStatus('processing');
        this.currentTool = 'llm';
        this.renderStatus();

        const response = onMessage
          ? await onMessage(input)
          : `[CodeEngine] 响应: ${input}`;

        // 输出助手回复
        stdout.write(`${Theme.assistant}${response}${Theme.reset}\n\n`);
        this.history.push({
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
        });
      } catch (err) {
        this.setStatus('error');
        stdout.write(`${Theme.error}[ERROR] ${(err as Error).message}${Theme.reset}\n\n`);
        this.history.push({
          role: 'system',
          content: `Error: ${(err as Error).message}`,
          timestamp: Date.now(),
        });
      }

      this.setStatus('idle');
    });

    // Ctrl+C 优雅退出
    this.rl.on('SIGINT', () => {
      stdout.write('\n');
      this.exit();
    });
  }

  /**
   * 显示工具面板（当前执行的工具）
   */
  showToolPanel(tool: string, progress?: string): void {
    this.currentTool = tool;
    stdout.write(`${Theme.tool}[工具] ${tool}${progress ? ` — ${progress}` : ''}${Theme.reset}\n`);
  }

  /**
   * 渲染 Banner
   */
  private renderBanner(): void {
    stdout.write(`${Theme.clear}${Theme.cursorHome}`);
    stdout.write(`${Theme.bold}${Theme.tool}
  ╔══════════════════════════════════════╗
  ║   CodeEngine v0.1.0                  ║
  ║   全场景 AI 编码引擎                   ║
  ╚══════════════════════════════════════╝${Theme.reset}\n\n`);
    this.renderStatus();
  }

  /**
   * 渲染状态栏
   */
  private renderStatus(): void {
    const statusText = {
      idle: '空闲',
      running: '运行中',
      processing: '处理中...',
      error: '错误',
    }[this.status];
    stdout.write(`${Theme.dim}状态: ${statusText} | 消息: ${this.history.length} | Ctrl+C退出${Theme.reset}\n`);
  }

  /**
   * 清屏
   */
  private clearScreen(): void {
    stdout.write(Theme.clear + Theme.cursorHome);
    this.renderBanner();
  }

  /**
   * 设置提示符
   */
  private setPrompt(prompt: string): void {
    this.rl.setPrompt(prompt);
    this.rl.prompt();
  }

  /**
   * 显示帮助
   */
  private showHelp(): void {
    stdout.write(`
${Theme.bold}可用命令:${Theme.reset}
  /quit     退出 CodeEngine
  /clear    清屏
  /help     显示帮助
\n`);
  }

  /**
   * 更新状态
   */
  private setStatus(status: TUIStatus): void {
    this.status = status;
    if (status === 'error') {
      this.setStatus('idle'); // 错误后自动恢复
    }
  }

  /**
   * 退出 TUI
   */
  exit(): void {
    this.setStatus('idle');
    this.rl.close();
    stdout.write(`\n${Theme.dim}再见！${Theme.reset}\n`);
    process.exit(0);
  }

  /**
   * 获取会话历史
   */
  getHistory(): typeof this.history {
    return [...this.history];
  }

  /**
   * 获取当前状态
   */
  getStatus(): TUIStatus {
    return this.status;
  }
}
