import type { DiffHunk } from './computer.js';

export interface DiffPatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

function countPrefixLines(lines: string[], prefix: string): number {
  let count = 0;
  for (const line of lines) {
    if (line.startsWith(prefix)) count++;
    else if (line.startsWith(' ')) count++;
    else break;
  }
  return count;
}

function countNonPrefixLines(lines: string[], prefix: string): number {
  let count = 0;
  for (const line of lines) {
    if (line.startsWith(prefix)) count++;
    else break;
  }
  return count;
}

export function applyPatch(oldContent: string, patch: { hunks: DiffPatchHunk[] }): { success: boolean; newContent: string } {
  const oldLines = oldContent.split('\n');

  // Process hunks in reverse order to avoid index shifting
  for (let h = patch.hunks.length - 1; h >= 0; h--) {
    const hunk = patch.hunks[h];
    const oldIdx = hunk.oldStart - 1;
    const newLines: string[] = [];

    for (const line of hunk.lines) {
      if (line.startsWith('-')) {
        // Skip this old line (removed)
        continue;
      } else if (line.startsWith('+')) {
        newLines.push(line.slice(1));
      } else {
        // ' ' prefix or empty = unchanged line
        newLines.push(line.slice(1) || '');
      }
    }

    oldLines.splice(oldIdx, hunk.oldCount, ...newLines);
  }

  return { success: true, newContent: oldLines.join('\n') };
}
