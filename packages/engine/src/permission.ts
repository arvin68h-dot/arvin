// CodeEngine Permission Engine — 权限管理引擎
// 管理工具访问权限、目录范围、用户确认机制

import {
  type PermissionLevel,
  type PermissionEntry,
  PermissionLevel as PermLevel,
  LogLevel,
  createLogger,
} from '@codeengine/core';

// ─── 权限策略 ───

export interface PermissionPolicy {
  default: PermissionLevel;
  asksAllowed: boolean;
  autoApprovePatterns?: { tool: string; pattern: string }[];
}

// ─── 危险命令黑名单 ───

// 所有危险命令的字符串模式（用于直接匹配）
const DANGEROUS_COMMANDS: string[] = [
  'rm -rf',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  'format',
  'diskpart',
  'chmod 777',
  'chown',
  'fdisk',
  'shutdown',
  'reboot',
  'poweroff',
  'wget http://evil',
  'curl http://evil',
  'nc -e',
  'bash -i >&',
  '> /dev/sda',
  ':(){ :|:& };:',
  'boot',
  'kill -9 1',
];

// 用于正则匹配的复合模式（支持子shell、管道等变种攻击）
const DANGEROUS_PATTERNS: RegExp[] = [
  // 危险目录操作
  /\brm\s+(-rf|-\s+rf)/,
  /\brm\s+-rf\s+\/\//,
  /\brm\s+-rf\s+\//,
  /\brm\s+-rf\s+\.\//,

  // 磁盘/分区操作
  /\bmkfs/,
  /\bdd\s+if=/,
  /\bformat\s/,
  /\bdiskpart/,
  /\bfdisk/,

  // 危险权限操作
  /\bchmod\s+777/,
  /\bchmod\s+0?777/,
  /\bchown\s+/,

  // 系统关机/重启
  /\bshutdown\s/,
  /\breboot\s/,
  /\bpoweroff\s/,

  // 网络恶意下载
  /wget\s+https?:\/\/(?!localhost)(?!127\.0\.0\.1)[^\s]+\|.*sh/,
  /curl\s+https?:\/\/(?!localhost)(?!127\.0\.0\.1)[^\s]+\|.*sh/,
  /\bcurl\s+.*\|\s*bash/,
  /\bwget\s+.*\|\s*sh/,

  // 网络反弹shell
  /nc\s+-[aelp]\s/,
  /nc\s+.*\s+-e\s+/,
  /ncat\s+-[acl]\s/,
  /\bnc\s+-[el]\s/,
  /bash\s+-i\s+>&/,
  /\/bin\/(ba)?sh\s+-i\s+>&/,

  // 系统设备写入
  />\s*\/dev\/(sda|sdb|hda|hdb|nvme|vd[a-z])/,
  /dd\s+.*of=\/dev\//,

  // 逃逸型命令
  /:\(\)\s*\{\s*:\|&\s*\}\s*:/,

  // 系统进程杀手
  /\bkill\s+-9\s+1\b/,
  /\bsudo\s+kill\s+-9\s+1\b/,

  // 子shell逃逸
  /\$\(.*\brm\s+-rf\b.*\)/,
  /\$\(.*\bmkfs\b.*\)/,
  /\$\(.*\bdd\s+if=.*\)/,
  /\$\(.*\bshutdown\b.*\)/,
  /\$\(.*\breboot\b.*\)/,
  /\$\(.*\bchmod\s+777\b.*\)/,

  // 命令替换逃逸
  /\`.*\brm\s+-rf\b.*\`/,
  /\`.*\bmkfs\b.*\`/,
  /\`.*\bdd\s+if=.*\`/,

  // eval 执行恶意命令
  /\beval\s+.*rm\s+-rf\b/,
  /\beval\s+.*mkfs\b/,

  // 通过 source 加载恶意脚本
  /\bsource\s+https?:\/\//,
  /\b\.\s+https?:\/\//,

  // tar 破坏
  /\btar\s+.*--delete\s+.*\//,
  /\btar\s+-cf\s+\/dev\/(sda|sdb|hd[a-z])/,
];

/** 完整的危险命令列表（字符串 + 正则模式的复合检查） */
export interface DangerousCommandCheck {
  /** 匹配的黑名单命令 */
  matchedCommand?: string;
  /** 匹配的正则模式 */
  matchedPattern?: string;
  /** 是否被阻断 */
  blocked: boolean;
}

/**
 * 检查命令是否为危险命令
 * 同时支持精确字符串匹配和正则表达式匹配（覆盖子shell、管道等变种攻击）
 * @param command - 要检查的命令字符串
 * @returns 检查结果的详细对象
 */
export function checkDangerousCommand(command: string): DangerousCommandCheck {
  // 精确命令匹配
  for (const cmd of DANGEROUS_COMMANDS) {
    if (command.includes(cmd)) {
      return { matchedCommand: cmd, blocked: true };
    }
  }

  // 正则表达式模式匹配（支持子shell、管道等变种）
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { matchedPattern: pattern.source, blocked: true };
    }
  }

  return { blocked: false };
}

// ─── 权限引擎 ───

export interface PermissionRequest {
  toolName: string;
  input?: Record<string, unknown>;
  prompt?: string;
}

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export class PermissionEngine {
  private readonly policies: Map<string, PermissionEntry> = new Map();
  private readonly decisions: Map<string, PermissionDecision> = new Map();
  private readonly policy: Required<PermissionPolicy>;
  private readonly logger;

  constructor(policy?: Partial<PermissionPolicy>) {
    this.policy = {
      default: policy?.default ?? PermLevel.DEFAULT,
      asksAllowed: policy?.asksAllowed ?? true,
      autoApprovePatterns: policy?.autoApprovePatterns ?? [],
    };
    this.logger = createLogger({ name: 'permission', level: LogLevel.INFO });
  }

  /** 注册权限规则 */
  setPermission(toolName: string, level: PermissionLevel, pattern?: string): void {
    this.policies.set(toolName, {
      tool: toolName,
      level,
      pattern,
    });
    this.logger.info(`Permission set: ${toolName} = ${level}`);
  }

  /** 检查工具权限 */
  checkPermission(toolName: string, input?: Record<string, unknown>): PermissionDecision {
    // 检查已缓存的决定
    const cached = this.decisions.get(toolName);
    if (cached) return cached;

    // 检查权限规则
    const entry = this.policies.get(toolName);

    if (!entry) {
      // 未配置规则，使用默认策略
      return this.handleDefault(toolName);
    }

    // 检查 pattern 匹配
    if (entry.pattern && input?.folder) {
      // 简单 pattern 匹配 (TODO: 支持 glob)
      if (!this.matchPattern(entry.pattern, input.folder as string)) {
        return this.handleDefault(toolName);
      }
    }

    const decision = this.levelToDecision(entry.level);
    this.decisions.set(toolName, decision);
    return decision;
  }

  /** 处理默认策略 */
  private handleDefault(toolName: string): PermissionDecision {
    switch (this.policy.default) {
      case PermLevel.ALWAYS_ALLOW:
        return 'allow';
      case PermLevel.ALWAYS_DENY:
        return 'deny';
      case PermLevel.ASK:
        return 'ask';
      default:
        // DEFAULT: 危险操作 ask，其他 allow
        return this.isDangerousTool(toolName) ? 'ask' : 'allow';
    }
  }

  /** 权限等级转决策 */
  private levelToDecision(level: PermissionLevel): PermissionDecision {
    switch (level) {
      case PermLevel.ALWAYS_ALLOW:
        return 'allow';
      case PermLevel.ALWAYS_DENY:
        return 'deny';
      case PermLevel.ASK:
      case PermLevel.UNDECIDED:
        return 'ask';
      default:
        return this.isDangerousTool(level) ? 'ask' : 'allow';
    }
  }

  /** 是否为危险工具 */
  private isDangerousTool(nameOrLevel: string | PermissionLevel): boolean {
    const name = typeof nameOrLevel === 'string' ? nameOrLevel : nameOrLevel;
    const dangerous = ['shell', 'exec', 'delete', 'dangerous'];
    return dangerous.some(d => name.toLowerCase().includes(d));
  }

  /** 匹配 pattern */
  private matchPattern(pattern: string, value: string): boolean {
    // 简单通配符匹配
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(value);
  }

  /** 用户确认 */
  async confirm(request: PermissionRequest): Promise<PermissionDecision> {
    if (!this.policy.asksAllowed) return 'allow';

    // TODO: 实际的 TUI 确认对话框
    // 这里返回 ask，由上层 UI 处理
    this.logger.info(`Permission request: ${request.toolName}`);
    return 'ask';
  }

  /** 记住用户决定 */
  rememberDecision(toolName: string, decision: PermissionDecision): void {
    this.decisions.set(toolName, decision);
    const level = this.decisionToLevel(decision);
    this.setPermission(toolName, level);
    this.logger.info(`Remembered decision: ${toolName} = ${decision}`);
  }

  /** 清除缓存决定 */
  clearDecision(toolName?: string): void {
    if (toolName) {
      this.decisions.delete(toolName);
    } else {
      this.decisions.clear();
    }
  }

  private decisionToLevel(decision: PermissionDecision): PermissionLevel {
    switch (decision) {
      case 'allow': return PermLevel.ALWAYS_ALLOW;
      case 'deny': return PermLevel.ALWAYS_DENY;
      case 'ask': return PermLevel.ASK;
    }
  }

  listPermissions(): PermissionEntry[] {
    return Array.from(this.policies.values());
  }
}

let _permissionEngine: PermissionEngine | null = null;

export function getPermissionEngine(): PermissionEngine {
  if (!_permissionEngine) _permissionEngine = new PermissionEngine();
  return _permissionEngine;
}
