import * as fs from 'fs';
import * as path from 'path';
import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';

export interface ReadFileOptions {
  path: string;
  offset?: number;
  limit?: number;
}

export interface ReadFileResult {
  path: string;
  content: string;
  totalLines: number;
}

export function createReadFileTool() {
  const logger = createLogger({ name: 'tool:read_file', level: LogLevel.INFO });

  return {
    name: 'read_file',
    description: 'Read file content with optional line range (offset/limit). Returns content with line numbers.',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const filePath = input.path as string;
      if (!filePath) {
        return { success: false, content: 'Error: "path" is required' };
      }

      const fullPath = path.resolve(ctx.workspaceRoot, filePath);
      const offset = (input.offset as number) || 1;
      const limit = (input.limit as number) || 1000;

      let content: string;
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch (err) {
        return { success: false, content: `Read failed: ${(err as Error).message}` };
      }

      const lines = content.split('\n');
      const totalLines = lines.length;
      const start = Math.max(0, (offset || 1) - 1);
      const end = Math.min(totalLines, start + limit);
      const sliced = lines.slice(start, end);

      logger.debug(`Read ${sliced.length} lines from ${fullPath}`);
      return { success: true, content: sliced.join('\n'), metadata: { totalLines } };
    },
  };
}
