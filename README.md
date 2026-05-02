# CodeEngine — 全场景 AI 编码引擎

> 对标 OpenCode / Cline / Roo Code 的 AI 编码 CLI 工具

## 简介

CodeEngine 是一款类 Claude Code 的全场景 AI 编码引擎，通过 ACP/JSON-RPC 协议被上层 Agent（如 CodeWorker）调用。

## 特性

- **多语言支持**：C++、Python、JavaScript/TypeScript、Go、Rust、C#、CMake、PowerShell、CATIA
- **25 个核心工具**：文件编辑、Shell 执行、Git 操作、代码搜索、LSP 诊断
- **Agent 友好**：ACP 协议通信，可被 CodeWorker 等上层 Agent 调用
- **离线可用**：核心功能本地运行，不依赖外部服务
- **模块化架构**：13 个独立包，清晰职责边界

## 技术栈

- **语言**：TypeScript
- **运行时**：Node.js 18+
- **包管理**：pnpm（monorepo）
- **测试**：Vitest
- **编译**：TypeScript

## 项目结构

```
codeengine/
├── packages/          # 核心包（11 个）
│   ├── core/          # Agent 内核、类型定义、配置
│   ├── tool/          # 工具注册表与执行
│   ├── engine/        # 语言引擎
│   ├── lsp/           # LSP Client
│   ├── diff/          # Diff & Patch
│   ├── storage/       # SQLite 存储
│   ├── compaction/    # 上下文压缩
│   ├── checkpoint/    # 代码检查点
│   ├── skill/         # Skill 系统
│   ├── mcp/           # MCP 集成
│   └── tasks/         # 任务管理
├── cli/               # CLI 入口
├── docs/              # 文档
└── tests/             # 测试
```

## 开发

```bash
# 安装依赖
pnpm install

# 编译
pnpm build

# 测试
pnpm test

# 开发模式（watch）
pnpm dev
```

## 状态

- **版本**：0.1.0（开发中）
- **阶段**：阶段 1/6 — 基础设施搭建
