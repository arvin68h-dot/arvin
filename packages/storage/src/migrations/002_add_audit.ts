// ═══════════════════════════════════════════════════════════════
// CodeEngine 数据库迁移 - v2 变更日志
// ═══════════════════════════════════════════════════════════════
//
// 这个文件演示了如何编写"增量迁移"（仅从 v1 → v2 需要执行的 SQL）。
//
// 如何编写增量迁移？
// ──────────────────
// 1. 确定目标版本号（version: 2）
// 2. 只写"从上一版本升级到这个版本"需要的 SQL
// 3. 如果不记得上一版本的结构了，参考 001_initial.ts
// 4. down() 函数：从当前版本降级到上一版本（只写需要的反向 SQL）
//
// 重要：
//   - up() 只写【新增】的 SQL，不要重复创建已有的表
//   - down() 只写【删除】的 SQL，不要删除无关的表
//   - 版本号 = 文件名编号（002 = v2，003 = v3...）

import type { DB } from './types.js';

export default {
  // 版本号：递增到 2
  version: 2,

  // 迁移描述
  name: 'v2 — 添加审计日志表',

  // 从 v1 升级到 v2 需要执行的 SQL
  up: (db: DB) => {
    const now = Date.now();

    // 1. 创建审计日志表（记录所有数据库变更）
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,          -- CREATE / UPDATE / DELETE / MIGRATE
        entity_type TEXT NOT NULL,     -- session / message / skill / task ...
        entity_id TEXT NOT NULL,
        old_value TEXT,                -- 变更前的 JSON 数据
        new_value TEXT,                -- 变更后的 JSON 数据
        created_by TEXT,               -- 操作人（如有）
        created_at INTEGER NOT NULL
      )
    `);

    // 2. 为 messages 表添加 conversation_id 字段
    //    （允许将消息按对话分组）
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages_new (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        conversation_id TEXT DEFAULT '',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tool_calls TEXT,
        tool_results TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      INSERT INTO messages_new (id, session_id, conversation_id, role, content, timestamp, tool_calls, tool_results)
      SELECT id, session_id, '', role, content, timestamp, tool_calls, tool_results
      FROM messages
    `);

    db.exec(`DROP TABLE messages`);
    db.exec(`ALTER TABLE messages_new RENAME TO messages`);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages(session_id, timestamp)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_id, timestamp)
    `);

    // 3. 创建审计日志索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
        ON audit_logs(entity_type, entity_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created
        ON audit_logs(created_at DESC)
    `);

    // 4. 记录版本
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(2, now);
  },

  // 从 v2 降级到 v1 需要的 SQL
  down: (db: DB) => {
    // 1. 删除审计日志表
    db.exec('DROP TABLE IF EXISTS audit_logs');

    // 2. 恢复 messages 旧结构（删除 conversation_id）
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages_v1 (
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

    db.exec(`
      INSERT INTO messages_v1 (id, session_id, role, content, timestamp, tool_calls, tool_results)
      SELECT id, session_id, role, content, timestamp, tool_calls, tool_results
      FROM messages
    `);

    db.exec(`DROP TABLE messages`);
    db.exec(`ALTER TABLE messages_v1 RENAME TO messages`);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages(session_id, timestamp)
    `);

    // 3. 删除版本记录（v2）
    db.prepare('DELETE FROM schema_migrations WHERE version = 2').run();
  },
};
