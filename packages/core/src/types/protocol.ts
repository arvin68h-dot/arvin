// ─── ACP（Agent Control Protocol） ───

export namespace ACP {
  export const PROTOCOL_VERSION = '2.0';
  export const MESSAGE_CHANNEL = 'codeengine';

  export enum ErrorCode {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    SESSION_NOT_FOUND = -32000,
    PERMISSION_DENIED = -32001,
    TOOL_ERROR = -32002,
    TIMEOUT = -32003,
    INTERRUPTED = -32004,
  }

  export interface Request {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
  }

  export interface Notification {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
  }

  export interface Response {
    jsonrpc: '2.0';
    id: string | number;
    result?: unknown;
    error?: {
      code: number;
      message: string;
      data?: unknown;
    };
  }

  export const EVENTS = {
    SESSION_CREATED: 'session:created',
    SESSION_SWITCHED: 'session:switched',
    SESSION_ENDED: 'session:ended',
  } as const;
}

export type AcpMethod = string;
export type AgentCommand = ACP.Request | ACP.Notification | ACP.Response;
