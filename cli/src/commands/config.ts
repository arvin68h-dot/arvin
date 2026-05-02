#!/usr/bin/env node
/**
 * Config 命令 — 管理 CodeEngine 配置
 *
 * 用法:
 *   codeengine config get <key>    获取配置值
 *   codeengine config set <key> <value>  设置配置值
 *   codeengine config list         列出所有配置
 *   codeengine config --help       显示帮助信息
 */

import { getConfig, setConfig, loadConfig, saveConfig, getDefaultConfig } from '@codeengine/core';

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * 格式化配置值为可读字符串
 * @param value — 配置值
 * @returns 格式化后的字符串
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(null)';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * 获取配置值的显示名称（人类可读）
 * @param key — 配置键路径
 * @returns 可读的名称
 */
function getKeyName(key: string): string {
  const parts = key.split('.');
  const displayNames: Record<string, string> = {
    general: '常规',
    log_level: '日志级别',
    log_to_file: '写入日志文件',
    log_dir: '日志目录',
    max_concurrent_requests: '最大并发请求',
    streaming_enabled: '流式输出',
    session: '会话',
    auto_save: '自动保存',
    save_interval: '保存间隔(ms)',
    max_messages: '最大消息数',
    timeout: '超时(ms)',
    providers: 'LLM 提供者',
    storage: '存储',
    path: '数据库路径',
    checkpoint: '检查点',
    auto_before_shell: 'Shell 操作前自动检查',
    max_snapshots: '最大快照数',
    skills: '技能',
    dir: '技能目录',
    features: '功能',
    codebase_search: '代码库搜索',
    lsp_integration: 'LSP 集成',
    checkpoint_system: '检查点系统',
    skill_system: '技能系统',
    task_planning: '任务规划',
    mcp_support: 'MCP 支持',
    engine: '引擎',
  };

  // 使用最后一段作为键名，尝试获取中文名
  return displayNames[parts[parts.length - 1]] || parts[parts.length - 1].replace(/_/g, ' ');
}

/**
 * 运行获取配置值命令 — 根据键路径读取配置
 * @param args — 命令行参数数组，预期格式: [<key>]
 */
export async function runGet(args: string[]): Promise<void> {
  const key = args[0];

  if (!key) {
    console.error(`  ${RED}请提供配置键名${RESET}`);
    console.error(`  用法: codeengine config get <key>`);
    console.error(`  示例: codeengine config get general.log_level`);
    console.error(`  使用 ${CYAN}codeengine config list${RESET} 查看所有配置键`);
    process.exit(1);
  }

  try {
    const value = getConfig(key);
    console.log(`\n  ${BOLD}${getKeyName(key)}${RESET}:`);
    console.log(`  ${formatValue(value)}`);
  } catch (err) {
    console.error(`\n  ${RED}[ERROR]${RESET} 配置键未找到: ${key}`);
    console.error(`  ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * 运行设置配置值命令 — 修改配置项的值
 * @param args — 命令行参数数组，预期格式: [<key>, <value>]
 */
export async function runSet(args: string[]): Promise<void> {
  const key = args[0];
  const valueStr = args[1];

  if (!key) {
    console.error(`  ${RED}请提供配置键名${RESET}`);
    console.error(`  用法: codeengine config set <key> <value>`);
    console.error(`  示例: codeengine config set general.log_level debug`);
    process.exit(1);
  }

  if (valueStr === undefined) {
    console.error(`  ${RED}请提供配置值${RESET}`);
    console.error(`  用法: codeengine config set <key> <value>`);
    process.exit(1);
  }

  // 尝试解析 JSON 值
  let value: unknown;
  try {
    value = JSON.parse(valueStr);
  } catch {
    value = valueStr;
  }

  try {
    setConfig(key, value);
    console.log(`\n${GREEN}[OK]${RESET} 配置已设置: ${key} = ${formatValue(value)}`);
  } catch (err) {
    console.error(`\n${RED}[ERROR]${RESET} 设置配置失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * 运行配置列表命令 — 展示所有配置项及其值
 * @param _args — 命令行参数数组（忽略）
 */
export async function runList(_args: string[]): Promise<void> {
  const config = loadConfig();

  console.log(`\n${BOLD}配置列表${RESET}  (${Object.keys(config).length} 个配置段)\n`);

  // 按段显示配置
  for (const [section, sectionData] of Object.entries(config)) {
    if (typeof sectionData === 'object' && sectionData !== null && !Array.isArray(sectionData)) {
      const obj = sectionData as Record<string, unknown>;
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = `${section}.${key}`;
        const name = getKeyName(fullKey);
        const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

        // 敏感信息脱敏
        let displayValue = valStr;
        if (key.includes('key') || key.includes('password') || key.includes('token')) {
          displayValue = '****';
        }

        console.log(`  ${CYAN}${fullKey.padEnd(35)}${RESET}  =  ${displayValue}`);
      }
    } else {
      console.log(`  ${CYAN}${section}${RESET} = ${formatValue(sectionData)}`);
    }
  }

  console.log(`\n使用 ${CYAN}codeengine config get <key>${RESET} 读取单个配置`);
  console.log(`使用 ${CYAN}codeengine config set <key> <value>${RESET} 修改配置`);
}

/**
 * 运行配置命令入口 — 根据子命令路由到对应处理器
 * @param args — 完整的命令行参数数组（已去掉 'config' 本身）
 */
export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (command === 'get') {
    await runGet(args.slice(1));
  } else if (command === 'set') {
    await runSet(args.slice(1));
  } else if (command === 'list' || !command) {
    await runList(args.slice(1));
  } else if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`\n${BOLD}配置管理${RESET}\n`);
    console.log(`  用法: codeengine config [命令] [参数]\n`);
    console.log(`  命令:`);
    console.log(`    get <key>               获取配置值`);
    console.log(`    set <key> <value>       设置配置值`);
    console.log(`    list                    列出所有配置项`);
    console.log(`    --help                  显示此帮助信息\n`);
    console.log(`  配置示例:`);
    console.log(`    codeengine config get general.log_level`);
    console.log(`    codeengine config set general.log_level debug`);
    console.log(`    codeengine config set providers.ollama.model 'qwen3.5'\n`);
  } else {
    console.error(`  未知子命令: ${command}`);
    console.error(`  使用 codeengine config --help 查看用法`);
    process.exit(1);
  }
}
