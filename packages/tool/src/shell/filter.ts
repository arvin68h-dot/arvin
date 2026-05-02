import { createLogger, LogLevel } from '@codeengine/core';
import { checkDangerousCommand } from './permission.js';

// 允许的命令白名单
const ALLOWED_COMMANDS: Set<string> = new Set([
  // 文件浏览
  'ls',
  'cat',
  'echo',
  'grep',
  'find',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'less',
  'more',
  'file',
  'stat',
  'diff',
  'patch',

  // 文件操作
  'mkdir',
  'touch',
  'cp',
  'mv',
  'rm', // 仅单文件（在 runner 中额外检查）
  'chmod',
  'chown',
  'ln',

  // 开发工具
  'git',
  'npm',
  'pnpm',
  'yarn',
  'node',
  'python',
  'python3',
  'go',
  'rustc',
  'gcc',
  'g++',
  'make',
  'cmake',
  'cargo',
  'tsc',
  'npx',
  'tsx',

  // 其他工具
  'read_file',
  'write_file',
  'edit_file',
  'delete_file',
  'list_dir',
  'search',
  'jq',
  'sed',
  'awk',
  'xargs',
  'tee',
  'tr',
  'cut',
  'dirname',
  'basename',
  'realpath',
]);

// 需要特殊规则处理的命令（白名单内但有限制）
const SPECIAL_COMMANDS: Set<string> = new Set(['rm']);

const logger = createLogger({ name: 'tool:shell_filter', level: LogLevel.INFO });

/**
 * 检查命令是否在白名单内
 * @param command - 要检查的命令字符串
 * @returns 检查结果
 */
export function checkWhitelistedCommand(command: string): {
  allowed: boolean;
  reason?: string;
} {
  const trimmed = command.trim();
  if (!trimmed) {
    return { allowed: true };
  }

  // 提取第一个命令（处理管道、&&、|| 等）
  const firstCmd = extractFirstCommand(trimmed);

  if (!ALLOWED_COMMANDS.has(firstCmd)) {
    logger.warn(`非白名单命令: ${firstCmd} (原始命令: ${trimmed})`);
    return { allowed: false, reason: `命令 '${firstCmd}' 不在白名单中` };
  }

  // 特殊命令需要额外检查
  if (SPECIAL_COMMANDS.has(firstCmd)) {
    return checkSpecialCommand(firstCmd, trimmed);
  }

  return { allowed: true };
}

/**
 * 检查特殊命令的安全性
 * @param cmd - 命令名称
 * @param fullCommand - 完整命令
 * @returns 检查安全性的结果
 */
function checkSpecialCommand(cmd: string, fullCommand: string): {
  allowed: boolean;
  reason?: string;
} {
  if (cmd === 'rm') {
    // 检查是否为递归删除（rm -rf, rm -r 等）
    if (/\brm\s+(-r|-rf|-fr|-R)\b/.test(fullCommand)) {
      return { allowed: false, reason: '不允许递归删除 (rm -r) 命令' };
    }
    // 检查是否为黑名单模式
    const dangerCheck = checkDangerousCommand(fullCommand);
    if (dangerCheck.blocked) {
      return { allowed: false, reason: dangerCheck.matchedCommand || dangerCheck.matchedPattern };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

/**
 * 从完整命令中提取第一个命令（支持管道、&&、|| 等）
 * @param command - 完整命令字符串
 * @returns 第一个命令名称
 */
function extractFirstCommand(command: string): string {
  // 去除引号、子shell等
  const cleaned = command
    .replace(/\$\([^)]*\)/g, '') // 去除 $(...)
    .replace(/`[^`]*`/g, '') // 去除 ``
    .replace(/\|\|/g, ' ') // 替换 || 为空格
    .replace(/&&/g, ' ') // 替换 && 为空格
    .replace(/\|/g, ' ') // 替换 | 为空格
    .replace(/\n/g, ' ') // 去除换行
    .trim();

  // 提取第一个令牌
  const firstToken = cleaned.split(/\s+/)[0] || '';
  return firstToken.replace(/^.*\//, ''); // 取命令名，去掉路径
}

export class ShellFilter {
  /**
   * 检查命令是否允许执行
   * 同时检查白名单和黑名单
   * @param cmd - 要检查的命令字符串
   * @returns 检查结果
   */
  static check(cmd: string): { allowed: boolean; reason?: string } {
    // 首先检查黑名单（危险命令模式）
    const dangerCheck = checkDangerousCommand(cmd);
    if (dangerCheck.blocked) {
      logger.warn(`Blocker blocked dangerous command: ${cmd}`);
      return {
        allowed: false,
        reason: dangerCheck.matchedCommand
          ? `Blocker: 匹配黑名单命令 '${dangerCheck.matchedCommand}'`
          : `Blocker: 匹配危险模式 '${dangerCheck.matchedPattern}'`,
      };
    }

    // 然后检查白名单
    const whitelistCheck = checkWhitelistedCommand(cmd);
    if (!whitelistCheck.allowed) {
      return whitelistCheck;
    }

    // 使用旧的 DANGEROUS_PATTERNS 进行额外的安全检查
    for (const pattern of OLD_DANGEROUS_PATTERNS) {
      if (pattern.test(cmd)) {
        logger.warn(`Blocked dangerous command: ${cmd}`);
        return { allowed: false, reason: `Blocker: 匹配旧危险模式 ${pattern.source}` };
      }
    }

    return { allowed: true };
  }
}

// 保留旧的危险模式用于向后兼容
const OLD_DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*)?\/\s/,
  /\bmkfs/,
  /\bdd\s+if=/,
  /\bchmod\s+0?(000|777)/,
  /\bshred/,
  /\becho\s+.>?\\s*\/etc\/(passwd|shadow|sudoers)/,
  /\bwipe/,
  /\bnc\s+-[el]/,
  /\bwget\s+.*\|.*sh/,
  /\bcurl\s+.*\|.*sh/,
];
