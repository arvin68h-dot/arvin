// ═══════════════════════════════════════════════════════════════
// CodeEngine 数据库迁移系统 - 类型定义
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

// ─── 导入类型 ───

// 迁移系统使用的最小数据库接口（all methods used by migrations）
interface DB {
  prepare(sql: string): {
    all(...params: any[]): any[];
    get(...params: any[]): any;
    run(...params: any[]): { changes: number; lastId: number };
  };
  exec(sql: string): void;
  close(): void;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
}

// ─── 迁移文件导出格式 ───
//
// 一个标准的迁移文件看起来是这样：
//
//   export default {
//     version: 2,                          // 版本号（从 1 开始递增）
//     name: 'Add user role to sessions',   // 迁移描述（给人看的）
//     up: (sql) => [                       // 升级 SQL（升方向）
//       'ALTER TABLE sessions ADD COLUMN role TEXT DEFAULT "user"',
//       'CREATE INDEX idx_sessions_role ON sessions(role)',
//     ],
//     down: (sql) => [                     // 降级 SQL（降方向，可选）
//       'DROP INDEX idx_sessions_role',
//       'ALTER TABLE sessions DROP COLUMN role',
//     ],
//   };
//
// 注意：up 和 down 执行一组 SQL 语句，系统会按顺序执行这些语句。

// ─── 版本配置 ───
//
// 当前数据库结构的版本号。
// 每次修改数据库表结构时，递增这个数字，并新增一个迁移文件。
export const CURRENT_SCHEMA_VERSION = 2; // ⚡ 每次升级时递增！

// ─── 迁移类型 ───
//
// 每个迁移对象包含四个属性：
//   version — 版本号，必须唯一且递增
//   name    — 迁移描述，方便排查问题
//   up      — 升级函数，接收数据库实例，执行 SQL
//   down    — 降级函数（可选），用于回滚
export type Migration = {
  version: number;
  name: string;
  up: (db: DB) => void;
  down?: (db: DB) => void;
};

// ─── 导出 DB 类型供迁移文件使用 ───
export type { DB };

// ─── 迁移注册表 ───
//
// 所有迁移文件都在这里注册。
// 新迁移文件写完后，必须在这里 import 并添加到数组中。
// 系统会自动按版本号排序，从低到高依次执行。
//
// 重要：migration001 是当前的完整 DDL，
//       migration002 及以后是增量变更。
export const migrations: Migration[] = [];

// ─── 导入当前所有迁移文件 ───

// v1: 初始建表（完整 DDL）
import migration001 from './001_initial.js';
migrations.push(migration001);

// v2: 增量变更（审计日志 + 消息对话分组）
import migration002 from './002_add_audit.js';
migrations.push(migration002);
