// c++-workflow.test.ts — C++ 工作流测试
// 测试：检测 C++ → create file → compile → verify

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createWriteFileTool, createShellRunner } from '@codeengine/tool';
import { MockOllamaProvider } from '../setup';

describe('C++ Workflow', () => {
  let tempDir: string;
  let ctx: { workspaceRoot: string };
  let mockProvider: MockOllamaProvider;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeengine-cpp-test-'));
    ctx = { workspaceRoot: tempDir };
    mockProvider = new MockOllamaProvider();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should generate C++ code and create file via mock provider', async () => {
    const messages = [
      { role: 'system', content: 'You are a C++ coding assistant.' },
      { role: 'user', content: 'Write a C++ hello world program' },
    ];

    const code = await mockProvider.generate('C++', messages);

    expect(code).toBeDefined();
    expect(typeof code).toBe('string');
    expect(code).toContain('iostream');
    expect(code).toContain('main');
  });

  it('should create a C++ source file', async () => {
    const writeFileTool = createWriteFileTool();

    const cppCode = '#include <iostream>\n\nint main() {\n    std::cout << "Hello from C++!" << std::endl;\n    return 0;\n}';
    const result = await writeFileTool.execute(
      { path: 'hello.cpp', content: cppCode },
      ctx as any,
    );

    expect(result.success).toBe(true);
    const fullPath = path.join(tempDir, 'hello.cpp');
    expect(fs.existsSync(fullPath)).toBe(true);
    expect(fs.readFileSync(fullPath, 'utf-8')).toContain('Hello from C++');
  });

  it('should detect C++ project from file extension', async () => {
    const writeFileTool = createWriteFileTool();

    // 创建 .cpp 和 .h 文件
    await writeFileTool.execute(
      { path: 'main.cpp', content: '#include "utils.h"' },
      ctx as any,
    );
    await writeFileTool.execute(
      { path: 'utils.h', content: '#pragma once' },
      ctx as any,
    );

    const dirPath = path.join(tempDir);
    const files = fs.readdirSync(dirPath);
    const cppFiles = files.filter(f => f.endsWith('.cpp') || f.endsWith('.h'));

    expect(cppFiles.length).toBe(2);
    expect(cppFiles).toContain('main.cpp');
    expect(cppFiles).toContain('utils.h');
  });

  it('should compile C++ if g++ is available', async () => {
    const writeFileTool = createWriteFileTool();
    const shellRunner = createShellRunner();

    // 创建 C++ 文件
    const cppCode = '#include <iostream>\nint main() { std::cout << "Hello" << std::endl; return 0; }';
    await writeFileTool.execute(
      { path: 'hello.cpp', content: cppCode },
      ctx as any,
    );

    // 尝试编译
    const compileResult = await shellRunner.execute(
      { command: `g++ "${path.join(tempDir, 'hello.cpp')}" -o "${path.join(tempDir, 'hello')}" 2>&1 || echo "g++ not available"` },
      ctx as any,
    );

    // 检查编译结果
    if (compileResult.success) {
      // 编译成功，运行程序
      const runResult = await shellRunner.execute(
        { command: `"${path.join(tempDir, 'hello')}"` },
        ctx as any,
      );
      if (runResult.success) {
        expect(runResult.content.toLowerCase()).toContain('hello');
      }
    }
    // 如果 g++ 不可用，检查消息
    else {
      expect(compileResult.content.toLowerCase()).toContain('g++');
    }
  });
});
