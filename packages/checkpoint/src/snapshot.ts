// CodeEngine Checkpoint — Snapshot creation
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CheckpointFile } from './types.js';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.codeengine',
  'dist',
  'build',
  '.vscode',
  '.idea',
  '.DS_Store',
]);

const DEFAULT_PATTERNS = ['*'];

function shouldIgnore(dir: string, baseDir: string): boolean {
  const relPath = relative(baseDir, dir);
  if (relPath === '') return false;
  const parts = relPath.split(/[\\/]/);
  return parts.some((part) => IGNORE_DIRS.has(part));
}

/**
 * Create a snapshot of all files in a directory.
 * Scans recursively and computes SHA-256 hashes.
 */
export async function createSnapshot(
  dir: string,
  filePatterns: string[] = DEFAULT_PATTERNS,
): Promise<CheckpointFile[]> {
  if (!existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  const files: CheckpointFile[] = [];
  const patterns = filePatterns.length > 0 ? filePatterns : DEFAULT_PATTERNS;

  function walk(currentDir: string): void {
    if (shouldIgnore(currentDir, dir)) return;

    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try {
        const st = statSync(fullPath);
        if (st.isDirectory()) {
          walk(fullPath);
          continue;
        }

        // Check file patterns
        if (!matchesPattern(entry, patterns)) continue;

        let content: string;
        let fileContent: Buffer;
        try {
          fileContent = readFileSync(fullPath);
          content = fileContent.toString('utf-8');
        } catch {
          // Try binary read
          fileContent = readFileSync(fullPath);
          content = fileContent.toString('base64');
        }
        const hash = createHash('sha256').update(fileContent).digest('hex');
        const relPath = relative(dir, fullPath);

        files.push({
          path: relPath,
          hash,
          content,
          size: st.size,
        });
      } catch {
        // Skip inaccessible files
      }
    }
  }

  walk(dir);
  return files;
}

function matchesPattern(fileName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // Support simple glob patterns like *.ts, *.js, etc.
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      );
      return regex.test(fileName);
    }
    return fileName === pattern;
  });
}
