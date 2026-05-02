// ─── ACP 协议处理框架 ───

import type { AgentMessage, ToolDefinition } from '../types/index.js';
import { PermissionLevel } from '../types/index.js';
import { ACP } from '../types/protocol.js';

interface RequestContext {
  sessionId: string;
  permissions: PermissionLevel;
  workspaceRoot: string;
  cwd: string;
}

type RequestHandler = (params: unknown, context: RequestContext) => Promise<unknown>;

const REQUEST_HANDLERS: Map<string, RequestHandler> = new Map();

interface SessionState {
  id: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  permissions: Map<string, PermissionLevel>;
  toolCallResults: Map<string, { content: string; is_error: boolean }>;
  createdAt: number;
  updatedAt: number;
}

const SESSIONS: Map<string, SessionState> = new Map();

REQUEST_HANDLERS.set('session/create', async (params: unknown) => {
  const cfg = params as Record<string, unknown>;
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  SESSIONS.set(id, {
    id, messages: [], tools: [], permissions: new Map(),
    toolCallResults: new Map(), createdAt: Date.now(), updatedAt: Date.now(),
  });
  return { id, title: (cfg.title as string) || 'New Session', createdAt: Date.now() };
});

REQUEST_HANDLERS.set('session/list', async () => {
  const sessions: Record<string, unknown>[] = [];
  for (const [, s] of SESSIONS) {
    sessions.push({ id: s.id, messageCount: s.messages.length, createdAt: s.createdAt });
  }
  return { sessions };
});

REQUEST_HANDLERS.set('session/switch', async (params: unknown) => {
  const { sessionId } = params as { sessionId: string };
  if (!SESSIONS.has(sessionId)) throw new Error(`Session not found: ${sessionId}`);
  return { success: true };
});

REQUEST_HANDLERS.set('session/delete', async (params: unknown) => {
  const { sessionId } = params as { sessionId: string };
  SESSIONS.delete(sessionId);
  return { success: true };
});

REQUEST_HANDLERS.set('session/info', async (params: unknown) => {
  const { sessionId } = params as { sessionId: string };
  const s = SESSIONS.get(sessionId);
  if (!s) throw new Error(`Session not found: ${sessionId}`);
  return { id: s.id, messageCount: s.messages.length, updatedAt: s.updatedAt };
});

REQUEST_HANDLERS.set('session/messages', async (params: unknown) => {
  const { sessionId, limit = 50, offset = 0 } = params as { sessionId: string; limit?: number; offset?: number };
  const s = SESSIONS.get(sessionId);
  if (!s) throw new Error(`Session not found: ${sessionId}`);
  return { messages: s.messages.slice(offset, offset + limit), total: s.messages.length };
});

REQUEST_HANDLERS.set('tool/authorize', async (params: unknown) => {
  const { sessionId, tool, action } = params as { sessionId: string; tool: string; action: string };
  const s = SESSIONS.get(sessionId);
  if (!s) throw new Error(`Session not found: ${sessionId}`);
  const map: Record<string, PermissionLevel> = {
    allow: PermissionLevel.ALWAYS_ALLOW, deny: PermissionLevel.ALWAYS_DENY,
    always_allow: PermissionLevel.ALWAYS_ALLOW, always_deny: PermissionLevel.ALWAYS_DENY,
  };
  s.permissions.set(tool, map[action] || PermissionLevel.ASK);
  return { success: true, permission: action };
});

REQUEST_HANDLERS.set('settings', async () => {
  return { protocolVersion: ACP.PROTOCOL_VERSION, sessions: SESSIONS.size };
});

REQUEST_HANDLERS.set('capability/list', async () => {
  return { capabilities: [{ id: 'session', name: 'Session Management' }, { id: 'tools', name: 'Tool Management' }] };
});

REQUEST_HANDLERS.set('ping', async () => {
  return { pong: true, timestamp: Date.now() };
});

REQUEST_HANDLERS.set('exit', async () => {
  return { success: true };
});

export async function processRequestAsync(request: ACP.Request): Promise<ACP.Response> {
  try {
    const handler = REQUEST_HANDLERS.get(request.method);
    if (!handler) {
      return { jsonrpc: '2.0', id: request.id, error: { code: ACP.ErrorCode.METHOD_NOT_FOUND, message: `Method not found: ${request.method}` } };
    }
    const result = await handler(request.params || {}, {} as RequestContext);
    return { jsonrpc: '2.0', id: request.id, result };
  } catch (error) {
    return { jsonrpc: '2.0', id: request.id, error: { code: ACP.ErrorCode.INTERNAL_ERROR, message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

export function getActiveSessionId(): string | null {
  let latestId = '';
  let latestTime = 0;
  for (const [id, s] of SESSIONS) {
    if (s.updatedAt > latestTime) { latestTime = s.updatedAt; latestId = id; }
  }
  return latestId || null;
}

export function createEmptySession(): string {
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  SESSIONS.set(id, { id, messages: [], tools: [], permissions: new Map(), toolCallResults: new Map(), createdAt: Date.now(), updatedAt: Date.now() });
  return id;
}

export type { SessionState };
