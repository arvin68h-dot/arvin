# Code Review Report
**生成时间**: 2026-05-02
**审查范围**: Storage 包 + CI/CD 工作流
**审查者**: Hermes Agent (自动)

---

## 1. Storage 包 (packages/storage/src/index.ts)

### ✅ 优点
| 项目 | 说明 |
|------|------|
| **架构清晰** | 6 个 Store 类按实体分离 (Session/Message/Skill/Task/Checkpoint/Conversation) |
| **WAL 模式** | 启用 Write-Ahead Logging 提升并发性能 |
| **256MB 内存映射** | 大型数据集查询性能优化 |
| **事务批量操作** | batchInsert 使用 `db.transaction()` 批量写入 |
| **外键约束** | messages/checkpoints 对 sessions 有 `ON DELETE CASCADE` |
| **数据库索引** | 5 个索引覆盖高频查询路径 |
| **Schema 版本管理** | `schema_migrations` 表支持未来迁移 |
| **数据脱敏** | `sanitizeForExport()` 覆盖 API key/token/密码/邮箱 |
| **单例导出** | 模块级 `sessionStore` 等单例避免重复创建 |

### ⚠️ 风险 & 改进建议

#### [中] SQL 动态拼接
```typescript
// 位置: 第 254, 436, 518, 675 行
this.db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = @id`).run(params);
```
- **风险**: 字段名来自参数键名，目前只使用已知的白名单字段，无注入风险
- **建议**: 添加字段名白名单校验，或在注释中明确维护字段列表
- **当前状态**: ✅ 安全（硬编码字段，无用户输入）

#### [低] 无错误处理
```typescript
// 所有 db.prepare().run() 无 try-catch
```
- **风险**: SQLite 错误（锁超时、磁盘满、外键冲突）会导致进程崩溃
- **建议**: 添加 `try-catch` 包装关键操作，或至少 `getSessionCount` 这类方法
- **优先级**: 低（CLI 场景出错即终止可接受）

#### [低] closeDb 无调用点
- **问题**: `closeDb()` 函数已定义但无任何调用点
- **建议**: 在优雅退出时调用（如 `process.on('SIGTERM')`），或移除

#### [低] 缺少 Conversation 表
- **问题**: ConversationStore 使用 `conversations` 表，但 DDL 中未创建此表
- **影响**: 调用 `conversationStore.get()` 会因表不存在而失败
- **建议**: 在 SCHEMA_SQL 中添加 conversations 表定义

---

## 2. CI/CD 工作流

### ✅ 优点
| 项目 | 说明 |
|------|------|
| **CI 完整流程** | checkout → setup-node → pnpm install → lint → build → test |
| **Frozen lockfile** | 使用 `--frozen-lockfile` 保证依赖锁定 |
| **PR 快速检查** | 仅 build + typecheck，不跑测试，速度快 |
| **自动评论** | PR 检查通过后自动留言通知 |
| **Release 流程** | tag 触发 → build → npm publish → GitHub Release |
| **Dependabot** | npm + github-actions 双系统自动更新 |
| **国内镜像** | `.npmrc` + CI 中的 `registry.npmmirror.com` |

### ⚠️ 改进建议

#### [中] Release 使用 npmjs.org
- **问题**: `release.yml` 使用 `registry-url: 'https://registry.npmjs.org'`
- **建议**: 如需国内加速，可使用 `https://registry.npmmirror.com` + 环境变量代理

#### [低] PR 检查缺少测试
- **问题**: `pr-check.yml` 不运行 `pnpm test`
- **理由**: 合理设计（PR 只检查编译，合并后 CI 跑测试）
- **但**: 如果测试很快，建议加上

---

## 3. 总体评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **代码质量** | ⭐⭐⭐⭐☆ | 结构优秀，小问题不影响 |
| **类型安全** | ⭐⭐⭐⭐☆ | 完整类型支持，storage 类型安全 |
| **安全性** | ⭐⭐⭐⭐⭐ | SQL 安全（白名单字段），数据脱敏 |
| **CI/CD** | ⭐⭐⭐⭐⭐ | 完整的工作流，依赖管理到位 |
| **可维护性** | ⭐⭐⭐⭐☆ | 模块清晰，命名规范 |

**综合评分: 4.2 / 5.0**
