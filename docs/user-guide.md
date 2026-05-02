# CodeEngine 用户指南

## 简介

CodeEngine 是一个全场景 AI 编码引擎，支持 C++、Python、JavaScript/TypeScript、Go、Rust、C#、CATIA 等多种语言和场景。它通过标准 I/O 与 AI 模型交互，支持本地离线运行。

## 安装

### 前置要求

- Node.js v22.0+
- pnpm (推荐 v9+)

### 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd codeengine

# 2. 安装依赖
pnpm install

# 3. 编译项目
npx tsc --build
```

## 配置

### 配置文件

配置文件位于 `~/.codeengine/config.toml`。首次使用时会自动生成默认配置。

```toml
[general]
log_level = "info"
log_to_file = true
log_dir = "~/.codeengine/logs"

[session]
auto_save = true
save_interval = 30000
max_messages = 10000

[providers.ollama]
id = "ollama"
type = "ollama"
name = "Ollama"
model = "qwen3.6-35b"
baseURL = "http://localhost:1234"
maxTokens = 8192
temperature = 0.7

[storage]
path = "~/.codeengine/data/codeengine.db"

[permission]
default = "ask"
always_allow = ["read_file", "glob", "list_dir"]
always_deny = ["sudo"]

[engine.compilers]
gpp = "g++"
gcc = "gcc"
python = "python3"
node = "node"
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CODEENGINE_LOG_LEVEL` | 日志级别 | `info` |
| `CODEENGINE_WORKSPACE` | 工作目录 | 当前目录 |

## 使用 CLI

### 基本命令

```bash
# 显示版本
codeengine --version

# 显示帮助
codeengine help

# 列出工具
codeengine tool list

# 列出引擎
codeengine engine list

# 列出会话
codeengine session list

# 创建快照
codeengine checkpoint create

# 显示技能
codeengine skill show <name>

# 配置读取
codeengine config get <key>
```

### 交互模式

```bash
# 启动对话
codeengine run
```

在交互模式中，你可以：
- 输入自然语言描述需求
- AI 会分析需求并执行相应操作
- 支持多轮对话，AI 会记住上下文

### 工作流示例

#### C++ 开发

```
> 创建一个 C++ hello world 程序
```

CodeEngine 会：
1. 创建 `hello.cpp` 文件
2. 使用 g++ 编译
3. 运行并展示输出

#### CATIA 二次开发

```
> 写一个 CATIA 宏来创建圆柱体
```

CodeEngine 会：
1. 生成 VBScript 宏代码
2. 保存到 `.catmacros` 目录
3. 提供在 CATIA 中运行的指导

#### Python 脚本

```
> 写一个 Python 脚本读取 CSV 文件并统计行数
```

CodeEngine 会：
1. 创建 Python 脚本
2. 提示安装依赖（pandas）
3. 运行脚本并展示结果

### 文件操作

CodeEngine 内置以下文件工具：

| 工具 | 说明 | 示例 |
|------|------|------|
| `read_file` | 读取文件 | 读取源代码 |
| `write_file` | 写入文件 | 创建新文件 |
| `edit_file` | 编辑文件 | 修改特定行 |
| `delete_file` | 删除文件 | 清理临时文件 |
| `list_dir` | 列出目录 | 浏览项目结构 |
| `search` | 搜索内容 | 全局搜索代码 |

### Shell 命令

CodeEngine 支持在白名单内的 Shell 命令：

**允许的命令**: `ls`, `cat`, `echo`, `grep`, `find`, `mkdir`, `touch`, `cp`, `mv`, `rm`, `git`, `npm`, `pnpm`, `node`, `python`, `g++`, `make`, `cargo`, `tsc`, `npx`, `tsx` 等

**被阻止的命令**: `rm -rf`, `shutdown`, `reboot`, `mkfs`, `chmod 777`, 危险脚本注入等

## 引擎

CodeEngine 支持以下语言引擎：

| 引擎 | 用途 | 命令 |
|------|------|------|
| C++ | 编译和运行 C++ 代码 | `g++` |
| Python | 运行 Python 脚本 | `python3` |
| JavaScript | 运行 JS 代码 | `node` |
| TypeScript | 编译 TS 代码 | `tsc` |
| Go | 编译运行 Go | `go build` |
| Rust | 编译运行 Rust | `cargo` |
| C# | 编译运行 C# | `dotnet` |
| PowerShell | Windows 脚本 | `pwsh` |
| CMake | C++ 构建管理 | `cmake` |
| CATIA | 工程脚本 | VBScript 解析 |

## 快照系统

```bash
# 创建快照
codeengine checkpoint create

# 列出快照
codeengine checkpoint list

# 恢复快照
codeengine checkpoint restore <snapshot-id>
```

## 常见问题

**Q: 连接不到 LLM 模型？**
A: 确保 Ollama 服务运行中，并且 `config.toml` 中的 `baseURL` 正确。

**Q: 编辑文件被阻止？**
A: CodeEngine 默认启用路径安全检查，确保文件写入在项目目录内。

**Q: 如何添加自定义引擎？**
A: 在 `packages/engine/src/` 下创建新模块并注册到 `registry.ts`。

**Q: 如何配置代理？**
A: 设置系统环境变量 `http_proxy` 和 `https_proxy`，或在配置文件中添加代理设置。
