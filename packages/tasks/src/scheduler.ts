// CodeEngine Tasks — Task Scheduler
import type { TaskPlan, TaskNode } from './types.js';
import { TaskStatus } from './types.js';

type TaskExecutor = (task: TaskNode) => Promise<string>;

/**
 * Execute tasks in topological order, respecting dependencies.
 * Retries failed tasks up to maxAttempts times.
 */
export class TaskScheduler {
  /**
   * Execute all tasks in a plan, returning the completed plan.
   */
  async execute(
    plan: TaskPlan,
    executor: TaskExecutor,
    options?: { maxConcurrent?: number; stopOnFailure?: boolean },
  ): Promise<TaskPlan> {
    const { maxConcurrent = 1, stopOnFailure = true } = options || {};
    const executed = new Set<string>();
    const failed = new Set<string>();

    while (executed.size < plan.tasks.length) {
      // Find tasks whose dependencies are all met
      const ready = plan.tasks.filter((t) => {
        if (executed.has(t.id) || failed.has(t.id)) return false;
        return t.dependsOn.every((dep) => executed.has(dep));
      });

      if (ready.length === 0) {
        break; // Deadlock or all remaining tasks have unmet deps
      }

      // Execute up to maxConcurrent ready tasks
      const batch = ready.slice(0, maxConcurrent);
      for (const task of batch) {
        task.status = TaskStatus.running;
        task.attempts += 1;

        try {
          const result = await executor(task);
          task.result = result;
          task.status = TaskStatus.completed;
          executed.add(task.id);
        } catch (err) {
          task.error = err instanceof Error ? err.message : String(err);

          if (task.attempts < task.maxAttempts) {
            task.status = TaskStatus.pending;
            task.attempts += 1;
          } else {
            task.status = stopOnFailure ? TaskStatus.failed : TaskStatus.failed;
            failed.add(task.id);
            if (stopOnFailure) {
              plan.completedCount = executed.size;
              return plan;
            }
          }
        }
      }
    }

    plan.completedCount = plan.tasks.filter((t) => t.status === TaskStatus.completed).length;
    return plan;
  }

  /**
   * Calculate topological order for a set of tasks.
   */
  calculateTopologicalOrder(tasks: TaskNode[]): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (temp.has(id)) throw new Error(`Circular dependency detected: ${id}`);
      temp.add(id);

      const task = tasks.find((t) => t.id === id);
      if (task) {
        for (const dep of task.dependsOn) {
          visit(dep);
        }
      }

      temp.delete(id);
      visited.add(id);
      order.push(id);
    };

    for (const task of tasks) {
      visit(task.id);
    }

    return order;
  }
}
