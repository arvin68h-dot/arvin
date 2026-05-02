import * as fs from 'fs';
import * as path from 'path';
import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';

export interface EditFileOptions {
  path: string;
  mode: 'exactReplace' | 'insert' | 'deleteLines';
  oldString?: string;
  newString?: string;
  range?: [number, number];
}

export function createEditFileTool() {
  const logger = createLogger({ name: 'tool:edit_file', level: LogLevel.INFO });

  return {
    name: 'edit_file',
    description: 'Edit file with 3 modes: exactReplace (find+replace exact string), insert (insert text at line), deleteLines (delete line range). Auto-creates directories.',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const filePath = input.path as string;
      const mode = input.mode as 'exactReplace' | 'insert' | 'deleteLines';
      if (!filePath) {
        return { success: false, content: 'Error: "path" is required' };
      }
      if (!mode) {
        return { success: false, content: 'Error: "mode" is required (exactReplace|insert|deleteLines)' };
      }

      const fullPath = path.resolve(ctx.workspaceRoot, filePath);
      let content: string;
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch (err) {
        return { success: false, content: `Read failed: ${(err as Error).message}` };
      }

      const lines = content.split('\n');
      let result: { success: boolean; content: string; metadata?: Record<string, unknown> };

      switch (mode) {
        case 'exactReplace': {
          const oldStr = input.oldString as string;
          const newStr = input.newString as string;
          if (!oldStr) {
            return { success: false, content: 'Error: "oldString" is required for exactReplace mode' };
          }

          const idx = content.indexOf(oldStr);
          if (idx === -1) {
            const suggestion = `Could not find exact match for oldString.\nFirst 200 chars of file:\n${content.slice(0, 200)}`;
            return { success: false, content: suggestion };
          }

          const newContent = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
          fs.writeFileSync(fullPath, newContent, 'utf-8');
          logger.debug(`Exact replaced in ${fullPath}`);
          result = { success: true, content: 'File replaced successfully', metadata: { mode: 'exactReplace' } };
          break;
        }

        case 'insert': {
          const lineNum = input.line as number;
          const insertText = input.newString as string;
          if (!lineNum) {
            return { success: false, content: 'Error: "line" (line number) and "newString" are required for insert mode' };
          }
          if (!insertText) {
            return { success: false, content: 'Error: "newString" is required for insert mode' };
          }

          const insertIdx = Math.min(Math.max(0, lineNum - 1), lines.length);
          lines.splice(insertIdx, 0, insertText);
          const newContent = lines.join('\n');
          fs.writeFileSync(fullPath, newContent, 'utf-8');
          logger.debug(`Inserted at line ${lineNum} in ${fullPath}`);
          result = { success: true, content: `Inserted at line ${lineNum}`, metadata: { mode: 'insert', line: lineNum } };
          break;
        }

        case 'deleteLines': {
          const range = input.range as [number, number] | undefined;
          if (!range || !range[0] || !range[1]) {
            return { success: false, content: 'Error: "range" [start, end] required for deleteLines mode' };
          }
          const start = Math.max(0, range[0] - 1);
          const end = Math.min(lines.length, range[1]);
          const deleted = end - start;
          lines.splice(start, deleted);
          const newContent = lines.join('\n');
          fs.writeFileSync(fullPath, newContent, 'utf-8');
          logger.debug(`Deleted ${deleted} lines in ${fullPath}`);
          result = { success: true, content: `Deleted ${deleted} lines (${range[0]}-${range[1]})`, metadata: { mode: 'deleteLines', deleted } };
          break;
        }

        default:
          return { success: false, content: `Unknown mode: ${mode}` };
      }

      return result;
    },
  };
}
