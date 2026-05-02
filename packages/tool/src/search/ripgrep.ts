import { execFile } from 'child_process';
import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';

export interface SearchOptions {
  pattern: string;
  dir?: string;
  glob?: string;
  maxResults?: number;
  caseSensitive?: boolean;
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
}

export function createRipgrepTool() {
  const logger = createLogger({ name: 'tool:ripgrep', level: LogLevel.INFO });

  return {
    name: 'search',
    description: 'Search files using ripgrep (rg). Fast code search with pattern matching.',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const pattern = input.pattern as string;
      if (!pattern) {
        return { success: false, content: 'Error: "pattern" is required' };
      }

      const dir = (input.dir as string) || ctx.workspaceRoot;
      const maxResults = (input.maxResults as number) || 100;
      const caseSensitive = (input.caseSensitive as boolean) ?? false;
      const glob = input.glob as string | undefined;

      const args: string[] = ['--no-heading', '--line-number', '--column', '-n'];
      if (!caseSensitive) args.push('-i');
      if (glob) args.push('--glob', glob);
      args.push('-m', String(maxResults));
      args.push(pattern, dir);

      return new Promise(resolve => {
        execFile('rg', args, { cwd: ctx.workspaceRoot, timeout: 15000 }, (err, stdout, stderr) => {
          if (err) {
          const errno = err as NodeJS.ErrnoException;
          const codeStr = String(errno.code ?? '');
          if (codeStr === '1') {
            resolve({ success: true, content: 'No matches found' });
          } else {
            resolve({ success: false, content: `rg error: ${errno.message}` });
          }
            return;
          }

          const results: SearchResult[] = [];
          for (const line of stdout.trim().split('\n')) {
            if (!line) continue;
            const match = line.match(/^(.+):(\d+):(\d+)\s+(.+)$/);
            if (match) {
              results.push({
                file: match[1],
                line: parseInt(match[2]),
                column: parseInt(match[3]),
                text: match[4],
              });
            }
          }

          const output = results.map(r => `${r.file}:${r.line}:${r.column}  ${r.text}`).join('\n');
          resolve({ success: true, content: output || 'No matches found', metadata: { count: results.length } });
        });
      });
    },
  };
}
