#!/bin/bash
# CodeEngine CodeWorker Integration Launcher
# 通过 ACP 协议启动 CodeEngine 作为 CodeWorker 插件
#
# 用法:
#   ./codeworker-integration.sh          # 标准 ACP 模式
#   ./codeworker-integration.sh --help   # 显示帮助
#   ./codeworker-integration.sh --verbose # 详细日志模式
#
# CodeWorker 通过标准输入/输出发送 JSON-RPC 指令，
# CodeEngine 处理这些指令并返回执行结果。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 日志级别
LOG_LEVEL="${CODEENGINE_LOG_LEVEL:-info}"
VERBOSE=0

if [[ "${1:-}" == "--verbose" || "${1:-}" == "-v" ]]; then
    LOG_LEVEL="debug"
    VERBOSE=1
    shift
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "CodeEngine CodeWorker Integration Launcher"
    echo ""
    echo "Usage:"
    echo "  $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --verbose, -v    Enable debug logging"
    echo "  --help, -h       Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  CODEENGINE_LOG_LEVEL  Log level (default: info)"
    echo "  CODEENGINE_WORKSPACE  Working directory"
    exit 0
fi

# 切换到项目根目录
cd "$PROJECT_ROOT"

echo "Starting CodeEngine CodeWorker integration..."
echo "Project: $PROJECT_ROOT"
echo "Log level: $LOG_LEVEL"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not found."
    echo "Install Node.js v22+ from https://nodejs.org/"
    exit 1
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is required but not found."
    echo "Install pnpm: npm install -g pnpm"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install --frozen-lockfile
fi

# 检查编译状态
if [ ! -d "cli/dist" ]; then
    echo "Building project..."
    npx tsc --build
fi

# 启动 CodeEngine
if [[ $VERBOSE -eq 1 ]]; then
    echo "Running: npx tsx cli/src/main.ts --codeworker"
fi

exec npx tsx cli/src/main.ts --codeworker
