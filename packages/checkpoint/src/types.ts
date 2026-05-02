// CodeEngine Checkpoint — Types

export interface CheckpointInfo {
  id: string;
  name: string;
  timestamp: number;
  files: CheckpointFile[];
  description?: string;
}

export interface CheckpointFile {
  path: string;
  hash: string;
  content: string;
  size: number;
}

export interface CheckpointDiff {
  added: string[];
  modified: string[];
  deleted: string[];
  stats: {
    totalFiles: number;
    addedCount: number;
    modifiedCount: number;
    deletedCount: number;
  };
}

export interface CheckpointMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  fileCount: number;
}
