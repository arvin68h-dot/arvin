import type { DiffHunk } from '../computer.js';

export function createInsertPatch(
  filePath: string,
  targetLine: number,
  newContent: string,
): DiffHunk {
  const lines: string[] = [];
  const newLines = newContent.split('\n');
  for (const line of newLines) {
    lines.push(`+${line}`);
  }

  return {
    oldStart: targetLine,
    oldCount: 0,
    newStart: targetLine,
    newCount: newLines.length,
    lines,
    header: `@@ -${targetLine},0 +${targetLine},${newLines.length} @@`,
  };
}

export function getInsertInfo(targetLine: number, newContent: string): { path: string; line: number; text: string } {
  return { path: '', line: targetLine, text: newContent };
}
