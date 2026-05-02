#!/usr/bin/env node
/**
 * Tool 命令 — 管理 CodeEngine 工具注册表
 *
 * 用法:
 *   codeengine tool list       列出所有已注册的工具
 *   codeengine tool show <name>  显示指定工具的详细信息
 *   codeengine tool --help     显示帮助信息
 */

import { ToolCategory, type ToolDefinition } from '@codeengine/core';
import { ToolRegistry, type ToolHandler } from '@codeengine/tool';
import { createReadFileTool } from '@codeengine/tool';
import { createWriteFileTool } from '@codeengine/tool';
import { createEditFileTool } from '@codeengine/tool';
import { createDeleteFileTool } from '@codeengine/tool';
import { createListDirTool } from '@codeengine/tool';
import { createShellRunner } from '@codeengine/tool';
import { createRipgrepTool } from '@codeengine/tool';

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ─── 工具分类中文名称 ───
const CATEGORY_NAMES: Record<ToolCategory, string> = {
  file: '文件操作',
  code: '代码',
  shell: 'Shell',
  analysis: '分析',
  version: '版本控制',
  build: '构建',
  engine: '引擎',
  system: '系统',
  lsp: 'LSP',
  multi_turn: '多轮对话',
};

/**
 * 定义工具工厂函数返回的结构
 * @internal
 */
interface ToolFactoryOutput {
  name: string;
  description: string;
  execute: (input: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

/**
 * 初始化并注册所有内置工具到工具注册表
 * 包括文件操作、Shell、搜索、版本控制等工具
 */
function initToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // 创建并注册文件操作工具
  const fileTools: ToolFactoryOutput[] = [
    createReadFileTool() as unknown as ToolFactoryOutput,
    createWriteFileTool() as unknown as ToolFactoryOutput,
    createEditFileTool() as unknown as ToolFactoryOutput,
    createDeleteFileTool() as unknown as ToolFactoryOutput,
    createListDirTool() as unknown as ToolFactoryOutput,
  ];

  // Shell 工具
  const shellTools: ToolFactoryOutput[] = [
    createShellRunner() as unknown as ToolFactoryOutput,
  ];

  // 搜索工具
  const searchTools: ToolFactoryOutput[] = [
    createRipgrepTool() as unknown as ToolFactoryOutput,
  ];

  // 将所有工具注册到注册表
  const allTools: ToolFactoryOutput[] = [
    ...fileTools, ...shellTools, ...searchTools,
  ];

  for (const tool of allTools) {
    const definition: ToolDefinition = {
      name: tool.name,
      description: tool.description,
      parameters: { type: 'object', properties: {}, required: [] },
      require_approval: false,
      is_blocking: false,
      category: ToolCategory.FILE,
      version: '0.1.0',
    };
    const handler: ToolHandler = { execute: tool.execute as unknown as ToolHandler['execute'] };
    registry.register(definition, handler);
  }

  return registry;
}

/**
 * 运行工具列表命令 — 展示所有已注册工具及其描述
 * @param _args — 命令行参数数组
 */
export async function runToolList(_args: string[]): Promise<void> {
  const registry = initToolRegistry();
  const tools = registry.listTools();

  if (tools.length === 0) {
    console.log(`  ${YELLOW}无工具已注册${RESET}`);
    return;
  }

  console.log(`\n${BOLD}已注册工具 (${tools.length} 个)${RESET}\n`);

  // 按类别分组
  const byCategory = new Map<ToolCategory, ToolDefinition[]>();
  for (const tool of tools) {
    const existing = byCategory.get(tool.category) || [];
    existing.push(tool);
    byCategory.set(tool.category, existing);
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  for (const [category, categoryTools] of byCategory.entries()) {
    console.log(`  ${CYAN}${CATEGORY_NAMES[category] || category}${RESET}`);
    for (const tool of categoryTools) {
      // 截断描述，保持终端输出美观
      const desc = tool.description.length > 60 ? tool.description.slice(0, 60) + '...' : tool.description;
      console.log(`    ${GREEN}${tool.name}${RESET}  —  ${desc}`);
    }
    console.log('');
  }

  console.log(`\n使用 ${CYAN}codeengine tool show <name>${RESET} 查看工具详情`);
}

/**
 * 运行工具详情命令 — 显示指定工具的详细定义信息
 * @param args — 命令行参数数组，预期格式: [<toolName>]
 */
export async function runToolShow(args: string[]): Promise<void> {
  const registry = initToolRegistry();
  const toolName = args[0];

  if (!toolName) {
    console.error(`  ${RED}请提供工具名称${RESET}`);
    console.error(`  用法: codeengine tool show <tool-name>`);
    process.exit(1);
  }

  const tool = registry.getTool(toolName);
  if (!tool) {
    console.error(`  ${RED}工具未找到: ${toolName}${RESET}`);
    console.error(`  使用 ${CYAN}codeengine tool list${RESET} 查看所有可用工具`);
    process.exit(1);
  }

  console.log(`\n${BOLD}工具: ${tool.name}${RESET}`);
  console.log(`  描述:    ${tool.description}`);
  console.log(`  类别:    ${CATEGORY_NAMES[tool.category] || tool.category}`);
  console.log(`  版本:    ${tool.version}`);
  console.log(`  需审批:  ${tool.require_approval ? '是' : '否'}`);
  console.log(`  阻塞操作: ${tool.is_blocking ? '是' : '否'}`);
  console.log(`\n  参数定义:`);
  console.log(`    ${JSON.stringify(tool.parameters, null, 2)}`);
}

/**
 * 运行工具命令入口 — 根据子命令路由到对应处理器
 * @param args — 完整的命令行参数数组（已去掉 'tool' 本身）
 */
export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (command === 'list' || !command) {
    await runToolList(args.slice(1));
  } else if (command === 'show') {
    await runToolShow(args.slice(1));
  } else if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`\n${BOLD}工具管理${RESET}\n`);
    console.log(`  用法: codeengine tool [命令] [参数]\n`);
    console.log(`  命令:`);
    console.log(`    list              列出所有已注册工具`);
    console.log(`    show <name>       显示指定工具的详细信息`);
    console.log(`    --help            显示此帮助信息\n`);
  } else {
    console.error(`  未知子命令: ${command}`);
    console.error(`  使用 codeengine tool --help 查看用法`);
    process.exit(1);
  }
}
