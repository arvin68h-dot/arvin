import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';
import { runGit } from './utils';

export function createGitBranchTool() {
  const logger = createLogger({ name: 'tool:git_branch', level: LogLevel.INFO });

  return {
    name: 'git_branch',
    description: 'Git branch operations. Use action: "list" (default), "create", or "switch".',
    execute: async (input: Record<string, unknown>, ctx: RuntimeContext) => {
      const action = (input.action as string) || 'list';
      const name = input.name as string;

      switch (action) {
        case 'list':
          return runGit(['branch', '-v'], ctx.workspaceRoot);
        case 'create':
          if (!name) {
            return { success: false, content: 'Error: "name" required for create action' };
          }
          return runGit(['branch', name], ctx.workspaceRoot);
        case 'switch':
          if (!name) {
            return { success: false, content: 'Error: "name" required for switch action' };
          }
          return runGit(['checkout', name], ctx.workspaceRoot);
        default:
          return { success: false, content: `Unknown branch action: ${action}` };
      }
    },
  };
}
