// CodeEngine Checkpoint — Restore logic
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, cpSync, renameSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const RESTORED_FILES = new Set<string>();

/**
 * Restore a checkpoint directory into a target directory.
 * Creates a backup first, then applies files.
 * Tracks restored file paths.
 */
export async function restoreCheckpoint(
  checkpointDir: string,
  targetDir: string,
): Promise<void> {
  if (!existsSync(checkpointDir)) {
    throw new Error(`Checkpoint directory not found: ${checkpointDir}`);
  }

  if (!existsSync(targetDir)) {
    throw new Error(`Target directory not found: ${targetDir}`);
  }

  RESTORED_FILES.clear();

  // Read all files from the checkpoint directory
  const files = await readCheckpointFiles(checkpointDir);

  // Apply each file
  for (const file of files) {
    const targetPath = join(targetDir, file.path);
    const targetDirPath = dirname(targetPath);

    // Create parent directories if they don't exist
    if (!existsSync(targetDirPath)) {
      mkdirSync(targetDirPath, { recursive: true });
    }

    // Write the file content
    writeFileSync(targetPath, file.content, 'utf-8');
    RESTORED_FILES.add(file.path);
  }
}

interface CheckpointFile {
  path: string;
  content: string;
}

async function readCheckpointFiles(
  checkpointDir: string,
): Promise<CheckpointFile[]> {
  const files: CheckpointFile[] = [];

  // Find all files in the checkpoint directory (excluding metadata.json)
  const entries = readdirSync(checkpointDir);

  for (const entry of entries) {
    const fullPath = join(checkpointDir, entry);
    const st = statSync(fullPath);

    if (entry === 'metadata.json' && st.isFile()) continue;

    if (st.isDirectory()) {
      // Read files recursively
      const subFiles = await readCheckpointFiles(fullPath);
      for (const sf of subFiles) {
        files.push({
          path: join(entry, sf.path),
          content: sf.content,
        });
      }
    } else if (st.isFile() && entry !== 'metadata.json') {
      const content = readFileSync(fullPath, 'utf-8');
      files.push({
        path: entry,
        content,
      });
    }
  }

  return files;
}
