import { execFile } from 'child_process';
import { truncateOutput } from '../shell/output';

export function runGit(args: string[], cwd: string): Promise<{ success: boolean; content: string; metadata?: Record<string, unknown> }> {
  return new Promise(resolve => {
    execFile('git', args, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, content: `git ${args[0]} failed: ${stderr || (err as Error).message}`, metadata: { exitCode: (err as NodeJS.ErrnoException).code } });
        return;
      }
      resolve({
        success: true,
        content: truncateOutput(stdout.trim() || '(no output)'),
        metadata: { exitCode: 0 },
      });
    });
  });
}
