// Shell Command Permission Checker
// 危险命令黑名单检查

import { createLogger, LogLevel } from '@codeengine/core';

const logger = createLogger({ name: 'shell_permission', level: LogLevel.WARN });

// 危险命令列表
const DANGEROUS_COMMANDS: string[] = [
  'rm -rf', 'rm -rf /*', 'mkfs', 'dd if=', 'format', 'diskpart',
  'chmod 777', 'chmod 000', 'chown', 'fdisk', 'shutdown', 'reboot', 'poweroff',
  'wget http://', 'curl http://evil', 'nc -e', 'bash -i >&', 'bash -i',
  '> /dev/sda', '> /dev/zero', ':(){ :|:& };:', 'boot', 'kill -9 1',
  'dd if=/dev/zero', 'mkfs.ext4', 'wipe', 'shred', 'atakill',
];

// 危险模式正则
const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*)?\s/,
  /\bmkfs/,
  /\bdd\s+if=/,
  /\bformat\b.*\bdisk/,
  /\bdiskpart\b/,
  /\bchmod\s+0*(000|777)/,
  /\bshred\b/,
  /\bwipe\b/,
  /\bsudo\s+rm\s+-rf/,
  /\bsudo\s+mkfs/,
  /\bwget\s+.*\|\s*(bash|sh|zsh)/,
  /\bcurl\s+.*\|\s*(bash|sh|zsh)/,
  /\bnc\s+-[el]/,
  /\bncat\s+-[el]/,
  /\becho\s+.>?\\s*\/etc\/(passwd|shadow|sudoers)/,
  /\bboot\b.*\bformat\b/,
  /\bkill\s+-9\s+1\b/,
];

export interface DangerCheckResult {
  blocked: boolean;
  matchedCommand?: string;
  matchedPattern?: string;
}

/**
 * 检查危险命令
 * @param command - 要检查的命令字符串
 * @returns 检查结果
 */
export function checkDangerousCommand(command: string): DangerCheckResult {
  const trimmed = command.trim();

  if (!trimmed) {
    return { blocked: false };
  }

  // 检查黑名单命令
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (trimmed.includes(dangerous) || command.includes(dangerous)) {
      logger.warn(`Blocked dangerous command: ${dangerous} in ${trimmed}`);
      return { blocked: true, matchedCommand: dangerous };
    }
  }

  // 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.warn(`Blocked dangerous pattern: ${pattern.source} in ${trimmed}`);
      return { blocked: true, matchedPattern: pattern.source };
    }
  }

  // 检查子shell注入
  const subshellMatch = trimmed.match(/\$\(([^)]+)\)/g);
  if (subshellMatch) {
    for (const match of subshellMatch) {
      const inner = match.slice(2, -1);
      for (const dangerous of DANGEROUS_COMMANDS) {
        if (inner.includes(dangerous)) {
          logger.warn(`Blocked dangerous subshell: ${inner}`);
          return { blocked: true, matchedCommand: `$(...${dangerous}...)` };
        }
      }
    }
  }

  return { blocked: false };
}
