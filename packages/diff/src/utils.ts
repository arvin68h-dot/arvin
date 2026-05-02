import type { DiffHunk, DiffResult } from './computer.js';

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function stringifyDiffHunks(hunks: DiffHunk[]): string {
  const parts: string[] = [];
  for (const hunk of hunks) {
    if (hunk.header) parts.push(hunk.header);
    for (const line of hunk.lines) {
      parts.push(line);
    }
  }
  return parts.join('\n');
}

export function mergeConsecutiveHunks(hunks: DiffHunk[]): DiffHunk[] {
  if (hunks.length <= 1) return hunks;

  const merged: DiffHunk[] = [hunks[0]];
  for (let i = 1; i < hunks.length; i++) {
    const current = hunks[i];
    const prev = merged[merged.length - 1];
    if (prev.oldStart + prev.oldCount === current.oldStart) {
      const mergedLines = [...prev.lines, ...current.lines];
      merged[merged.length - 1] = {
        oldStart: prev.oldStart,
        oldCount: prev.oldCount + current.oldCount,
        newStart: prev.newStart,
        newCount: prev.newCount + current.newCount,
        lines: mergedLines,
        header: `@@ -${prev.oldStart},${prev.oldCount + current.oldCount} +${prev.newStart},${prev.newCount + current.newCount} @@`,
      };
    } else {
      merged.push(current);
    }
  }
  return merged;
}

export function computeDiff(oldText: string, newText: string): DiffResult {
  return {
    hunks: [
      {
        oldStart: 1,
        oldCount: oldText.split('\n').length,
        newStart: 1,
        newCount: newText.split('\n').length,
        lines: ['-' + oldText, '+' + newText],
        header: '@@ -1,0 +1,0 @@',
      },
    ],
    sameLines: 0,
    addedLines: newText.split('\n').length,
    removedLines: oldText.split('\n').length,
  };
}
