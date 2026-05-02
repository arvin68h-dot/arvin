// ═══════════════════════════════════════════════════════════════
// CodeEngine 数据库迁移 - 初始版本 (v1)
// ═══════════════════════════════════════════════════════════════
//
// 这是第一次初始化数据库。
// 它会创建所有表、索引和版本记录。
//
// 当你新增一张表或修改字段时：
//   1. 递增 types.ts 中的 CURRENT_SCHEMA_VERSION（1 → 2）
//   2. 创建新迁移文件 002_xxx.ts
//   3. 在 002 中只写"增量变更"（比如 ALTER TABLE）
//   4. 在 migrations/index.ts 中注册它

import type { DB } from './types.js';

// export 必须叫 default，迁移调度器用 import() 加载
export default {
  // 版本号：必须与 types.ts 的 CURRENT_SCHEMA_VERSION 一致
  version: 1,

  // 迁移描述：方便在日志和错误信息中识别
  name: 'Initial schema — 创建所有基础表',

  // 升级函数：把空数据库升级到 v1
  // 参数 db 是 better-sqlite3 的数据库实例
  up: (db: DB) => {
    const now = Date.now();

    // 1. 先创建版本表（其他表依赖它检查版本号）
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    // 2. 记录当前版本
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, now);

    // 3. 创建会话表（每次 AI 对话对应一个会话）
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        provider_id TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL DEFAULT 0,
        tools TEXT NOT NULL DEFAULT '[]',
        permission_entries TEXT NOT NULL DEFAULT '[]',
        settings TEXT NOT NULL DEFAULT '{}',
        current_checkpoint TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 4. 创建消息表（每条 AI 对话记录和用户消息）
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tool_calls TEXT,
        tool_results TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // 5. 创建技能表（AI 使用的技能定义）
    db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        name TEXT PRIMARY KEY,
        category TEXT NOT NULL DEFAULT '',
        path TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        context TEXT NOT NULL DEFAULT '',
        files TEXT NOT NULL DEFAULT '[]',
        variables TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 6. 创建任务表（大任务拆分后的子任务）
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        commands TEXT NOT NULL DEFAULT '[]',
        files TEXT NOT NULL DEFAULT '[]',
        expected_files TEXT DEFAULT '[]',
        dependencies TEXT NOT NULL DEFAULT '[]',
        permission TEXT,
        requires_approval INTEGER DEFAULT 0,
        estimated_cost REAL,
        estimated_time INTEGER,
        result TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 7. 创建快照表（代码编辑前的备份点）
    db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        message_ids TEXT NOT NULL DEFAULT '[]',
        cwd TEXT NOT NULL DEFAULT '',
        files_snapshot TEXT NOT NULL DEFAULT '[]',
        git_status TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // 8. 创建对话表（跨会话聚合，方便查看同一 AI 的多个对话）
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        agent_id TEXT,
        session_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // ─── 创建索引（加速查询） ───
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages(session_id, timestamp)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_updated
        ON sessions(updated_at DESC)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status
        ON tasks(status)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_session
        ON checkpoints(session_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_category
        ON skills(category)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_updated
        ON conversations(updated_at DESC)
    `);
  },

  // 降级函数：从 v1 降级到空状态
  // 注意：降级会删除所有数据，请谨慎使用！
  down: (db: DB) => {
    db.exec('DROP TABLE IF EXISTS conversations');
    db.exec('DROP TABLE IF EXISTS checkpoints');
    db.exec('DROP TABLE IF EXISTS tasks');
    db.exec('DROP TABLE IF EXISTS skills');
    db.exec('DROP TABLE IF EXISTS messages');
    db.exec('DROP TABLE IF EXISTS sessions');
    db.exec('DROP TABLE IF EXISTS schema_migrations');
  },
};
