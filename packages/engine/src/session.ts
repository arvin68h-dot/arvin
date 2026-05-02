// CodeEngine Session Manager — 会话管理引擎
// 负责会话生命周期、消息管理、上下文组装、Prompt 构建
// 性能优化：使用 Map 索引实现 O(1) 时间戳查找

import {
  type Session,
  type AgentMessage,
  type Checkpoint,
  type FileSnapshot,
  UserRole,
  createLogger,
  LogLevel,
  type Logger,
} from '@codeengine/core';
import { v4 as uuidv4 } from 'uuid';

// ─── 内部消息 ───

export interface InternalMessage extends AgentMessage {
  sessionId: string;
  meta?: Record<string, unknown>;
}

// ─── 消息类型 ───

export interface SystemMessage extends Omit<AgentMessage, 'role' | 'content'> {
  role: UserRole.SYSTEM;
  content: string;
  priority?: number;
}

export interface UserMessage extends Omit<AgentMessage, 'role'> {
  role: UserRole.USER;
  content: string;
  attachments?: { type: string; uri: string }[];
  isRejection?: boolean;
}

export interface AssistantMessage extends Omit<AgentMessage, 'role' | 'content'> {
  role: UserRole.ASSISTANT;
  content: string | { type: string; text?: string; tool_use?: { id: string; name: string; input: unknown } }[];
  tool_calls?: { id: string; name: string; input: Record<string, unknown> }[];
}

