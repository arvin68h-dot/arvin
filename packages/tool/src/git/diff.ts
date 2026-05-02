import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';
import { runGit } from './utils';

export function createGitDiffTool() {
  const logger = createLogger({ name: 'tool:git_diff', level: LogLevel.INFO });

  return {
    name: 'git_diff',
    description: 'Show git diff. Supports "working" (unstaged changes) or "staged" (staged changes).',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const type = (input.type as 'working' | 'staged') || 'working';
      const args = type === 'staged' ? ['diff', '--cached'] : ['diff'];
      const result = await runGit(args, ctx.workspaceRoot);
      return result;
    },
  };
}
