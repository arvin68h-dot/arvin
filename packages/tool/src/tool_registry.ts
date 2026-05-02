// CodeEngine Tool Registry - Tool registration and execution framework
// All AI tools unified registration, discovery, and execution interface

import {
  type ToolDefinition,
  type ToolResult,
  type PermissionLevel,
  type RuntimeContext,
  type ToolContext,
  type ToolCategory,
  PermissionLevel as PermLevel,
  LogLevel,
  createLogger,
} from '@codeengine/core';

// ToolHandler for the registry (interface with execute method)
export interface ToolHandler {
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// Tool entry combining definition, handler, and permission
export type ToolEntry = {
  definition: ToolDefinition;
  handler: ToolHandler;
  permission: PermissionLevel;
};

export interface ToolRegistryConfig {
  maxConcurrent?: number;
  timeout?: number;
  sandboxEnabled?: boolean;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();
  private permissions: Map<string, PermissionLevel> = new Map();
  private categories: Map<string, ToolCategory> = new Map();
  private readonly config: Required<ToolRegistryConfig>;
  private logger;

  constructor(config?: ToolRegistryConfig) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? 5,
      timeout: config?.timeout ?? 30000,
      sandboxEnabled: config?.sandboxEnabled ?? false,
    };
    this.logger = createLogger({ name: 'tool-registry', level: LogLevel.INFO });
  }

  register(tool: ToolDefinition, handler: ToolHandler, permission?: PermissionLevel): void {
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
    this.categories.set(tool.name, tool.category);
    this.permissions.set(tool.name, permission ?? PermLevel.DEFAULT);
    this.logger.info(`Tool registered: ${tool.name} [${tool.category}]`);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listByCategory(category: ToolCategory): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  checkPermission(toolName: string, required: PermissionLevel): boolean {
    const perm = this.permissions.get(toolName);
    if (!perm) return false;
    return this.permGreaterOrEqual(perm, required);
  }

  getToolEntry(name: string): ToolEntry | undefined {
    const definition = this.tools.get(name);
    const handler = this.handlers.get(name);
    const permission = this.permissions.get(name);
    if (!definition || !handler || permission === undefined) return undefined;
    return { definition, handler, permission };
  }

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    ctx: RuntimeContext,
  ): Promise<ToolResult> {
    const entry = this.getToolEntry(toolName);
    if (!entry) {
      return {
        success: false,
        content: '',
        metadata: { tool: toolName, error: `Tool not found: ${toolName}` },
      };
    }

    const startTime = Date.now();

    try {
      const toolCtx: ToolContext = {
        sessionId: 'default',
        workingDir: ctx.workspaceRoot,
        provider: 'default',
        permissionLevel: entry.permission,
        projectRoot: ctx.projectRoot,
        logger: this.logger,
      };

      const result = await entry.handler.execute(input, toolCtx);
      const duration = Date.now() - startTime;

      if (!result.success && !result.metadata) {
        return {
          ...result,
          metadata: { tool: toolName, error: result.content, duration },
        };
      }

      return {
        ...result,
        metadata: { tool: toolName, duration, ...(result.metadata || {}) },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error(`Tool execution failed: ${toolName} - ${(err as Error).message}`);
      return {
        success: false,
        content: '',
        metadata: { tool: toolName, error: (err as Error).message, duration },
      };
    }
  }

  private permGreaterOrEqual(a: PermissionLevel, b: PermissionLevel): boolean {
    const levels = [PermLevel.DEFAULT, PermLevel.ASK, PermLevel.ALWAYS_ALLOW, PermLevel.ALWAYS_DENY];
    return levels.indexOf(a) >= levels.indexOf(b);
  }
}

let _registry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!_registry) _registry = new ToolRegistry();
  return _registry;
}
