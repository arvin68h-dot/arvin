// CodeEngine Tasks — Task Planner
import { randomUUID } from 'node:crypto';
import type { TaskNode, TaskPlan } from './types.js';
import { TaskStatus } from './types.js';

/**
 * Plan-based task planner.
 * Generates subtasks based on a description, with dependencies.
 */
export class TaskPlanner {
  /**
   * Create a task plan from a title and description.
   * Generates subtasks based on the description.
   */
  plan(title: string, description: string): TaskPlan {
    const tasks = generateTasksFromDescription(description);
    const planId = randomUUID();

    return {
      id: planId,
      title,
      description,
      tasks,
      createdAt: Date.now(),
      completedCount: 0,
      totalTasks: tasks.length,
    };
  }

  /**
   * Create a plan with manually specified tasks and dependencies.
   */
  planManual(
    title: string,
    description: string,
    taskList: { description: string; dependsOn?: string[] }[],
  ): TaskPlan {
    const tasks: TaskNode[] = [];
    for (const i in taskList) {
      const task = taskList[i];
      const id = randomUUID();
      tasks.push({
        id,
        description: task.description,
        status: TaskStatus.pending,
        dependsOn: task.dependsOn || [],
        attempts: 0,
        maxAttempts: 3,
      });
    }

    return {
      id: randomUUID(),
      title,
      description,
      tasks,
      createdAt: Date.now(),
      completedCount: 0,
      totalTasks: tasks.length,
    };
  }
}

function generateTasksFromDescription(description: string): TaskNode[] {
  const tasks: TaskNode[] = [];
  const lowerDesc = description.toLowerCase();

  // Analyze description to generate relevant subtasks
  const subtasks: { description: string; dependsOn: string[] }[] = [];

  // Phase-based task generation
  const phases: Array<{ name: string; pattern: RegExp; order: number }> = [
    { name: 'analysis', pattern: /analy|plan|design|understand|evaluate|assess|investigate/, order: 1 },
    { name: 'setup', pattern: /setup|prepare|initial|create|bootstrap|config|install|prerequisit/, order: 2 },
    { name: 'development', pattern: /develop|implement|build|code|write|create|add|implement|devel/, order: 3 },
    { name: 'testing', pattern: /test|verify|validate|check|debug|qa|regression/, order: 4 },
    { name: 'review', pattern: /review|audit|inspect|lint|format|style|check/, order: 5 },
    { name: 'deployment', pattern: /deploy|release|distribut|publish|ship|deliver|rollout|deploy/, order: 6 },
    { name: 'documentation', pattern: /doc|document|readme|wiki|guide|tutorial|manual|help/, order: 7 },
  ];

  for (const phase of phases) {
    if (phase.pattern.test(lowerDesc)) {
      subtasks.push({
        description: `Analyze and ${phase.name} phase`,
        dependsOn: [],
      });
    }
  }

  // Add dependency chain: each phase depends on the previous
  for (let i = 0; i < subtasks.length; i++) {
    if (i > 0) {
      // Each task depends on the immediately preceding task
      subtasks[i].dependsOn = [subtasks[i - 1].description];
    }
  }

  // Convert to TaskNode
  for (const st of subtasks) {
    const id = randomUUID();
    tasks.push({
      id,
      description: st.description,
      status: TaskStatus.pending,
      dependsOn: st.dependsOn,
      attempts: 0,
      maxAttempts: 3,
    });
  }

  // If no phases matched, create a default task
  if (tasks.length === 0) {
    tasks.push({
      id: randomUUID(),
      description: description,
      status: TaskStatus.pending,
      dependsOn: [],
      attempts: 0,
      maxAttempts: 3,
    });
  }

  return tasks;
}
