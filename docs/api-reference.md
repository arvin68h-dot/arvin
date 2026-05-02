# CodeEngine ACP 协议参考

## 概述

CodeEngine 通过 ACP (Agent Communication Protocol) 标准 I/O 实现与外部宿主（如 CodeWorker）的通信。协议基于 JSON-RPC 2.0 规范。

## 通信方式

- **输入**: 标准输入 (stdin)，每行一个 JSON 对象
- **输出**: 标准输出 (stdout)，每行一个 JSON 对象
- **编码**: UTF-8
- **格式**: NDJSON (Newline Delimited JSON)

## 消息类型

### 请求格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "task/execute",
  "params": {
    "task": "Write a Python fibonacci function",
    "workspace": "/path/to/project"
  }
}
```

### 响应格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "taskId": "task-abc123",
    "status": "completed",
    "output": "File created: fibonacci.py"
  }
}
```

### 错误格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Task execution failed"
  }
}
```

## 支持的 Method

### task/execute

执行编码任务。

**参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| task | string | 任务描述 |
| workspace | string | 工作目录 |
| messages | array | 对话历史 |

**响应:**
| 字段 | 类型 | 说明 |
|------|------|------|
| taskId | string | 任务 ID |
| status | string | 状态：pending/running/completed/cancelled |
| steps | array | 执行步骤 |
| output | string | 输出内容 |

### task/cancel

取消当前任务。

**参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| taskId | string | 要取消的任务 ID |

**响应:**
| 字段 | 类型 | 说明 |
|------|------|------|
| taskId | string | 被取消的任务 ID |
| status | string | cancelled |

### tool/list

列出所有可用工具。

**参数:** 无

**响应:**
```json
[
  {
    "name": "read_file",
    "description": "Read file content",
    "category": "file",
    "version": "0.1.0",
    "requiresApproval": false
  }
]
```

### engine/list

列出所有语言引擎。

**参数:** 无

**响应:**
```json
[
  { "id": "cpp", "name": "C++", "status": "active" },
  { "id": "python", "name": "Python", "status": "active" }
]
```

### session/new

创建新会话。

**参数:** 无

**响应:**
| 字段 | 类型 | 说明 |
|------|------|------|
| sessionId | string | 会话 ID |
| created | string | 创建时间 (ISO 8601) |

### session/history

获取会话历史。

**参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | string | 会话 ID |
| limit | number | 返回条数限制 |

**响应:**
```json
[
  { "role": "user", "content": "Hello", "timestamp": 1234567890 }
]
```

## JSON-RPC 错误码

| 错误码 | 说明 |
|--------|------|
| -32700 | Parse error (JSON 解析错误) |
| -32600 | Invalid Request (无效请求) |
| -32601 | Method Not Found (方法不存在) |
| -32602 | Invalid Params (参数无效) |
| -32603 | Internal Error (内部错误) |

## 使用示例

### curl 调用

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"engine/list","params":{}}' | npx tsx cli/src/acp-host.ts
```

### CodeWorker 集成

```bash
# 启动 CodeEngine 插件模式
./scripts/codeworker-integration.sh
```
