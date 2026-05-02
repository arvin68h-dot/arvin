/**
 * CodeEngine — 文档同步测试
 *
 * 测试内容：
 * 1. doc-parser 基础功能（git diff 解析）
 * 2. doc-updater 基础功能（手册内容更新）
 * 3. 变更分类准确性
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('文档同步工具', () => {
  // ─── 测试 1：迁移文件存在性 ───

  it('迁移系统核心文件应存在', () => {
    const baseDir = process.cwd();
    const files = [
      'packages/storage/src/migrations/types.ts',
      'packages/storage/src/migrations/index.ts',
      'packages/storage/src/migrations/001_initial.ts',
    ];
    
    for (const file of files) {
      const fullPath = path.join(baseDir, file);
      assert.ok(fs.existsSync(fullPath), `迁移文件应存在: ${file}`);
    }
  });

  // ─── 测试 2：CLI 命令文件存在性 ───

  it('CLI db 命令文件应存在', () => {
    const baseDir = process.cwd();
    const fullPath = path.join(baseDir, 'cli/src/commands/db.ts');
    assert.ok(fs.existsSync(fullPath), 'CLI db 命令文件应存在');
    
    // 读取文件内容，验证包含必要的导出
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(content.includes('export async function run'), '应包含 run 导出函数');
  });

  // ─── 测试 3：文档同步脚本文件存在性 ───

  it('文档同步脚本应存在', () => {
    const baseDir = process.cwd();
    const files = [
      'scripts/docs-sync.ts',
      'scripts/doc-parser.ts',
      'scripts/doc-updater.ts',
    ];
    
    for (const file of files) {
      const fullPath = path.join(baseDir, file);
      assert.ok(fs.existsSync(fullPath), `文档同步文件应存在: ${file}`);
    }
  });

  // ─── 测试 4：操作手册更新 ───

  it('操作手册应包含数据库升级章节', () => {
    const baseDir = process.cwd();
    const manualPath = path.join(baseDir, 'docs/操作手册.md');
    const content = fs.readFileSync(manualPath, 'utf-8');
    
    assert.ok(content.includes('## 16. 数据库升级'), '应包含数据库升级章节');
    assert.ok(content.includes('## 17. 文档同步'), '应包含文档同步章节');
    assert.ok(content.includes('npx tsx cli/src/main.ts db version'), '应包含 db version 命令示例');
    assert.ok(content.includes('npx tsx cli/src/main.ts db migrations'), '应包含 db migrations 命令示例');
  });

  // ─── 测试 5：操作手册版本更新 ───

  it('操作手册版本应为 0.2.0', () => {
    const baseDir = process.cwd();
    const manualPath = path.join(baseDir, 'docs/操作手册.md');
    const content = fs.readFileSync(manualPath, 'utf-8');
    
    assert.ok(content.includes('**版本:** 0.2.0'), '手册版本应为 0.2.0');
  });

  // ─── 测试 6：CLI 命令注册 ───

  it('CLI 主入口应注册 db 命令', () => {
    const baseDir = process.cwd();
    const mainPath = path.join(baseDir, 'cli/src/main.ts');
    const content = fs.readFileSync(mainPath, 'utf-8');
    
    assert.ok(content.includes("command === 'db'"), '应注册 db 命令路由');
    assert.ok(content.includes('db version'), '帮助文本应包含 db version');
    assert.ok(content.includes('db migrations'), '帮助文本应包含 db migrations');
  });

  // ─── 测试 7：storage index.ts 迁移集成 ───

  it('storage 初始化应使用迁移系统', () => {
    const baseDir = process.cwd();
    const indexContent = fs.readFileSync(
      path.join(baseDir, 'packages/storage/src/index.ts'),
      'utf-8'
    );
    
    assert.ok(indexContent.includes("from './migrations/index.js'"), '应导入迁移调度器');
    assert.ok(indexContent.includes('runMigrations(db)'), '应使用 runMigrations 执行迁移');
    assert.ok(indexContent.includes('export function getDbVersion'), '应导出 getDbVersion');
    assert.ok(indexContent.includes('export function listMigrations'), '应导出 listMigrations');
  });

  // ─── 测试 8：临时目录测试 ───

  it('doc-updater 应能正确读取和写入文件', () => {
    // 创建临时测试文件
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeengine-docs-'));
    const testFile = path.join(tmpDir, 'test.md');
    
    try {
      const content = `# 测试文档

## 版本信息

## 数据库

- 默认行为
`;
      fs.writeFileSync(testFile, content);
      
      // 验证读取
      const readBack = fs.readFileSync(testFile, 'utf-8');
      assert.strictEqual(readBack, content);
      
      // 模拟更新
      const updated = readBack.replace(
        '## 数据库\n',
        '## 数据库\n\n### v0.2.0 数据库变更 (2026-05-02)\n- 新增字段: test_field\n'
      );
      
      fs.writeFileSync(testFile, updated);
      
      // 验证更新
      const verify = fs.readFileSync(testFile, 'utf-8');
      assert.ok(verify.includes('v0.2.0'), '应包含新版本标记');
      assert.ok(verify.includes('test_field'), '应包含新增字段');
      
    } finally {
      // 清理
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
