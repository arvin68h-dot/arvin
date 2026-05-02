#!/usr/bin/env node
/**
 * Checkpoint 命令 — 管理代码检查点（快照）
 *
 * 用法:
 *   codeengine checkpoint create [-n name] [-d description]
 *   codeengine checkpoint list
 *   codeengine checkpoint restore <id>
 *   codeengine checkpoint delete <id>
 *   codeengine checkpoint compare <id1> <id2>
 *   codeengine checkpoint --help
 */

import { CheckpointManager } from '@codeengine/checkpoint';

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * 格式化检查点名称 — 截断并显示前缀
 * @param name — 检查点名称
 * @returns 格式化后的名称
 */
function formatCheckpointName(name: string): string {
  return name.length > 30 ? name.slice(0, 30) + '...' : name;
}

/**
 * 格式化文件大小为人类可读字符串
 * @param bytes — 字节数
 * @returns 格式化后的文件大小字符串
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 格式化时间戳为可读日期字符串
 * @param timestamp — 毫秒时间戳
 * @returns 格式化后的日期字符串
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 解析命令行参数 — 从参数数组中提取命名选项的值
 * @param args — 命令行参数数组
 * @param options — 需要解析的选项列表（如 '-n', '-d'）
 * @returns 选项值映射
 */
function parseOptions(args: string[], options: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    for (const opt of options) {
      if (args[i] === opt && i + 1 < args.length) {
        result[opt] = args[i + 1];
        i++;
        break;
      }
    }
  }
  return result;
}

/**
 * 运行创建检查点命令 — 创建当前工作目录的快照
 * @param args — 命令行参数数组，支持: -n <name>, -d <description>
 */
