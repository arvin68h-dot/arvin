import * as fs from 'fs';
import * as path from 'path';
import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';

// 禁止写入的系统目录前缀
const BLOCKED_PREFIXES: string[] = [
  '/etc/',
  '/etc',
  '/root/',
  '/root',
  '/home/',
  '/usr/',
  '/bin/',
  '/sbin/',
  '/lib/',
  '/proc/',
  '/sys/',
  '/dev/',
  '/var/',
];

/**
 * 验证文件写入路径的安全性
 * 确保目标路径在允许的目录范围内，不写入系统敏感目录
 * @param resolvedPath - 已解析的绝对路径
 * @param workspaceRoot - 工作区根目录
 * @returns 验证结果，包含是否安全及失败原因
 */
export function validateWritePath(resolvedPath: string, workspaceRoot: string): {
  safe: boolean;
  reason?: string;
} {
  // 检查系统前缀
  for (const prefix of BLOCKED_PREFIXES) {
    if (resolvedPath.startsWith(prefix)) {
      return {
        safe: false,
        reason: `禁止写入系统目录: ${prefix}`,
      };
    }
  }

  // 检查是否在 workspaceRoot 内（防止通过 ../ 逃逸）
  const normalizedWorkspace = path.normalize(workspaceRoot) + path.sep;
  const normalizedPath = path.normalize(resolvedPath);

  if (!normalizedPath.startsWith(normalizedWorkspace)) {
    return {
      safe: false,
      reason: `路径逃逸: 目标不在工作区范围内 (${workspaceRoot})`,
    };
  }

  return { safe: true };
}

export interface WriteFileOptions {
  path: string;
  content: string;
}

export interface WriteFileResult {
  path: string;
  created: boolean;
  size: number;
}

export function createWriteFileTool() {
  const logger = createLogger({ name: 'tool:write_file', level: LogLevel.INFO });

  return {
    name: 'write_file',
    description: 'Write content to file. Auto-creates parent directories. Backs up existing file to .bak. Security: validates paths against system directories.',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const filePath = input.path as string;
      const content = input.content as string;
      if (!filePath) {
        return { success: false, content: 'Error: "path" is required' };
      }
      if (content === undefined) {
        return { success: false, content: 'Error: "content" is required' };
      }

      const resolvedPath = path.resolve(ctx.workspaceRoot, filePath);

      // 安全验证：检查路径是否在允许范围内
      const validation = validateWritePath(resolvedPath, ctx.workspaceRoot);
      if (!validation.safe) {
        logger.warn(`Write blocked: ${validation.reason} (path: ${resolvedPath})`);
        return {
          success: false,
          content: `Write blocked: ${validation.reason}`,
          metadata: { blocked: true, reason: validation.reason },
        };
      }

      const dir = path.dirname(resolvedPath);

      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const created = !fs.existsSync(resolvedPath);
        if (fs.existsSync(resolvedPath)) {
          const bakPath = resolvedPath + '.bak';
          fs.copyFileSync(resolvedPath, bakPath);
        }

        fs.writeFileSync(resolvedPath, content, 'utf-8');
        const size = fs.statSync(resolvedPath).size;

        // 记录所有写操作
        logger.info(`Write operation: ${size} bytes to ${resolvedPath} (created: ${created})`);

        return {
          success: true,
          content: `Written ${size} bytes`,
          metadata: { path: resolvedPath, created },
        };
      } catch (err) {
        return { success: false, content: `Write failed: ${(err as Error).message}` };
      }
    },
  };
}
