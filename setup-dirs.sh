#!/bin/bash
set -e
cd /Users/wangarvin/Downloads/编码软件/codeengine
rm -rf packages/cli docs tests scripts 2>/dev/null || true

# Create all directories
mkdir -p packages/core/src
mkdir -p packages/tool/src/file
mkdir -p packages/tool/src/code
mkdir -p packages/tool/src/shell
mkdir -p packages/tool/src/analysis
mkdir -p packages/tool/src/version
mkdir -p packages/tool/src/build
mkdir -p packages/tool/src/engine
mkdir -p packages/tool/src/system
mkdir -p packages/engine/src/base
mkdir -p packages/engine/src/cpp
mkdir -p packages/engine/src/python
mkdir -p packages/engine/src/js
mkdir -p packages/engine/src/ts
mkdir -p packages/engine/src/go
mkdir -p packages/engine/src/cs
mkdir -p packages/engine/src/rust
mkdir -p packages/engine/src/cmake
mkdir -p packages/engine/src/ps
mkdir -p packages/engine/src/catia
mkdir -p packages/lsp/src
mkdir -p packages/diff/src/strategies
mkdir -p packages/storage/src
mkdir -p packages/compaction/src
mkdir -p packages/checkpoint/src
mkdir -p packages/skill/src/templates/default
mkdir -p packages/skill/src/templates/code-review
mkdir -p packages/skill/src/templates/catia-dev
mkdir -p packages/skill/src/templates/cpp-dev
mkdir -p packages/mcp/src
mkdir -p packages/tasks/src
mkdir -p cli/src/commands
mkdir -p cli/src/tui
mkdir -p docs
mkdir -p tests/e2e
mkdir -p scripts

echo "All directories created successfully"
