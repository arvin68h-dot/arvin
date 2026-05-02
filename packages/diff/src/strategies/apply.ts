import type { DiffHunk } from '../computer.js';

export interface PatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export function computePatch(oldContent: string, newContent: string): PatchHunk {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const merged: string[] = [];
  for (const line of oldLines) {
    merged.push(`-${line}`);
  }
  for (const line of newLines) {
    merged.push(`+${line}`);
  }

  return {
    oldStart: 1,
    oldCount: oldLines.length,
    newStart: 1,
    newCount: newLines.length,
    lines: merged,
  };
}

export function createPatchFromDiff(diff: DiffHunk): PatchHunk {
  return {
    oldStart: diff.oldStart,
    oldCount: diff.oldCount,
    newStart: diff.newStart,
    newCount: diff.newCount,
    lines: diff.lines,
  };
}
