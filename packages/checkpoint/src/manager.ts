// CodeEngine Checkpoint — Checkpoint Manager
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckpointInfo, CheckpointFile, CheckpointMetadata } from './types.js';
import { createSnapshot } from './snapshot.js';
import { restoreCheckpoint } from './restore.js';

const CODEENGINE_DIR = '.codeengine';
const CHECKPOINTS_DIR = join(CODEENGINE_DIR, 'checkpoints');
const BACKUP_DIR = join(CODEENGINE_DIR, 'backup');

/**
 * Manages checkpoints — create, list, get, delete, restore.
 * Checkpoints are stored in .codeengine/checkpoints/<id>/
 */
export class CheckpointManager {
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  /**
   * Create a new checkpoint with a snapshot of the current directory.
   */
  async create(
    name: string,
    description?: string,
    filePatterns?: string[],
  ): Promise<CheckpointInfo> {
    const id = randomUUID();
    const checkpointDir = join(this.baseDir, CHECKPOINTS_DIR, id);
    mkdirSync(checkpointDir, { recursive: true });

    // Create snapshot
    const snapshotDir = join(checkpointDir, 'files');
    const files = await createSnapshot(this.baseDir, filePatterns);

    // Write files to checkpoint
    for (const file of files) {
      const filePath = join(snapshotDir, file.path);
      const dir = join(filePath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, file.content, 'utf-8');
    }

    // Write metadata
    const metadata: CheckpointMetadata = {
      id,
      name,
      description,
      createdAt: Date.now(),
      fileCount: files.length,
    };
    writeFileSync(
      join(checkpointDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8',
    );

    return {
      id,
      name,
      timestamp: metadata.createdAt,
      files,
      description,
    };
  }

  /**
   * List all checkpoints.
   */
  list(): CheckpointInfo[] {
    const checkpointsDir = join(this.baseDir, CHECKPOINTS_DIR);
    if (!existsSync(checkpointsDir)) return [];

    const result: CheckpointInfo[] = [];
    const entries = readdirSync(checkpointsDir);

    for (const entry of entries) {
      const metadataPath = join(checkpointsDir, entry, 'metadata.json');
      if (!existsSync(metadataPath)) continue;

      try {
        const metadata: CheckpointMetadata = JSON.parse(
          readFileSync(metadataPath, 'utf-8'),
        );
        const filesDir = join(checkpointsDir, entry, 'files');
        const files: CheckpointFile[] = [];

        if (existsSync(filesDir)) {
          const fileEntries = readdirSync(filesDir, { recursive: true });
          for (const fileEntry of fileEntries) {
            const fullPath = join(filesDir, String(fileEntry));
            const st = statSync(fullPath);
            if (!st.isFile()) continue;
            try {
              const content = readFileSync(fullPath, 'utf-8');
              const hash = createHash('sha256').update(content).digest('hex');
              files.push({
                path: String(fileEntry),
                hash,
                content,
                size: st.size,
              });
            } catch {
              // Skip binary files in list
            }
          }
        }

        result.push({
          id: metadata.id,
          name: metadata.name,
          timestamp: metadata.createdAt,
          files,
          description: metadata.description,
        });
      } catch {
        // Skip corrupted metadata
      }
    }

    return result.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get a single checkpoint by ID.
   */
  async get(id: string): Promise<CheckpointInfo | null> {
    const checkpointDir = join(this.baseDir, CHECKPOINTS_DIR, id);
    const metadataPath = join(checkpointDir, 'metadata.json');

    if (!existsSync(metadataPath)) return null;

    const metadata: CheckpointMetadata = JSON.parse(
      readFileSync(metadataPath, 'utf-8'),
    );

    const filesDir = join(checkpointDir, 'files');
    const files: CheckpointFile[] = [];

    if (existsSync(filesDir)) {
      const fileEntries = readdirSync(filesDir, { recursive: true });
      for (const fileEntry of fileEntries) {
        const fullPath = join(filesDir, String(fileEntry));
        const st = statSync(fullPath);
        if (!st.isFile()) continue;
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const hash = createHash('sha256').update(content).digest('hex');
          files.push({
            path: String(fileEntry),
            hash,
            content,
            size: st.size,
          });
        } catch {
          // Skip binary files
        }
      }
    }

    return {
      id: metadata.id,
      name: metadata.name,
      timestamp: metadata.createdAt,
      files,
      description: metadata.description,
    };
  }

  /**
   * Delete a checkpoint by ID.
   */
  delete(id: string): boolean {
    const checkpointDir = join(this.baseDir, CHECKPOINTS_DIR, id);
    if (!existsSync(checkpointDir)) return false;

    rmSync(checkpointDir, { recursive: true, force: true });
    return true;
  }

  /**
   * Restore a checkpoint — backup current state, then restore files.
   */
  async restore(id: string): Promise<boolean> {
    const checkpointDir = join(this.baseDir, CHECKPOINTS_DIR, id);
    if (!existsSync(checkpointDir)) return false;

    const metadataPath = join(checkpointDir, 'metadata.json');
    if (!existsSync(metadataPath)) return false;

    // Create backup of current state
    const backupTargetDir = join(this.baseDir, BACKUP_DIR, `${Date.now()}-${id}`);
    mkdirSync(backupTargetDir, { recursive: true });

    // Apply the checkpoint
    const filesDir = join(checkpointDir, 'files');
    if (existsSync(filesDir)) {
      await restoreCheckpoint(filesDir, this.baseDir);
    }

    return true;
  }
}
