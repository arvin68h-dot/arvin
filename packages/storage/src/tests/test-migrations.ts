// @ts-nocheck
/**
 * CodeEngine — 数据库迁移测试
 *
 * 测试内容：
 * 1. 迁移系统正确执行所有未完成的迁移（v1 + v2）
 * 2. 迁移幂等性（运行两次不重复执行）
 * 3. getCurrentDbVersion 返回正确版本
 * 4. getMigrationList 返回正确执行状态
 * 5. v2 迁移创建审计日志表
 * 6. v2 迁移在 messages 表添加 conversation_id
 * 7. down() 迁移正确回滚 v2
 * 8. CURRENT_SCHEMA_VERSION 与最新迁移一致
 * 9. 每个迁移包含 version、name 和 up 函数
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

import { migrations, CURRENT_SCHEMA_VERSION } from '../migrations/types.js';
import { runMigrations, getCurrentDbVersion, getMigrationList } from '../migrations/index.js';

describe('数据库迁移系统', () => {
  // ─── 辅助函数 ───

  function createTestDb(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    return db;
  }

  function tableExists(db: Database.Database, name: string): boolean {
    const row = db.prepare(
      "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name=?"
    ).get(name) as { c: number };
    return row.c > 0;
  }

  function indexExists(db: Database.Database, name: string): boolean {
    const row = db.prepare(
      "SELECT count(*) as c FROM sqlite_master WHERE type='index' AND name=?"
    ).get(name) as { c: number };
    return row.c > 0;
  }

  // ─── 测试 1：所有迁移执行成功 ───

  it('应正确执行 v1 和 v2 迁移', () => {
    const db = createTestDb();
    try {
      const result = runMigrations(db);
      assert.strictEqual(result.upgraded, true);
      assert.strictEqual(result.fromVersion, 0);
      assert.strictEqual(result.toVersion, CURRENT_SCHEMA_VERSION);
      assert.strictEqual(result.applied.length, 2, '应执行 2 个迁移 (v1 + v2)');
      assert.strictEqual(result.applied[0].version, 1);
      assert.strictEqual(result.applied[1].version, 2);
    } finally {
      db.close();
    }
  });

  // ─── 测试 2：幂等性 ───

  it('迁移应幂等，重复运行不应出错', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      const result2 = runMigrations(db);
      assert.strictEqual(result2.upgraded, false);
      assert.strictEqual(result2.fromVersion, CURRENT_SCHEMA_VERSION);
      assert.strictEqual(result2.toVersion, CURRENT_SCHEMA_VERSION);
      assert.strictEqual(result2.applied.length, 0);
    } finally {
      db.close();
    }
  });

  // ─── 测试 3：获取版本 ───

  it('getCurrentDbVersion 应返回正确的版本', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      assert.strictEqual(getCurrentDbVersion(db), CURRENT_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  // ─── 测试 4：迁移列表 ───

  it('getMigrationList 应返回正确的执行状态', () => {
    const db = createTestDb();
    try {
      const list1 = getMigrationList(db);
      for (const m of list1) {
        assert.strictEqual(m.executed, false);
      }

      runMigrations(db);
      const list2 = getMigrationList(db);
      for (const m of list2) {
        assert.strictEqual(m.executed, true, `迁移 v${m.version} 应该标记为已执行`);
      }
    } finally {
      db.close();
    }
  });

  // ─── 测试 5：v2 创建审计日志表 ───

  it('v2 应创建 audit_logs 表', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      assert.ok(tableExists(db, 'audit_logs'), 'audit_logs 表应该存在');

      // 验证表结构
      const columns = db.prepare('PRAGMA table_info(audit_logs)').all() as any[];
      const names = columns.map((c: any) => c.name);
      assert.ok(names.includes('id'), '应有 id 列');
      assert.ok(names.includes('action'), '应有 action 列');
      assert.ok(names.includes('entity_type'), '应有 entity_type 列');
      assert.ok(names.includes('created_at'), '应有 created_at 列');
    } finally {
      db.close();
    }
  });

  // ─── 测试 6：v2 为 messages 添加 conversation_id ───

  it('v2 应为 messages 表添加 conversation_id 列', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      const columns = db.prepare('PRAGMA table_info(messages)').all() as any[];
      const names = columns.map((c: any) => c.name);
      assert.ok(names.includes('conversation_id'), 'messages 表应有 conversation_id 列');
    } finally {
      db.close();
    }
  });

  // ─── 测试 7：v2 创建索引 ───

  it('v2 应创建相关索引', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      assert.ok(indexExists(db, 'idx_messages_conversation'), 'idx_messages_conversation 应存在');
      assert.ok(indexExists(db, 'idx_audit_logs_entity'), 'idx_audit_logs_entity 应存在');
      assert.ok(indexExists(db, 'idx_audit_logs_created'), 'idx_audit_logs_created 应存在');
    } finally {
      db.close();
    }
  });

  // ─── 测试 8：down() 回滚 v2 ───

  it('down() 应正确回滚 v2', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      assert.ok(tableExists(db, 'audit_logs'));

      // 执行 v2 的 down
      const v2Migration = migrations.find(m => m.version === 2);
      assert.ok(v2Migration?.down, 'v2 应包含 down 函数');
      v2Migration!.down(db);

      // 验证 audit_logs 被删除
      assert.strictEqual(tableExists(db, 'audit_logs'), false, 'audit_logs 应被删除');
      // 验证 v2 版本记录被删除
      const row = db.prepare('SELECT version FROM schema_migrations WHERE version = 2').get();
      assert.strictEqual(row, undefined, 'v2 版本记录应被删除');
    } finally {
      db.close();
    }
  });

  // ─── 测试 9：版本常量 ───

  it('CURRENT_SCHEMA_VERSION 应与最新迁移一致', () => {
    const latestVersion = Math.max(...migrations.map(m => m.version));
    assert.strictEqual(CURRENT_SCHEMA_VERSION, latestVersion);
  });

  // ─── 测试 10：迁移完整性 ───

  it('每个迁移应包含 version、name 和 up 函数', () => {
    for (const m of migrations) {
      assert.ok(typeof m.version === 'number' && m.version > 0,
        `迁移 ${m.name} 的 version 应为正整数`);
      assert.ok(typeof m.name === 'string' && m.name.length > 0,
        `迁移 ${m.version} 的 name 应非空`);
      assert.ok(typeof m.up === 'function',
        `迁移 ${m.name} 的 up 应为函数`);
    }
  });
});
