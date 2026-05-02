// CodeEngine ACP Host — CodeWorker 集成网关
// 通过标准输入/输出实现 JSON-RPC 协议通信
//
// 协议规范:
//   - 请求: {"jsonrpc": "2.0", "id": <number|string>, "method": "<method>", "params": <object>}
//   - 响应: {"jsonrpc": "2.0", "id": <number|string>, "result": <object>}
//   - 错误: {"jsonrpc": "2.0", "id": <number|string>, "error": {"code": <number>, "message": "<string>"}}
//
// 支持的 Method:
//   - task/execute: 执行编码任务
//   - task/cancel: 取消当前任务
//   - tool/list: 列出可用工具
//   - engine/list: 列出可用引擎
//   - session/new: 创建新会话
//   - session/history: 获取会话历史

import { createLogger, LogLevel } from '@codeengine/core';
import { getToolRegistry } from '@codeengine/tool';
import { createShellRunner } from '@codeengine/tool';
import { createWriteFileTool } from '@codeengine/tool';
import { createReadFileTool } from '@codeengine/tool';

const logger = createLogger({ name: 'acp-host', level: LogLevel.INFO });

// ─── JSON-RPC 类型定义 ───

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number;
  error: { code: number; message: string; data?: unknown };
}

// ─── 请求处理器 ───

/** 处理 task/execute 请求 */
async function handleTaskExecute(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const task = params.task as string;
  const workspace = (params.workspace as string) || process.cwd();
  const messages = params.messages as Array<{ role: string; content: string }> | undefined;

  if (!task) {
    throw new Error('Missing required parameter: task');
  }

  logger.info(`Task received in workspace: ${workspace}`);
  logger.debug(`Task: ${task}`);

  // 构建系统提示
  const systemPrompt = `You are CodeEngine, an AI coding assistant. 
You can write, edit, compile, and run code in multiple languages.
Workspace: ${workspace}`;

  // 模拟处理流程（实际应调用 LLM Provider）
  const steps = [
    `分析任务: ${task}`,
    '准备执行环境...',
    '生成代码方案...',
    '验证方案可行性...',
  ];

  return {
    taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'completed',
    steps,
    output: `Task "${task}" completed successfully in ${workspace}.`,
  };
}

/** 处理 tool/list 请求 */
function handleToolList(): Record<string, unknown>[] {
  const registry = getToolRegistry();
  return registry.listTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    category: tool.category,
    version: tool.version,
    requiresApproval: tool.require_approval,
  }));
}

/** 处理 engine/list 请求 */
async function handleEngineList(): Promise<Record<string, unknown>[]> {
  return [
    { id: 'cpp', name: 'C++', status: 'active' },
    { id: 'python', name: 'Python', status: 'active' },
    { id: 'js', name: 'JavaScript', status: 'active' },
    { id: 'ts', name: 'TypeScript', status: 'active' },
    { id: 'go', name: 'Go', status: 'active' },
    { id: 'rust', name: 'Rust', status: 'active' },
    { id: 'cs', name: 'C#', status: 'active' },
    { id: 'ps', name: 'PowerShell', status: 'active' },
    { id: 'cmake', name: 'CMake', status: 'active' },
    { id: 'catia', name: 'CATIA', status: 'active' },
  ];
}

/** 处理 session/new 请求 */
function handleSessionNew(params: Record<string, unknown>): Record<string, unknown> {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { sessionId, created: new Date().toISOString() };
}

/** 处理 session/history 请求 */
async function handleSessionHistory(params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  // 实际应从数据库/存储读取
  return [];
}

/** 处理 task/cancel 请求 */
function handleTaskCancel(params: Record<string, unknown>): Record<string, unknown> {
  logger.info(`Task cancelled: ${params.taskId}`);
  return { taskId: params.taskId, status: 'cancelled' };
}

// ─── 主处理循环 ───

/** 处理单个 JSON-RPC 请求 */
async function processRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    let result: unknown;

    switch (req.method) {
      case 'task/execute':
        result = await handleTaskExecute(req.params || {});
        break;
      case 'tool/list':
        result = handleToolList();
        break;
      case 'engine/list':
        result = await handleEngineList();
        break;
      case 'session/new':
        result = handleSessionNew(req.params || {});
        break;
      case 'session/history':
        result = await handleSessionHistory(req.params || {});
        break;
      case 'task/cancel':
        result = handleTaskCancel(req.params || {});
        break;
      default:
        throw new Error(`Unknown method: ${req.method}`);
    }

    return {
      jsonrpc: '2.0',
      id: req.id,
      result,
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    };
  }
}

/** 发送 JSON-RPC 响应到 stdout */
function sendResponse(response: JsonRpcResponse): void {
  const json = JSON.stringify(response);
  // JSON-RPC over stdio uses newline-delimited JSON (NDJSON)
  process.stdout.write(json + '\n');
}

/** 解析来自 stdin 的 JSON-RPC 请求 */
function parseRequest(line: string): JsonRpcRequest | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed && parsed.jsonrpc === '2.0' && parsed.id !== undefined && parsed.method) {
      return parsed as JsonRpcRequest;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── ACP Host 启动器 ───

/**
 * 启动 CodeEngine ACP Host
 * 此函数从 stdin 读取 JSON-RPC 请求，处理并写入 stdout
 */
export async function startAcpHost(): Promise<void> {
  logger.info('CodeEngine ACP Host starting...');
  logger.info('Listening for JSON-RPC requests on stdin');

  // 读取 stdin 行并处理
  // 注意：在 tsx 中可以使用 readline，但简单实现逐行处理
  const input = process.stdin;
  input.setEncoding('utf-8');

  let buffer = '';

  input.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const req = parseRequest(trimmed);
      if (!req) {
        logger.warn(`Invalid JSON-RPC request: ${trimmed}`);
        continue;
      }

      logger.debug(`Received request: ${req.method} (id: ${req.id})`);

      processRequest(req).then(response => {
        logger.debug(`Sending response: ${JSON.stringify(response).slice(0, 200)}`);
        sendResponse(response);
      }).catch(error => {
        logger.error(`Failed to process request: ${error}`);
        sendResponse({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32603, message: String(error) },
        });
      });
    }
  });

  input.on('end', () => {
    logger.info('stdin closed, ACP Host shutting down');
    process.exit(0);
  });

  input.on('error', (error: Error) => {
    logger.error(`stdin error: ${error.message}`);
    process.exit(1);
  });

  // 输出就绪信号
  sendResponse({
    jsonrpc: '2.0',
    id: 'init',
    result: { status: 'ready', version: '0.1.0', protocol: 'json-rpc-2.0' },
  });

  logger.info('ACP Host ready. Waiting for requests...');

  // 保持进程运行
  await new Promise<void>(() => {
    // 无限等待
  });
}

// ─── CLI 入口 ───

if (require.main === module) {
  startAcpHost().catch(error => {
    console.error('ACP Host failed to start:', error);
    process.exit(1);
  });
}
