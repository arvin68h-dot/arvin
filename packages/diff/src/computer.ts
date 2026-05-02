export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
  header?: string;
}

export interface DiffResult {
  hunks: DiffHunk[];
  sameLines: number;
  addedLines: number;
  removedLines: number;
}

function lcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

export function diff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const dp = lcs(oldLines, newLines);

  const m = oldLines.length;
  const n = newLines.length;

  // Backtrack to get the diff
  const addedLines: string[] = [];
  const removedLines: string[] = [];

  let i = oldLines.length;
  let j = newLines.length;
  const opStack: string[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      opStack.push(` ${oldLines[i - 1]}`);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      opStack.push(`+${newLines[j - 1]}`);
      addedLines.push(newLines[j - 1]);
      j--;
    } else {
      opStack.push(`-${oldLines[i - 1]}`);
      removedLines.push(oldLines[i - 1]);
      i--;
    }
  }

  opStack.reverse();

  // Create a single consolidated hunk
  const header = `@@ -1,${oldLines.length} +1,${newLines.length} @@`;

  return {
    hunks: [
      {
        oldStart: 1,
        oldCount: oldLines.length,
        newStart: 1,
        newCount: newLines.length,
        lines: opStack,
        header,
      },
    ],
    sameLines: dp[m][n],
    addedLines: addedLines.length,
    removedLines: removedLines.length,
  };
}
