// CodeEngine MCP — Server
import type { McpTool, McpRequest, McpResponse } from './types.js';

export class McpServer {
  private tools: McpTool[] = [];
  private initialized = false;
  private protocolVersion = '2024-11-05';

  /**
   * Register a tool handler.
   */
  registerTool(tool: McpTool): void {
    this.tools.push(tool);
  }

  /**
   * Get all registered tools.
   */
  getTools(): McpTool[] {
    return [...this.tools];
  }

  /**
   * Handle a JSON-RPC request and return a response.
   */
  async handleRequest(request: McpRequest): Promise<McpResponse> {
    // Initialize handshake
    if (request.method === 'initialize') {
      this.initialized = true;
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: this.protocolVersion,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: { name: 'codeengine', version: '0.1.0' },
        },
      };
    }

    // Ping
    if (request.method === 'ping') {
      return { jsonrpc: '2.0', id: request.id };
    }

    // Tools list
    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: this.tools },
      };
    }

    // Tool call
    if (request.method === 'tools/call') {
      const params = request.params as Record<string, unknown> | undefined;
      const toolName = (params?.name as string) || '';
      const args = params?.arguments as Record<string, unknown> | undefined;

      const tool = this.tools.find((t) => t.name === toolName);
      if (!tool) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Tool not found: ${toolName}` },
        };
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: `Tool "${toolName}" called with: ${JSON.stringify(args)}` }],
          isError: false,
        },
      };
    }

    // Method not found
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32601, message: `Method not found: ${request.method}` },
    };
  }

  /**
   * Check if server has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
