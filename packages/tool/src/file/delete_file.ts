import * as fs from 'fs';
import * as path from 'path';
import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';

const PROTECTED_PATHS = ['/', '/System', '/usr', '/etc', '/bin', '/sbin'];

export function createDeleteFileTool() {
  const logger = createLogger({ name: 'tool:delete_file', level: LogLevel.INFO });

  return {
    name: 'delete_file',
    description: 'Delete a file. Checks if path is protected before deletion.',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const filePath = input.path as string;
      if (!filePath) {
        return { success: false, content: 'Error: "path" is required' };
      }

      const fullPath = path.resolve(ctx.workspaceRoot, filePath);

      for (const p of PROTECTED_PATHS) {
        if (fullPath === p || fullPath.startsWith(p + '/')) {
          return { success: false, content: `Error: Refused to delete protected path: ${fullPath}` };
        }
      }

      if (!fs.existsSync(fullPath)) {
        return { success: false, content: `File not found: ${fullPath}` };
      }

      try {
        fs.unlinkSync(fullPath);
        logger.debug(`Deleted ${fullPath}`);
        return { success: true, content: `Deleted: ${fullPath}` };
      } catch (err) {
        return { success: false, content: `Delete failed: ${(err as Error).message}` };
      }
    },
  };
}
