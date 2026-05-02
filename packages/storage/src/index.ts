// ========================
// CodeEngine Storage — SQLite 持久化存储层
// ========================

const Database = require('better-sqlite3') as {
  new (path: string, options?: { readonly?: boolean; timeout?: number; wal?: boolean; mmapSize?: number }): StorageDB;
};

interface StorageDB {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: any[]): any[];
    get(...params: any[]): any;
    run(...params: any[]): { changes: number; lastId: number };
  };
  close(): void;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
}

import * as path from 'path';
import * as fs from 'fs';
import {
  STORAGE_PATH,
  type ToolDefinition,
  type Session,
  type Message,
  type Skill,
  type Task,
  type TaskStatus,
  type Checkpoint,
  type MessageRole,
  type Conversation,
  type ToolCall,
  type ToolResult,
  type PermissionLevel,
  type PermissionEntry,
} from '@codeengine/core';

// ─── 数据库路径解析 ───

function resolveStoragePath(): string {
  // 测试时支持 CODEENGINE_DATA_DIR 环境变量覆盖默认路径
  let resolved: string;
  if (process.env.CODEENGINE_DATA_DIR) {
    resolved = process.env.CODEENGINE_DATA_DIR;
    // 对于内存数据库，不需要创建目录
    if (resolved !== ':memory:' && !resolved.startsWith(':memory:')) {
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  } else {
    resolved = STORAGE_PATH.replace('~', process.env.HOME || process.env.USERPROFILE || '');
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return resolved;
}

// ═══════════════════════════════════════════════════════════════
// CodeEngine 数据库迁移 - 类型定义
// ═══════════════════════════════════════════════════════════════
//
// 什么是数据库迁移？
// ─────────────────
// 当你修改数据库表结构（比如新增字段、新表、改字段类型）时，
// 老用户安装的版本已经有数据了，不能直接删表重建。
// 迁移系统就是安全地"升级"老数据库到新结构的工具。
//
// 工作方式是：
//   1. 每次修改数据库结构时，写一个"迁移文件"（比如 002_add_column.ts）
//   2. 迁移文件告诉系统"怎么升"（up）和"怎么降"（down）
//   3. 系统启动时检查已执行的迁移，自动运行未执行的迁移
//   4. 记录版本号，不会重复执行
//
// 每个迁移文件 = 一个版本号 = 一组 SQL 语句
// 版本号从 1 开始，依次递增
// ─── 导入迁移系统 ───
import { migrations } from './migrations/types.js';
import { runMigrations, getCurrentDbVersion, getMigrationList } from './migrations/index.js';
import migration001 from './migrations/001_initial.js';

// 注册初始迁移（当前完整 DDL）
migrations.push(migration001);

// ─── Schema 版本 ───

// ─── 数据库实例 ───

let _db: StorageDB | null = null;
let _dbPath = '';

export function getDb(): StorageDB {
  if (!_db) {
    try {
      _dbPath = resolveStoragePath();
      _db = new Database(_dbPath, {
        wal: true,         // WAL 模式提升并发性能
        mmapSize: 1024 * 1024 * 256, // 256MB 内存映射
        timeout: 5000,     // 5秒锁等待
      });
      initializeDatabase(_db);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to initialize storage: ${msg}`);
    }
  }
  return _db;
}

// ─── 数据库初始化 ───
//
// 使用迁移系统创建/升级数据库。
// 第一次启动：执行 v1 迁移（创建所有表）
// 后续启动：检查版本，只执行新增的迁移（比如 v2、v3...）
function initializeDatabase(db: StorageDB): void {
  try {
    const result = runMigrations(db);
    if (result.upgraded) {
      console.log(`[storage] 数据库已升级: v${result.fromVersion} → v${result.toVersion}`);
      for (const a of result.applied) {
        console.log(`[storage]   → v${a.version}: ${a.name} (${a.duration}ms)`);
      }
    } else {
      console.log(`[storage] 数据库已是最新版本 v${result.toVersion}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[storage] 数据库迁移失败: ${msg}`);
    throw err;
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ─── 优雅退出 ───

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});

process.on('SIGINT', () => {
  closeDb();
  process.exit(0);
});

// ─── SQL 字段白名单校验 ───

const FIELD_WHITELISTS: Record<string, Set<string>> = {
  sessions: new Set(['title', 'provider_id', 'model', 'tools', 'permission_entries', 'settings', 'current_checkpoint', 'message_count', 'updated_at']),
  skills: new Set(['category', 'path', 'content', 'context', 'files', 'variables', 'updated_at']),
  tasks: new Set(['name', 'status', 'commands', 'files', 'expected_files', 'dependencies', 'parent_task_id', 'updated_at']),
  conversations: new Set(['title', 'updated_at']),
};

function validateFields(table: string, setStrings: string[]): string[] {
  const allowed = FIELD_WHITELISTS[table];
  if (!allowed) return setStrings;
  return setStrings.filter(s => {
    const fieldName = s.split(' ')[0]; // 提取 'title = @title' -> 'title'
    return allowed.has(fieldName);
  });
}

// ─── JSON 辅助函数 ───

function jsonSerialize(value: unknown): string {
  if (value === undefined || value === null) return '[]';
  return JSON.stringify(value);
}

function jsonParse<T = unknown>(value: string | null | undefined): T {
  if (!value) return undefined as unknown as T;
  try {
    return JSON.parse(value);
  } catch {
    return undefined as unknown as T;
  }
}

// ─── Session CRUD ───

export class SessionStore {
  private get db(): StorageDB { return getDb(); }

  create(data: Omit<Session, 'id' | 'message_count' | 'created_at' | 'updated_at'>): Session {
    const now = Date.now();
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO sessions (id, title, provider_id, model, message_count, tools,
        permission_entries, settings, current_checkpoint, created_at, updated_at)
      VALUES (@id, @title, @provider_id, @model, 0,
        @tools, @permission_entries, @settings, @checkpoint, @created_at, @updated_at)
    `).run({
      id,
      title: data.title,
      provider_id: data.provider_id,
      model: data.model,
      tools: jsonSerialize(data.tools),
      permission_entries: jsonSerialize(data.permission_entries),
      settings: jsonSerialize(data.settings),
      checkpoint: data.current_checkpoint ?? null,
      created_at: now,
      updated_at: now,
    });
    return this.get(id)!;
  }

  get(id: string): Session | undefined {
    const row = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? this.deserialize(row) : undefined;
  }

  list(limit = 50, offset = 0): Session[] {
    const rows = this.db.prepare(`
      SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as Record<string, unknown>[];
    return rows.map(r => this.deserialize(r));
  }

  update(id: string, updates: Partial<Session>): Session | undefined {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (updates.title !== undefined) { sets.push('title = @title'); params.title = updates.title; }
    if (updates.provider_id !== undefined) { sets.push('provider_id = @provider_id'); params.provider_id = updates.provider_id; }
    if (updates.model !== undefined) { sets.push('model = @model'); params.model = updates.model; }
    if (updates.tools !== undefined) { sets.push('tools = @tools'); params.tools = jsonSerialize(updates.tools); }
    if (updates.permission_entries !== undefined) { sets.push('permission_entries = @perm'); params.perm = jsonSerialize(updates.permission_entries); }
    if (updates.settings !== undefined) { sets.push('settings = @settings'); params.settings = jsonSerialize(updates.settings); }
    if (updates.current_checkpoint !== undefined) { sets.push('current_checkpoint = @checkpoint'); params.checkpoint = updates.current_checkpoint || null; }
    if (updates.message_count !== undefined) { sets.push('message_count = @msg_count'); params.msg_count = updates.message_count; }

    sets.push('updated_at = @now');
    params.now = Date.now();

    const safeSets = validateFields('sessions', sets);
    if (safeSets.length > 1) {
      this.db.prepare(`UPDATE sessions SET ${safeSets.join(', ')} WHERE id = @id`).run(params);
    }

    return this.get(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // 更新消息计数
  incrementMessageCount(id: string, count: number): void {
    this.db.prepare('UPDATE sessions SET message_count = message_count + ?, updated_at = ? WHERE id = ?').run(count, Date.now(), id);
  }

  // 更新当前检查点
  setCurrentCheckpoint(id: string, checkpointId: string | null): void {
    this.db.prepare('UPDATE sessions SET current_checkpoint = ?, updated_at = ? WHERE id = ?')
      .run(checkpointId, Date.now(), id);
  }

  private deserialize(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      title: row.title as string,
      provider_id: row.provider_id as string,
      model: row.model as string,
      message_count: row.message_count as number,
      tools: JSON.parse(row.tools as string) as unknown as ToolDefinition[],
      permission_entries: JSON.parse(row.permission_entries as string) as unknown as PermissionEntry[],
      settings: JSON.parse(row.settings as string) as unknown as Record<string, unknown>,
      current_checkpoint: row.current_checkpoint as string | undefined,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    };
  }
}

// ─── Message CRUD ───

export class MessageStore {
  private get db(): StorageDB { return getDb(); }

  create(message: Omit<Message, 'id'>, sessionId: string): Message {
    const id = crypto.randomUUID();
    const { toolCalls, toolResults, ...rest } = message;
    this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp, tool_calls, tool_results)
      VALUES (@id, @session_id, @role, @content, @timestamp, @tool_calls, @tool_results)
    `).run({
      id,
      session_id: sessionId,
      role: message.role,
      content: typeof message.content === 'string' ? message.content : jsonSerialize(message.content),
      timestamp: message.timestamp,
      tool_calls: toolCalls ? jsonSerialize(toolCalls) : null,
      tool_results: toolResults ? jsonSerialize(toolResults) : null,
    });

    // 更新会话消息计数
    this.db.prepare('UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?')
      .run(Date.now(), sessionId);

    return { ...rest, id, toolCalls, toolResults };
  }

  getBySession(sessionId: string, limit = 100, before?: number): Message[] {
    const sql = before
      ? 'SELECT * FROM messages WHERE session_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?'
      : 'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?';
    const rows = this.db.prepare(sql).all(sessionId, before ?? 0, limit) as Record<string, unknown>[];
    return rows.map(r => this.deserialize(r)).reverse();
  }

  getById(id: string): Message | undefined {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.deserialize(row) : undefined;
  }

  deleteBySession(sessionId: string): number {
    const result = this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
    return result.changes;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // 批量插入（用于恢复会话）
  batchInsert(messages: Omit<Message, 'id'>[], sessionId: string): number {
    const insert = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp, tool_calls, tool_results)
      VALUES (@id, @session_id, @role, @content, @timestamp, @tool_calls, @tool_results)
    `);
    const insertMany = this.db.transaction((msgs: typeof messages) => {
      let count = 0;
      for (const msg of msgs) {
        const id = crypto.randomUUID();
        const { toolCalls, toolResults, ...rest } = msg;
        insert.run({
          id,
          session_id: sessionId,
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : jsonSerialize(msg.content),
          timestamp: msg.timestamp,
          tool_calls: toolCalls ? jsonSerialize(toolCalls) : null,
          tool_results: toolResults ? jsonSerialize(toolResults) : null,
        });
        count++;
      }
      // 更新会话计数
      this.db.prepare('UPDATE sessions SET message_count = message_count + ?, updated_at = ? WHERE id = ?')
        .run(count, Date.now(), sessionId);
      return count;
    });
    return insertMany(messages);
  }

  protected deserialize(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      role: row.role as MessageRole,
      content: row.content as string,
      timestamp: row.timestamp as number,
      toolCalls: jsonParse<ToolCall[]>(row.tool_calls as string),
      toolResults: jsonParse<ToolResult[]>(row.tool_results as string),
    };
  }
}

// ─── Skill CRUD ───

export class SkillStore {
  private get db(): StorageDB { return getDb(); }

  create(skill: Omit<Skill, 'created_at' | 'updated_at'>): Skill {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO skills (name, category, path, content, context, files, variables, created_at, updated_at)
      VALUES (@name, @category, @path, @content, @context, @files, @variables, @created_at, @updated_at)
    `).run({
      name: skill.name,
      category: skill.category ?? null,
      path: skill.path,
      content: skill.content,
      context: skill.context,
      files: jsonSerialize(skill.files ?? []),
      variables: jsonSerialize(skill.variables ?? []),
      created_at: now,
      updated_at: now,
    });
    return this.get(skill.name)!;
  }

  get(name: string): Skill | undefined {
    const row = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as Record<string, unknown> | undefined;
    return row ? this.deserialize(row) : undefined;
  }

  list(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills ORDER BY name').all() as Record<string, unknown>[];
    return rows.map(r => this.deserialize(r));
  }

  update(name: string, updates: Partial<Skill>): Skill | undefined {
    const sets: string[] = [];
    const params: Record<string, unknown> = { name, now: Date.now() };

    if (updates.category !== undefined) { sets.push('category = @category'); params.category = updates.category; }
    if (updates.path !== undefined) { sets.push('path = @path'); params.path = updates.path; }
    if (updates.content !== undefined) { sets.push('content = @content'); params.content = updates.content; }
    if (updates.context !== undefined) { sets.push('context = @context'); params.context = updates.context; }
    if (updates.files !== undefined) { sets.push('files = @files'); params.files = jsonSerialize(updates.files); }
    if (updates.variables !== undefined) { sets.push('variables = @variables'); params.variables = jsonSerialize(updates.variables); }
    sets.push('updated_at = @now');

    const safeSets = validateFields('skills', sets);
    this.db.prepare(`UPDATE skills SET ${safeSets.join(', ')} WHERE name = @name`).run(params);
    return this.get(name);
  }

  delete(name: string): boolean {
    const result = this.db.prepare('DELETE FROM skills WHERE name = ?').run(name);
    return result.changes > 0;
  }

  private deserialize(row: Record<string, unknown>): Skill {
    return {
      name: row.name as string,
      category: row.category as string | undefined,
      path: row.path as string,
      content: row.content as string,
      context: row.context as string,
      files: jsonParse<string[]>(row.files as string),
      variables: jsonParse<string[]>(row.variables as string),
    };
  }
}

// ─── Task CRUD ───

export class TaskStore {
  private get db(): StorageDB { return getDb(); }

  create(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Task {
    const now = Date.now();
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO tasks (id, name, description, status, commands, files, expected_files,
        dependencies, permission, requires_approval, estimated_cost, estimated_time, created_at, updated_at)
      VALUES (@id, @name, @description, @status, @commands, @files, @expected_files,
        @dependencies, @permission, @requires_approval, @est_cost, @est_time, @created_at, @updated_at)
    `).run({
      id,
      name: task.name,
      description: task.description,
      status: task.status,
      commands: jsonSerialize(task.commands),
      files: jsonSerialize(task.files),
      expected_files: jsonSerialize(task.expectedFiles ?? []),
      dependencies: jsonSerialize(task.dependencies),
      permission: task.permission ?? null,
      requires_approval: task.requiresApproval ? 1 : 0,
      est_cost: task.estimatedCost ?? null,
      est_time: task.estimatedTime ?? null,
      created_at: now,
      updated_at: now,
    });
    return this.get(id)!;
  }

  get(id: string): Task | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.deserialize(row) : undefined;
  }

  list(status?: TaskStatus, limit = 100): Task[] {
    const sql = status
      ? 'SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?';
    const rows = this.db.prepare(sql).all(
      status === undefined ? limit : [status, limit]
    ) as Record<string, unknown>[];
    return rows.map(r => this.deserialize(r));
  }

  update(id: string, updates: Partial<Task>): Task | undefined {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id, now: Date.now() };

    if (updates.name !== undefined) { sets.push('name = @name'); params.name = updates.name; }
    if (updates.status !== undefined) { sets.push('status = @status'); params.status = updates.status; }
    if (updates.commands !== undefined) { sets.push('commands = @commands'); params.commands = jsonSerialize(updates.commands); }
    if (updates.files !== undefined) { sets.push('files = @files'); params.files = jsonSerialize(updates.files); }
    if (updates.expectedFiles !== undefined) { sets.push('expected_files = @ef'); params.ef = jsonSerialize(updates.expectedFiles); }
    if (updates.dependencies !== undefined) { sets.push('dependencies = @deps'); params.deps = jsonSerialize(updates.dependencies); }
    if (updates.parentTaskId !== undefined) { sets.push('parent_task_id = @pid'); params.pid = updates.parentTaskId; }
    sets.push('updated_at = @now');

    const safeSets = validateFields('tasks', sets);
    this.db.prepare(`UPDATE tasks SET ${safeSets.join(', ')} WHERE id = @id`).run(params);
    return this.get(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private deserialize(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      status: row.status as TaskStatus,
      commands: jsonParse<string[]>(row.commands as string),
      files: jsonParse<string[]>(row.files as string),
      expectedFiles: jsonParse<string[]>(row.expected_files as string),
      dependencies: jsonParse<string[]>(row.dependencies as string),
      permission: row.permission as PermissionLevel | undefined,
      requiresApproval: row.requires_approval === 1,
      estimatedCost: row.estimated_cost as number | undefined,
      estimatedTime: row.estimated_time as number | undefined,
      parentTaskId: row.parent_task_id as string | undefined,
      groupId: row.group_id as string | undefined,
    };
  }
}

// ─── Checkpoint CRUD ───

export class CheckpointStore {
  private get db(): StorageDB { return getDb(); }

  create(data: Omit<Checkpoint, 'id' | 'createdAt'>): Checkpoint {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO checkpoints (id, session_id, message_ids, cwd, files_snapshot, git_status, created_at)
      VALUES (@id, @session_id, @msg_ids, @cwd, @files, @git_status, @created_at)
    `).run({
      id,
      session_id: data.sessionId,
      msg_ids: jsonSerialize(data.messageIds ?? []),
      cwd: data.cwd,
      files: jsonSerialize(data.filesSnapshot),
      git_status: data.gitStatus ?? null,
      created_at: Date.now(),
    });
    return this.get(id)!;
  }

  get(id: string): Checkpoint | undefined {
    const row = this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.deserialize(row) : undefined;
  }

  getBySession(sessionId: string): Checkpoint[] {
    const rows = this.db.prepare(
      'SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at DESC'
    ).all(sessionId) as Record<string, unknown>[];
    return rows.map(r => this.deserialize(r));
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM checkpoints WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteBySession(sessionId: string): number {
    const result = this.db.prepare('DELETE FROM checkpoints WHERE session_id = ?').run(sessionId);
    return result.changes;
  }

  private deserialize(row: Record<string, unknown>): Checkpoint {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      messageIds: jsonParse<string[]>(row.message_ids as string),
      cwd: row.cwd as string,
      filesSnapshot: jsonParse<{ path: string; content: string; timestamp: number }[]>(row.files_snapshot as string),
      gitStatus: row.git_status as string | undefined,
      createdAt: row.created_at as number,
    };
  }
}

// ─── Conversation CRUD ───

export class ConversationStore {
  private get db(): StorageDB { return getDb(); }

  create(conversation: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Conversation {
    const now = Date.now();
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO conversations (id, title, agent_id, session_id, created_at, updated_at)
      VALUES (@id, @title, @agent_id, @session_id, @created_at, @updated_at)
    `).run({
      id,
      title: conversation.title,
      agent_id: conversation.agentId ?? null,
      session_id: conversation.sessionId ?? null,
      created_at: now,
      updated_at: now,
    });
    return this.get(id)!;
  }

  get(id: string): Conversation | undefined {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const messages = this.db.prepare(
      'SELECT * FROM messages WHERE session_id = ? OR id LIKE ? ORDER BY timestamp'
    ).all(row.session_id as string, `${row.session_id as string}-%`) as Record<string, unknown>[];
    return {
      id: row.id as string,
      title: row.title as string,
      messages: messages.map(m => ({
        id: m.id as string,
        role: m.role as MessageRole,
        content: m.content as string,
        timestamp: m.timestamp as number,
        toolCalls: jsonParse<ToolCall[]>(m.tool_calls as string),
        toolResults: jsonParse<ToolResult[]>(m.tool_results as string),
      })),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      agentId: row.agent_id as string | undefined,
      sessionId: row.session_id as string | undefined,
    };
  }

  list(limit = 50): Conversation[] {
    const rows = this.db.prepare(
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?'
    ).all(limit) as Record<string, unknown>[];
    return rows.map(r => ({
      id: r.id as string,
      title: r.title as string,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      agentId: r.agent_id as string | undefined,
      sessionId: r.session_id as string | undefined,
      messages: [], // 懒加载
    }));
  }

  update(id: string, updates: Partial<Conversation>): Conversation | undefined {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id, now: Date.now() };
    if (updates.title !== undefined) { sets.push('title = @title'); params.title = updates.title; }
    sets.push('updated_at = @now');
    const safeSets = validateFields('conversations', sets);
    if (safeSets.length > 1) {
      this.db.prepare(`UPDATE conversations SET ${safeSets.join(', ')} WHERE id = @id`).run(params);
    }
    return this.get(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

// ─── 导出接口 ───

export function getStoragePath(): string {
  return _dbPath || resolveStoragePath();
}

// ─── 敏感数据脱敏（复用现有逻辑） ───

const SENSITIVE_PATTERNS: { regex: RegExp; replacement: string }[] = [
  { regex: /api[_-]?key\s*[=:]\s*["']?[A-Za-z0-9+/=_-]{16,}["']?/gi, replacement: 'api_key: [REDACTED]' },
  { regex: /token\s*[=:]\s*["']?[A-Za-z0-9+/=_-]{16,}["']?/gi, replacement: 'token: [REDACTED]' },
  { regex: /Authorization:\s*Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi, replacement: 'Authorization: Bearer [REDACTED]' },
  { regex: /password\s*[=:]\s*["']?[^\s"'&]{4,}["']?/gi, replacement: 'password: [REDACTED]' },
  { regex: /secret\s*[=:]\s*["']?[^\s"'&]{4,}["']?/gi, replacement: 'secret: [REDACTED]' },
  { regex: /\b\d{3}[-.]?\d{4}[-.]?\d{4}\b/g, replacement: 'xxx-xxxx-xxxx' },
  { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
];

function sanitizeText(text: string): string {
  let result = text;
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

export function sanitizeForExport(messages: Message[]): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `[${m.role}] ${sanitizeText(m.content)}`)
    .join('\n\n---\n\n');
}

// ─── 数据库迁移导出 ───

// 获取当前数据库版本（供 CLI 使用）
export function getDbVersion(): number {
  if (_db) return getCurrentDbVersion(_db);
  // 数据库未初始化时返回当前 schema 版本
  return 1;
}

// 获取迁移列表信息（供 CLI 使用）
export function listMigrations(): Array<{ version: number; name: string; executed: boolean }> {
  if (_db) return getMigrationList(_db);
  // 数据库未初始化时返回当前已注册的迁移
  return migrations.map(m => ({
    version: m.version,
    name: m.name,
    executed: false,
  }));
}

// 获取当前 schema 版本
export const SCHEMA_VERSION = 1;

// ─── 默认导出 ───

export const sessionStore = new SessionStore();
export const messageStore = new MessageStore();
export const skillStore = new SkillStore();
export const taskStore = new TaskStore();
export const checkpointStore = new CheckpointStore();
export const conversationStore = new ConversationStore();
