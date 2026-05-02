// CodeEngine Parallel Execution — 并行工具执行
// 支持多任务并发执行，限制并发数，汇总结果

// ─── 并行执行结果 ───

/**
 * 并行执行任务的单个结果
 */
export interface ParallelTaskResult<T> {
  /** 任务名称 */
  name: string;
  /** 执行成功时的结果 */
  result?: T;
  /** 执行失败时的错误 */
  error?: Error;
}

// ─── 并发执行函数 ───

/**
 * 并行执行多个独立任务，支持并发数限制
 * 适用于无依赖关系的工具调用，如同时读取多个文件、
 * 同时查询多个数据源、同时执行多个独立操作等
 *
 * @param tasks 待执行的任务列表，每个任务包含名称和执行函数
 * @param options 可选配置
 * @param options.maxConcurrent 最大并发数（默认 4）
 * @returns 所有任务的执行结果，按输入顺序排列
 *
 * @example
 * ```ts
 * const results = await executeInParallel([
 *   { name: 'read-file-1', fn: () => readDataFile('a.json') },
 *   { name: 'read-file-2', fn: () => readDataFile('b.json') },
 *   { name: 'read-file-3', fn: () => readDataFile('c.json') },
 * ], { maxConcurrent: 2 });
 * ```
 */
export async function executeInParallel<T>(
  tasks: Array<{ name: string; fn: () => Promise<T> }>,
  options?: { maxConcurrent?: number },
): Promise<ParallelTaskResult<T>[]> {
  if (tasks.length === 0) {
    return [];
  }

  const maxConcurrent = Math.max(1, options?.maxConcurrent ?? 4);
  const results: ParallelTaskResult<T>[] = new Array(tasks.length);

  // 执行索引：跟踪每个任务的位置
  let nextIndex = 0;

  // 工作队列：每个工作者从队列中取任务
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(maxConcurrent, tasks.length); i++) {
    workers.push(work(i));
  }

  async function work(workerId: number): Promise<void> {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex++;

      const task = tasks[currentIndex];
      try {
        const result = await task.fn();
        results[currentIndex] = { name: task.name, result };
      } catch (err) {
        results[currentIndex] = {
          name: task.name,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
  }

  // 等待所有工作者完成
  await Promise.all(workers);

  return results;
}
