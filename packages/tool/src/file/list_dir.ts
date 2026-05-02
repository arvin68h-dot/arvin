import * as fs from 'fs';
import * as path from 'path';
import { createLogger, type RuntimeContext, type DirectoryEntry, LogLevel } from '@codeengine/core';

export function createListDirTool() {
  const logger = createLogger({ name: 'tool:list_dir', level: LogLevel.INFO });

  return {
    name: 'list_dir',
    description: 'List directory contents. Supports recursive listing with "recursive" option.',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const dirPath = input.path as string;
      const recursive = (input.recursive as boolean) ?? false;

      const fullDir = path.resolve(ctx.workspaceRoot, dirPath || '.');

      function list(dir: string, _prefix = ''): DirectoryEntry[] {
        const entries: DirectoryEntry[] = [];
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of items) {
          const name = entry.name;
          if (name.startsWith('.')) continue;
          const fullPath = path.join(dir, name);
          const stat = fs.statSync(fullPath);
          entries.push({
            path: fullPath,
            isDirectory: stat.isDirectory(),
            size: stat.isFile() ? stat.size : undefined,
            modified: stat.mtimeMs,
          });
          if (recursive && stat.isDirectory()) {
            entries.push(...list(fullPath, _prefix + '  '));
          }
        }
        return entries;
      }

      try {
        const entries = list(fullDir);
        const output = entries.map(e =>
          `${e.isDirectory ? '\u{1F4C1}' : '\u{1F4C4}'} ${e.path}${e.size !== undefined ? ` (${e.size} bytes)` : ''}`,
        ).join('\n');
        return { success: true, content: output, metadata: { count: entries.length } };
      } catch (err) {
        return { success: false, content: `List failed: ${(err as Error).message}` };
      }
    },
  };
}
