// ═══════════════════════════════════════════════════════════════
// CodeEngine 数据库迁移 - 调度器
// ═══════════════════════════════════════════════════════════════
//
// 作用：检查当前数据库版本，自动执行未运行的迁移。
//
// 使用方法（在 storage/index.ts 的 initializeDatabase 中）：
//
//   import { runMigrations } from './migrations/index.js';
//   runMigrations(db);
//
// 工作流程：
//   1. 从 schema_migrations 表读取已执行的最高版本
//   2. 加载 migrations 注册表中的所有迁移
//   3. 按版本号排序（从小到大）
//   4. 执行未运行的迁移
//   5. 每个迁移成功后，记录到 schema_migrations 表
//
// 示例：
//   数据库当前版本: 0
//   已注册的迁移: [v1, v2, v3]
//   执行顺序: v1 → v2 → v3
//   数据库新版本: 3
//
//   下次启动:
//   数据库当前版本: 3
//   已注册的迁移: [v1, v2, v3]
//   没有新迁移需要执行 → 直接跳过

import { migrations, CURRENT_SCHEMA_VERSION } from './types.js';

// 迁移系统使用的数据库接口（与 StorageDB 兼容）
interface MigratorDB {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: any[]): any[];
    get(...params: any[]): any;
    run(...params: any[]): { changes: number; lastId: number };
  };
  close(): void;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
}

// ─── 获取当前数据库版本 ───
function getCurrentVersion(db: MigratorDB): number {
  try {
    // 先检查表是否存在
    const tableExists = db.prepare(
      "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).get() as { cnt: number };

    if (!tableExists || tableExists.cnt === 0) {
      return 0; // 全新数据库
    }

    const row = db.prepare(
      'SELECT MAX(version) as max_version FROM schema_migrations'
    ).get() as { max_version: number | null };

    return row?.max_version ?? 0;
  } catch {
    return 0; // 表不存在也返回 0
  }
}

// ─── 获取所有已注册的迁移 ───
function getAvailableMigrations(): typeof migrations {
  return [...migrations].sort((a, b) => a.version - b.version);
}

// ─── 执行所有待执行的迁移 ───
//
// 这是核心函数，在数据库初始化时调用。
// 它会按版本号从小到大执行所有未运行的迁移。
export function runMigrations(db: MigratorDB): {
  upgraded: boolean;
  fromVersion: number;
  toVersion: number;
  applied: Array<{ version: number; name: string; duration: number }>;
} {
  const currentVersion = getCurrentVersion(db);

  // 如果没有新的迁移需要执行，直接返回
  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return {
      upgraded: false,
      fromVersion: currentVersion,
      toVersion: currentVersion,
      applied: [],
    };
  }

  const available = getAvailableMigrations();
  const pending = available.filter((m) => m.version > currentVersion);

  console.log(`[migration] 检测到 ${pending.length} 个待执行迁移`);
  console.log(`[migration] 版本: ${currentVersion} → ${CURRENT_SCHEMA_VERSION}`);

  const applied: Array<{
    version: number;
    name: string;
    duration: number;
  }> = [];

  // 按版本号顺序执行
  for (const migration of pending) {
    const start = Date.now();
    try {
      console.log(`[migration] 执行 v${migration.version}: ${migration.name}`);
      migration.up(db); // 执行升级函数
      const duration = Date.now() - start;
      applied.push({
        version: migration.version,
        name: migration.name,
        duration,
      });
      console.log(`[migration] v${migration.version} 完成 (${duration}ms)`);
    } catch (err) {
      const duration = Date.now() - start;
      console.error(
        `[migration] v${migration.version} 失败 (${duration}ms):`,
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  }

  console.log(
    `[migration] 升级完成: ${currentVersion} → ${CURRENT_SCHEMA_VERSION}`
  );
  return {
    upgraded: true,
    fromVersion: currentVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
    applied,
  };
}

// ─── 获取迁移列表信息（供 CLI 使用） ───
export function getMigrationList(db: MigratorDB): Array<{
  version: number;
  name: string;
  executed: boolean;
}> {
  const currentVersion = getCurrentVersion(db);
  return getAvailableMigrations().map((m) => ({
    version: m.version,
    name: m.name,
    executed: m.version <= currentVersion,
  }));
}

// ─── 获取当前版本 ───
export function getCurrentDbVersion(db: MigratorDB): number {
  return getCurrentVersion(db);
}
