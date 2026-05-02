/**
 * CodeEngine — 数据库迁移测试
 *
 * 测试内容：
 * 1. 初始迁移正确创建所有表
 * 2. 迁移幂等性（运行两次不重复创建）
 * 3. 后续迁移正确执行
 * 4. down() 迁移正确回滚
 * 5. 空数据库首次迁移
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

// 加载迁移注册表
import { migrations, CURRENT_SCHEMA_VERSION } from '../migrations/types.js';
import { runMigrations, getCurrentDbVersion, getMigrationList } from '../migrations/index.js';
import migration001 from '../migrations/001_initial.js';

// 确保初始迁移已注册
migrations.push(migration001);

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

  // ─── 测试 1：初始迁移创建所有表 ───

  it('v1 初始迁移应创建所有核心表', () => {
    const db = createTestDb();
    try {
      const result = runMigrations(db);
      assert.strictEqual(result.upgraded, true);
      assert.strictEqual(result.fromVersion, 0);
      assert.strictEqual(result.toVersion, 1);
      assert.strictEqual(result.applied.length, 1);
      assert.strictEqual(result.applied[0].version, 1);

      // 验证核心表存在（根据 001_initial.ts 的实际 DDL）
      const expectedTables = [
        'schema_migrations', 'sessions', 'messages', 'skills',
        'tasks', 'checkpoints', 'conversations',
      ];
      for (const t of expectedTables) {
        assert.ok(tableExists(db, t), `表 ${t} 应该存在`);
      }

      // 验证 schema_migrations 包含 v1 记录
      const row = db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get() as { version: number } | undefined;
      assert.ok(row, 'schema_migrations 应包含 v1 记录');

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
      assert.strictEqual(result2.fromVersion, 1);
      assert.strictEqual(result2.toVersion, 1);
      assert.strictEqual(result2.applied.length, 0);

      assert.ok(tableExists(db, 'sessions'));
      assert.ok(tableExists(db, 'messages'));

    } finally {
      db.close();
    }
  });

  // ─── 测试 3：获取版本 ───

  it('getCurrentDbVersion 应返回正确的版本', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      assert.strictEqual(getCurrentDbVersion(db), 1);
    } finally {
      db.close();
    }
  });

  // ─── 测试 4：迁移列表 ───

  it('getMigrationList 应返回正确的执行状态', () => {
    const db = createTestDb();
    try {
      const list1 = getMigrationList(db);
      assert.ok(list1.length > 0);
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

  // ─── 测试 5：索引创建 ───

  it('v1 应创建所有索引', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      const expectedIndexes = [
        'idx_messages_session', 'idx_sessions_updated',
        'idx_tasks_status', 'idx_checkpoints_session',
        'idx_skills_category', 'idx_conversations_updated',
      ];
      for (const idx of expectedIndexes) {
        assert.ok(indexExists(db, idx), `索引 ${idx} 应该存在`);
      }
    } finally {
      db.close();
    }
  });

  // ─── 测试 6：降级回滚 ───

  it('down() 应正确回滚所有表', () => {
    const db = createTestDb();
    try {
      runMigrations(db);
      assert.ok(tableExists(db, 'sessions'));
      assert.ok(tableExists(db, 'messages'));

      // 执行 down
      const downMigration = migrations.find(m => m.version === 1);
      assert.ok(downMigration?.down, 'v1 应包含 down 函数');
      downMigration!.down(db);

      // 验证所有表被删除
      assert.strictEqual(tableExists(db, 'sessions'), false);
      assert.strictEqual(tableExists(db, 'messages'), false);
      assert.strictEqual(tableExists(db, 'tasks'), false);
      assert.strictEqual(tableExists(db, 'schema_migrations'), false);

    } finally {
      db.close();
    }
  });

  // ─── 测试 7：空数据库首次迁移 ───

  it('空数据库首次迁移应创建 schema_migrations 表', () => {
    const db = createTestDb();
    try {
      assert.strictEqual(tableExists(db, 'schema_migrations'), false);
      runMigrations(db);
      assert.strictEqual(tableExists(db, 'schema_migrations'), true);

      const row = db.prepare('SELECT COUNT(*) as c FROM schema_migrations').get() as { c: number };
      assert.strictEqual(row.c, 1);
    } finally {
      db.close();
    }
  });

  // ─── 测试 8：版本常量正确 ───

  it('CURRENT_SCHEMA_VERSION 应与最新迁移一致', () => {
    const latestVersion = Math.max(...migrations.map(m => m.version));
    assert.strictEqual(CURRENT_SCHEMA_VERSION, latestVersion);
  });

  // ─── 测试 9：迁移文件完整性 ───

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
