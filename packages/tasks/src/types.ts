// CodeEngine Tasks — Types

export enum TaskStatus {
  pending = 'pending',
  running = 'running',
  completed = 'completed',
  failed = 'failed',
  cancelled = 'cancelled',
}

export interface TaskNode {
  id: string;
  description: string;
  status: TaskStatus;
  dependsOn: string[];
  result?: string;
  error?: string;
  attempts: number;
  maxAttempts: number;
}

export interface TaskPlan {
  id: string;
  title: string;
  description: string;
  tasks: TaskNode[];
  createdAt: number;
  completedCount: number;
  totalTasks: number;
}
