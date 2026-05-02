import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';
import { runGit } from './utils';

export function createGitCommitTool() {
  const logger = createLogger({ name: 'tool:git_commit', level: LogLevel.INFO });

  return {
    name: 'git_commit',
    description: 'Commit staged changes with git commit. Requires "message" parameter.',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const message = input.message as string;
      if (!message) {
        return { success: false, content: 'Error: "message" is required' };
      }

      const args = ['commit', '-m', message];
      const result = await runGit(args, ctx.workspaceRoot);
      return result;
    },
  };
}
