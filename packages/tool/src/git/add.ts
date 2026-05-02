import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';
import { runGit } from './utils';

export function createGitAddTool() {
  const logger = createLogger({ name: 'tool:git_add', level: LogLevel.INFO });

  return {
    name: 'git_add',
    description: 'Stage files with git add. Supports "all" (stage everything) or specific "paths".',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const all = (input.all as boolean) ?? false;
      const paths = input.paths as string[] | undefined;

      const args = all ? ['add', '-A'] : ['add', ...(paths || [])];
      const result = await runGit(args, ctx.workspaceRoot);
      return result;
    },
  };
}