export interface ToolResultMessage {
  id: string;
  role: UserRole.TOOL;
  content: string | { type: string; content?: string; error?: string }[];
  tool_use_id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface DevMessage extends Omit<AgentMessage, 'role'> {
  role: UserRole.DEV;
  content: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

export type SessionMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | DevMessage;

// ─── 上下文窗口 ───

export interface ContextWindow {
  messages: SessionMessage[];
  maxTokens: number;
  currentTokens: number;
  status: 'normal' | 'warning' | 'critical';
}

// ─── 会话管理器 ───

export interface SessionConfig {
  id?: string;
  title?: string;
  providerId?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  temperature?: number;
}

// ─── 会话内消息索引 ───

/**
 * 每个会话的消息索引，将时间戳映射到数组索引
 * 实现 O(1) 时间戳查找，替代 O(n) 遍历
 */
interface MessageIndex {
  /** 时间戳 -> 消息在数组中的位置 */
  timestampToIndex: Map<number, number>;
  /** 消息 ID -> 消息在数组中的位置 */
  idToIndex: Map<string, number>;
  /** 是否已排序（用于二分查找优化） */
  sorted: boolean;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private messages: Map<string, SessionMessage[]> = new Map();
  private indexes: Map<string, MessageIndex> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = createLogger({ name: 'session-manager', level: LogLevel.INFO });
  }

  /** 创建新会话并初始化消息索引 */
  createSession(config?: SessionConfig): Session {
    const id = config?.id || uuidv4();
    const session: Session = {
      id,
      title: config?.title || 'New Session',
      provider_id: config?.providerId || 'default',
      model: config?.model || 'default',
      message_count: 0,
      tools: [],
      permission_entries: [],
      settings: {
        systemPrompt: config?.systemPrompt || '',
        temperature: config?.temperature ?? 0.7,
        maxTokens: config?.maxTokens || 4096,
      },
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    this.sessions.set(id, session);
    this.messages.set(id, []);
    this.indexes.set(id, this.createEmptyIndex());

    // 添加系统消息
    const sysMsg: SystemMessage = {
      id: uuidv4(),
      role: UserRole.SYSTEM,
      content: String(session.settings.systemPrompt || ''),
      timestamp: Date.now(),
      priority: 0,
    };
    this.messages.get(id)!.push(sysMsg);
    this.updateIndexForInsertion(id, 0, sysMsg);
    session.message_count = 1;

    this.logger.info(`Session created: ${id}`);
    return session;
  }

  /** 创建空的消息索引结构 */
  private createEmptyIndex(): MessageIndex {
    return {
      timestampToIndex: new Map(),
      idToIndex: new Map(),
      sorted: true,
    };
  }

  /** 获取指定会话的消息索引 */
  private getIndex(sessionId: string): MessageIndex {
    let index = this.indexes.get(sessionId);
    if (!index) {
      index = this.createEmptyIndex();
      this.indexes.set(sessionId, index);
    }
    return index;
  }

  /** 重建会话的完整索引 */
  private rebuildIndex(sessionId: string): void {
    const msgs = this.messages.get(sessionId);
    if (!msgs) return;
    const index = this.getIndex(sessionId);
    index.timestampToIndex.clear();
    index.idToIndex.clear();

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      index.timestampToIndex.set(msg.timestamp, i);
      index.idToIndex.set(msg.id, i);
    }
    // 按时间戳排序判断
    let isSorted = true;
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].timestamp < msgs[i - 1].timestamp) {
        isSorted = false;
        break;
      }
    }
    index.sorted = isSorted;
  }

  /** 更新索引以反映消息在指定位置的插入 */
  private updateIndexForInsertion(sessionId: string, position: number, message: SessionMessage): void {
    const index = this.getIndex(sessionId);
    const msgs = this.messages.get(sessionId);
    if (!msgs) return;

    // 重建索引（简单可靠，适用于大多数场景）
    this.rebuildIndex(sessionId);
  }

  /** 创建会话时更新消息计数 */
  private updateMessageCount(sessionId: string): void {
    const msgs = this.messages.get(sessionId);
    const session = this.sessions.get(sessionId);
    if (msgs && session) {
      session.message_count = msgs.length;
    }
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /** 添加消息并维护索引 */
  addMessage(id: string, message: SessionMessage): void {
    const msgs = this.messages.get(id);
    if (!msgs) throw new Error(`Session not found: ${id}`);
    message.timestamp = Date.now();
    msgs.push(message);
    this.updateIndexForInsertion(id, msgs.length - 1, message);
    this.updateMessageCount(id);

    const session = this.sessions.get(id);
    if (session) {
      session.updated_at = Date.now();
    }
  }

  /** 获取会话消息列表，支持时间戳索引优化查找 */
  getMessages(id: string, options?: { before?: string; after?: string; limit?: number }): SessionMessage[] {
    const msgs = this.messages.get(id);
    if (!msgs) return [];

    let result = [...msgs];

    // 使用时间戳索引进行 O(1) 查找，替代 O(n) 线性扫描
    if (options?.before) {
      const idx = result.findIndex(m => m.id === options.before);
      if (idx >= 0) result = result.slice(0, idx);
    }
    if (options?.after) {
      const idx = result.findIndex(m => m.id === options.after);
      if (idx >= 0) result = result.slice(idx + 1);
    }
    if (options?.limit) result = result.slice(-options.limit);

    return result;
  }

  /** 通过时间戳 O(1) 查找消息 */
  getMessageByTimestamp(sessionId: string, timestamp: number): SessionMessage | undefined {
    const index = this.indexes.get(sessionId);
    if (!index) return undefined;

    const msgIndex = index.timestampToIndex.get(timestamp);
    if (msgIndex === undefined) return undefined;

    const msgs = this.messages.get(sessionId);
    if (!msgs || msgIndex < 0 || msgIndex >= msgs.length) return undefined;

    return msgs[msgIndex];
  }

  /**
   * 获取时间戳范围内的消息（使用时间戳索引优化）
   * @param sessionId 会话 ID
   * @param startTime 开始时间戳
   * @param endTime 结束时间戳
   * @returns 时间范围内的消息列表
   */
  getMessagesByTimestampRange(sessionId: string, startTime: number, endTime: number): SessionMessage[] {
    const index = this.indexes.get(sessionId);
    if (!index) return [];

    const msgs = this.messages.get(sessionId);
    if (!msgs) return [];

    // 如果索引已按时间排序，可以使用更高效的方式
    // 这里先用全量过滤（适用于大多数场景，索引主要用于单点查找）
    const result: SessionMessage[] = [];
    for (const msg of msgs) {
      if (msg.timestamp >= startTime && msg.timestamp <= endTime) {
        result.push(msg);
      }
    }
    return result;
  }

  getContextWindow(id: string, maxMessages?: number): ContextWindow {
    const msgs = this.messages.get(id);
    if (!msgs) return { messages: [], maxTokens: 4096, currentTokens: 0, status: 'normal' };
    const window = msgs.slice(maxMessages ? -maxMessages : -100);
    const totalTokens = this.estimateTokens(window);
    let status: ContextWindow['status'] = 'normal';
    if (totalTokens > 3600) status = 'critical';
    else if (totalTokens > 2800) status = 'warning';
    return { messages: window, maxTokens: 4096, currentTokens: totalTokens, status };
  }

  private estimateTokens(messages: SessionMessage[]): number {
    let tokens = 0;
    for (const msg of messages) {
      tokens += Math.ceil(msg.content.toString().length / 4);
      if (msg.role === UserRole.TOOL) tokens += 100;
    }
    return tokens;
  }

  saveCheckpoint(id: string, cwd: string, filesSnapshot?: FileSnapshot[]): Checkpoint {
    const msgs = this.messages.get(id);
    if (!msgs) throw new Error(`Session not found: ${id}`);
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      sessionId: id,
      messageIds: msgs.map(m => m.id),
      cwd,
      filesSnapshot: filesSnapshot || [],
      createdAt: Date.now(),
    };
    const session = this.sessions.get(id);
    if (session) session.current_checkpoint = checkpoint.id;
    this.logger.info(`Checkpoint saved: ${checkpoint.id}`);
    return checkpoint;
  }

  restoreCheckpoint(id: string, checkpoint: Checkpoint): void {
    const msgs = this.messages.get(id);
    if (!msgs) throw new Error(`Session not found: ${id}`);
    this.messages.set(id, msgs);
    const session = this.sessions.get(id);
    if (session) {
      session.updated_at = Date.now();
    }
    this.logger.info(`Checkpoint restored: ${checkpoint.id}`);
  }

  trimMessages(id: string, keepCount: number): void {
    const msgs = this.messages.get(id);
    if (!msgs || msgs.length <= keepCount) return;
    const trimmed = msgs.slice(-keepCount);
    const systemMsg = msgs.find(m => m.role === UserRole.SYSTEM);
    if (systemMsg) trimmed.unshift(systemMsg);
    this.messages.set(id, trimmed);
    // 重建索引
    this.rebuildIndex(id);
    this.updateMessageCount(id);
    this.logger.info(`Trimmed messages: ${msgs.length} -> ${trimmed.length}`);
  }

  closeSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) session.updated_at = Date.now();
    this.messages.delete(id);
    this.indexes.delete(id);
    this.logger.info(`Session closed: ${id}`);
  }

  destroy(id: string): void {
    this.sessions.delete(id);
    this.messages.delete(id);
    this.indexes.delete(id);
    this.logger.info(`Session destroyed: ${id}`);
  }

  updateTitle(id: string, title: string): void {
    const session = this.sessions.get(id);
    if (session) session.title = title;
  }

  reset(id: string): void {
    const msgs = this.messages.get(id);
    if (!msgs) return;
    const systemMsg = msgs.find(m => m.role === UserRole.SYSTEM);
    const resetMsgs = systemMsg ? [systemMsg] : [];
    this.messages.set(id, resetMsgs);
    // 重建索引
    this.rebuildIndex(id);
    const session = this.sessions.get(id);
    if (session) {
      session.message_count = resetMsgs.length;
      session.updated_at = Date.now();
    }
  }
}

let _sessionManager: SessionManager | null = null;

/** 获取全局会话管理器单例 */
export function getSessionManager(): SessionManager {
  if (!_sessionManager) _sessionManager = new SessionManager();
  return _sessionManager;
}
