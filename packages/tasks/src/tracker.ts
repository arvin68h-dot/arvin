// CodeEngine Tasks — Task Tracker
import type { TaskNode, TaskPlan } from './types.js';
import { TaskStatus } from './types.js';

/**
 * Track execution progress and generate reports for task plans.
 */
export class TaskTracker {
  private plans = new Map<string, TaskPlan>();

  /**
   * Register a new task plan.
   */
  startPlan(plan: TaskPlan): void {
    this.plans.set(plan.id, plan);
  }

  /**
   * Update the status of a task and return the updated plan.
   */
  updateStatus(
    planId: string,
    taskId: string,
    status: TaskStatus,
    result?: string,
  ): TaskPlan | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    task.status = status;
    if (result) task.result = result;
    if (status === TaskStatus.failed && task.result) {
      task.error = task.result;
    }

    return plan;
  }

  /**
   * Get the completion progress of a plan as a percentage.
   */
  getProgress(planId: string): number {
    const plan = this.plans.get(planId);
    if (!plan || plan.totalTasks === 0) return 0;
    return Math.round(
      (plan.tasks.filter((t) => t.status === TaskStatus.completed).length /
        plan.totalTasks) *
        100,
    );
  }

  /**
   * Get a human-readable summary of a plan's progress.
   */
  getSummary(planId: string): string {
    const plan = this.plans.get(planId);
    if (!plan) return 'Plan not found';

    const completed = plan.tasks.filter((t) => t.status === TaskStatus.completed).length;
    const failed = plan.tasks.filter((t) => t.status === TaskStatus.failed).length;
    const running = plan.tasks.filter((t) => t.status === TaskStatus.running).length;
    const pending = plan.tasks.filter((t) => t.status === TaskStatus.pending).length;
    const cancelled = plan.tasks.filter((t) => t.status === TaskStatus.cancelled).length;

    const lines: string[] = [
      `Plan: ${plan.title}`,
      `Progress: ${completed}/${plan.totalTasks} tasks completed (${this.getProgress(planId)}%)`,
      '',
    ];

    if (running > 0) lines.push(`  Running:    ${running}`);
    if (pending > 0) lines.push(`  Pending:    ${pending}`);
    if (failed > 0) lines.push(`  Failed:     ${failed}`);
    if (cancelled > 0) lines.push(`  Cancelled:  ${cancelled}`);

    return lines.join('\n');
  }

  /**
   * Get the list of failed tasks with error messages.
   */
  getFailedTasks(planId: string): { id: string; error: string }[] {
    const plan = this.plans.get(planId);
    if (!plan) return [];

    return plan.tasks
      .filter((t) => t.status === TaskStatus.failed)
      .map((t) => ({ id: t.id, error: t.error || 'Unknown error' }));
  }

  /**
   * Cancel all pending and running tasks in a plan.
   */
  cancelPlan(planId: string): TaskPlan | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    for (const task of plan.tasks) {
      if (task.status === TaskStatus.pending || task.status === TaskStatus.running) {
        task.status = TaskStatus.cancelled;
      }
    }

    return plan;
  }
}