export async function runCreate(args: string[]): Promise<void> {
  const options = parseOptions(args, ['-n', '-d']);
  const name = options['-n'] || `checkpoint-${formatDate(Date.now()).replace(/[: ]/g, '-')}`;
  const description = options['-d'] || `Checkpoint created at ${formatDate(Date.now())}`;

  const manager = new CheckpointManager(process.cwd());

  try {
    const checkpoint = await manager.create(name, description);
    console.log(`\n${GREEN}[OK]${RESET} 检查点已创建`);
    console.log(`  ID:     ${checkpoint.id}`);
    console.log(`  名称:   ${checkpoint.name}`);
    console.log(`  描述:   ${checkpoint.description || '(无)'}`);
    console.log(`  文件数: ${checkpoint.files.length}`);
    console.log(`  大小:   ${formatSize(checkpoint.files.reduce((sum, f) => sum + f.size, 0))}`);
    console.log(`  时间:   ${formatDate(checkpoint.timestamp)}`);
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 创建检查点失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * 运行检查点列表命令 — 展示所有已创建的检查点
 * @param _args — 命令行参数数组（忽略）
 */
export async function runList(_args: string[]): Promise<void> {
  const manager = new CheckpointManager(process.cwd());
  const checkpoints = manager.list();

  if (checkpoints.length === 0) {
    console.log(`  ${YELLOW}无检查点${RESET}`);
    console.log(`  使用 ${CYAN}codeengine checkpoint create -n <name>${RESET} 创建新检查点`);
    return;
  }

  console.log(`\n${BOLD}检查点 (${checkpoints.length} 个)${RESET}\n`);

  // 打印表格
  console.log(`  ${CYAN}ID${RESET}${' '.repeat(24)}  ${'名称'.padEnd(20)}  ${'文件数'.padEnd(8)}  ${'大小'.padEnd(10)}  ${'创建时间'}`);
  console.log(`  ${'─'.repeat(26)}  ${'─'.repeat(20)}  ${'─'.repeat(8)}  ${'─'.repeat(10)}  ${'─'.repeat(20)}`);

  for (const cp of checkpoints) {
    const idLabel = cp.id.slice(0, 12) + '...';
    const nameLabel = formatCheckpointName(cp.name).padEnd(20);
    const fileCount = String(cp.files.length).padEnd(8);
    const totalSize = formatSize(cp.files.reduce((sum, f) => sum + f.size, 0)).padEnd(10);
    const time = formatDate(cp.timestamp);

    console.log(`  ${CYAN}${idLabel}${RESET}  ${nameLabel}  ${fileCount}  ${totalSize}  ${time}`);
  }

  console.log(`\n使用 ${CYAN}codeengine checkpoint show <id>${RESET} 查看详情`);
}

/**
 * 运行检查点恢复命令 — 从指定检查点恢复文件状态
 * 恢复前会先创建当前状态的备份
 * @param args — 命令行参数数组，预期格式: [<checkpointId>]
 */
export async function runRestore(args: string[]): Promise<void> {
  const checkpointId = args[0];

  if (!checkpointId) {
    console.error(`  ${RED}请提供检查点 ID${RESET}`);
    console.error(`  用法: codeengine checkpoint restore <checkpoint-id>`);
    console.error(`  使用 ${CYAN}codeengine checkpoint list${RESET} 查看所有检查点`);
    process.exit(1);
  }

  const manager = new CheckpointManager(process.cwd());
  const checkpoint = await manager.get(checkpointId);

  if (!checkpoint) {
    console.error(`  ${RED}检查点未找到: ${checkpointId}${RESET}`);
    process.exit(1);
  }

  // 显示恢复信息并确认
  console.log(`\n${YELLOW}确认恢复检查点？${RESET}`);
  console.log(`  ID:     ${checkpoint.id}`);
  console.log(`  名称:   ${checkpoint.name}`);
  console.log(`  文件数: ${checkpoint.files.length}`);
  console.log(`  时间:   ${formatDate(checkpoint.timestamp)}`);
  console.log(`  注意: 当前状态将自动备份到 .codeengine/backup/\n`);
  console.log(`  当前工作目录: ${process.cwd()}`);

  // 同步读取用户确认（不阻塞 stdin 太久）
  process.stdout.write(`${CYAN}请输入 YES 确认恢复（或按 Ctrl+C 取消）:${RESET} `);

  // 读取用户输入
  const input = await new Promise<string>((resolve) => {
    const onData = (data: Buffer) => {
      const input = data.toString().trim().toLowerCase();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(input);
    };
    process.stdin.once('data', onData);
  });

  if (input !== 'yes') {
    console.log(`  ${YELLOW}已取消恢复${RESET}`);
    return;
  }

  try {
    const restored = await manager.restore(checkpointId);
    if (restored) {
      console.log(`\n${GREEN}[OK]${RESET} 检查点已成功恢复`);
      console.log(`  已恢复 ${checkpoint.files.length} 个文件`);
    } else {
      console.error(`\n${RED}[ERROR]${RESET} 恢复失败，请检查检查点完整性`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 恢复失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * 运行删除检查点命令 — 删除指定的检查点快照
 * @param args — 命令行参数数组，预期格式: [<checkpointId>]
 */
export async function runDelete(args: string[]): Promise<void> {
  const checkpointId = args[0];

  if (!checkpointId) {
    console.error(`  ${RED}请提供检查点 ID${RESET}`);
    console.error(`  用法: codeengine checkpoint delete <checkpoint-id>`);
    process.exit(1);
  }

  const manager = new CheckpointManager(process.cwd());
  const checkpoint = await manager.get(checkpointId);

  if (!checkpoint) {
    console.error(`  ${RED}检查点未找到: ${checkpointId}${RESET}`);
    process.exit(1);
  }

  // 显示删除确认
  console.log(`\n${RED}确认删除检查点？${RESET}`);
  console.log(`  ID:  ${checkpoint.id}`);
  console.log(`  名称: ${checkpoint.name}`);
  console.log(`  文件数: ${checkpoint.files.length}\n`);

  process.stdout.write(`${CYAN}请输入 YES 确认删除（或按 Ctrl+C 取消）:${RESET} `);

  const input = await new Promise<string>((resolve) => {
    const onData = (data: Buffer) => {
      const v = data.toString().trim().toLowerCase();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(v);
    };
    process.stdin.once('data', onData);
  });

  if (input !== 'yes') {
    console.log(`  ${YELLOW}已取消删除${RESET}`);
    return;
  }

  const deleted = manager.delete(checkpointId);
  if (deleted) {
    console.log(`\n${GREEN}[OK]${RESET} 检查点已删除`);
  } else {
    console.error(`\n${RED}[ERROR]${RESET} 删除失败`);
    process.exit(1);
  }
}

/**
 * 运行检查点比较命令 — 比较两个检查点的文件差异
 * @param args — 命令行参数数组，预期格式: [<id1>, <id2>]
 */
export async function runCompare(args: string[]): Promise<void> {
  const id1 = args[0];
  const id2 = args[1];

  if (!id1 || !id2) {
    console.error(`  ${RED}请提供两个检查点 ID${RESET}`);
    console.error(`  用法: codeengine checkpoint compare <id1> <id2>`);
    process.exit(1);
  }

  const manager = new CheckpointManager(process.cwd());
  const cp1 = await manager.get(id1);
  const cp2 = await manager.get(id2);

  if (!cp1) {
    console.error(`  ${RED}检查点未找到: ${id1}${RESET}`);
    process.exit(1);
  }
  if (!cp2) {
    console.error(`  ${RED}检查点未找到: ${id2}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${BOLD}比较检查点${RESET}`);
  console.log(`  ${CYAN}A:${RESET} ${cp1.name} (${formatDate(cp1.timestamp)})`);
  console.log(`  ${CYAN}B:${RESET} ${cp2.name} (${formatDate(cp2.timestamp)})`);
  console.log('');

  // 计算文件差异
  const files1 = new Map(cp1.files.map(f => [f.path, f]));
  const files2 = new Map(cp2.files.map(f => [f.path, f]));

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  // 找出新增文件（在 B 中但不在 A 中）
  for (const [path] of files2) {
    if (!files1.has(path)) {
      added.push(path);
    } else if (files1.get(path)!.hash !== files2.get(path)!.hash) {
      modified.push(path);
    }
  }

  // 找出删除文件（在 A 中但不在 B 中）
  for (const [path] of files1) {
    if (!files2.has(path)) {
      deleted.push(path);
    }
  }

  console.log(`  ${GREEN}新增:    ${added.length} 个文件${RESET}`);
  console.log(`  ${YELLOW}修改:    ${modified.length} 个文件${RESET}`);
  console.log(`  ${RED}删除:    ${deleted.length} 个文件${RESET}`);
  console.log(`  ${CYAN}总计:    ${(files1.size + files2.size - deleted.length)} 个唯一文件${RESET}`);

  // 显示详细差异
  if (added.length > 0) {
    console.log(`\n  ${GREEN}新增文件:${RESET}`);
    for (const f of added.slice(0, 20)) {
      console.log(`    + ${f}`);
    }
    if (added.length > 20) console.log(`    ... 还有 ${added.length - 20} 个文件`);
  }

  if (modified.length > 0) {
    console.log(`\n  ${YELLOW}修改文件:${RESET}`);
    for (const f of modified.slice(0, 20)) {
      console.log(`    ~ ${f}`);
    }
    if (modified.length > 20) console.log(`    ... 还有 ${modified.length - 20} 个文件`);
  }

  if (deleted.length > 0) {
    console.log(`\n  ${RED}删除文件:${RESET}`);
    for (const f of deleted.slice(0, 20)) {
      console.log(`    - ${f}`);
    }
    if (deleted.length > 20) console.log(`    ... 还有 ${deleted.length - 20} 个文件`);
  }
}

/**
 * 运行检查点命令入口 — 根据子命令路由到对应处理器
 * @param args — 完整的命令行参数数组（已去掉 'checkpoint' 本身）
 */
export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (command === 'create') {
    await runCreate(args.slice(1));
  } else if (command === 'list' || !command) {
    await runList(args.slice(1));
  } else if (command === 'restore') {
    await runRestore(args.slice(1));
  } else if (command === 'delete') {
    await runDelete(args.slice(1));
  } else if (command === 'compare') {
    await runCompare(args.slice(1));
  } else if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`\n${BOLD}检查点管理${RESET}\n`);
    console.log(`  用法: codeengine checkpoint [命令] [参数]\n`);
    console.log(`  命令:`);
    console.log(`    create [-n name] [-d desc]   创建新的检查点快照`);
    console.log(`    list                        列出所有检查点`);
    console.log(`    restore <id>                从检查点恢复文件状态`);
    console.log(`    delete <id>                 删除指定检查点`);
    console.log(`    compare <id1> <id2>         比较两个检查点的差异`);
    console.log(`    --help                      显示此帮助信息\n`);
  } else {
    console.error(`  未知子命令: ${command}`);
    console.error(`  使用 codeengine checkpoint --help 查看用法`);
    process.exit(1);
  }
}
