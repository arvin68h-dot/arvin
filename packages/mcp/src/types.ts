// CodeEngine MCP — JSON-RPC 2.0 Types

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: string;
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type McpMethod =
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'ping';
