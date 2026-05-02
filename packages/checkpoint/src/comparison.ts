// CodeEngine Checkpoint — Comparison between two checkpoint directories
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckpointDiff } from './types.js';

/**
 * Compare two checkpoint directories and return the diff.
 * Returns added, modified, and deleted file lists with stats.
 */
export function compareCheckpoints(
  dir1: string,
  dir2: string,
): CheckpointDiff {
  const files1 = getAllFiles(dir1);
  const files2 = getAllFiles(dir2);

  const set1 = new Set(files1);
  const set2 = new Set(files2);

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  // Files in dir2 but not in dir1
  for (const file of files2) {
    if (!set1.has(file)) {
      added.push(file);
    } else {
      // Check if content differs
      const content1 = getFileContent(dir1, file);
      const content2 = getFileContent(dir2, file);
      if (content1 !== content2) {
        modified.push(file);
      }
    }
  }

  // Files in dir1 but not in dir2
  for (const file of files1) {
    if (!set2.has(file)) {
      deleted.push(file);
    }
  }

  const totalFiles = new Set([...set1, ...set2]).size;

  return {
    added,
    modified,
    deleted,
    stats: {
      totalFiles,
      addedCount: added.length,
      modifiedCount: modified.length,
      deletedCount: deleted.length,
    },
  };
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);

    if (st.isDirectory()) {
      const subFiles = getAllFiles(fullPath);
      for (const sf of subFiles) {
        files.push(join(entry, sf));
      }
    } else if (entry !== 'metadata.json') {
      files.push(entry);
    }
  }

  return files;
}

function getFileContent(dir: string, file: string): string {
  const fullPath = join(dir, file);
  try {
    return readFileSync(fullPath, 'utf-8');
  } catch {
    return '';
  }
}
