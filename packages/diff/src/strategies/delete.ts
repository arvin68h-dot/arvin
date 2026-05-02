import type { DiffHunk } from '../computer.js';

export function createDeletePatch(
  filePath: string,
  startLine: number,
  endLine: number,
): DiffHunk {
  const count = endLine - startLine + 1;
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(`-`);
  }

  return {
    oldStart: startLine,
    oldCount: count,
    newStart: startLine,
    newCount: 0,
    lines,
    header: `@@ -${startLine},${count} +${startLine},0 @@`,
  };
}

export function getDeleteInfo(startLine: number, endLine: number): { start: number; end: number; count: number } {
  return { start: startLine, end: endLine, count: endLine - startLine + 1 };
}
