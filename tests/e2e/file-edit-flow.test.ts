// file-edit-flow.test.ts — 文件编辑流程测试
// 测试：Read file → edit → write → verify

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createWriteFileTool, validateWritePath, createReadFileTool } from '@codeengine/tool';

describe('File Edit Flow', () => {
  let tempDir: string;
  let ctx: { workspaceRoot: string };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeengine-test-'));
    ctx = { workspaceRoot: tempDir };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should write a file and read it back', async () => {
    const writeFileTool = createWriteFileTool();
    const readFileTool = createReadFileTool();

    const content = 'Hello, CodeEngine!';
    const filePath = 'test/hello.txt';

    const writeResult = await writeFileTool.execute({ path: filePath, content }, ctx as any);
    expect(writeResult.success).toBe(true);

    const readResult = await readFileTool.execute({ path: filePath }, ctx as any);
    expect(readResult.success).toBe(true);
    expect(readResult.content).toContain(content);
  });

  it('should create parent directories', async () => {
    const writeFileTool = createWriteFileTool();

    const content = 'Nested file content';
    const filePath = 'deep/nested/dir/file.txt';

    const result = await writeFileTool.execute({ path: filePath, content }, ctx as any);
    expect(result.success).toBe(true);

    const fullPath = path.join(tempDir, filePath);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it('should backup existing file', async () => {
    const writeFileTool = createWriteFileTool();

    const filePath = 'existing.txt';
    const originalContent = 'Original content';

    await writeFileTool.execute({ path: filePath, content: originalContent }, ctx as any);

    const newContent = 'Updated content';
    const result = await writeFileTool.execute({ path: filePath, content: newContent }, ctx as any);
    expect(result.success).toBe(true);

    const bakPath = path.join(tempDir, filePath + '.bak');
    expect(fs.existsSync(bakPath)).toBe(true);

    const bakContent = fs.readFileSync(bakPath, 'utf-8');
    expect(bakContent).toBe(originalContent);

    const currentContent = fs.readFileSync(path.join(tempDir, filePath), 'utf-8');
    expect(currentContent).toBe(newContent);
  });

  it('should handle edit_flow: read → modify → write', async () => {
    const writeFileTool = createWriteFileTool();
    const readFileTool = createReadFileTool();

    const initPath = 'edit_flow.txt';
    const initContent = 'Line 1\nLine 2\nLine 3\n';
    await writeFileTool.execute({ path: initPath, content: initContent }, ctx as any);

    const readResult = await readFileTool.execute({ path: initPath }, ctx as any);
    expect(readResult.success).toBe(true);

    const modifiedContent = 'Line 1\nLine 2 (modified)\nLine 3\nLine 4\n';
    const writeResult = await writeFileTool.execute({ path: initPath, content: modifiedContent }, ctx as any);
    expect(writeResult.success).toBe(true);

    const verifyResult = await readFileTool.execute({ path: initPath }, ctx as any);
    expect(verifyResult.content).toContain('Line 2 (modified)');
    expect(verifyResult.content).toContain('Line 4');
  });

  it('should validate write path is within workspace', async () => {
    const result = validateWritePath(tempDir + '/safe/file.txt', tempDir);
    expect(result.safe).toBe(true);
  });

  it('should reject write path outside workspace', async () => {
    const result = validateWritePath('/etc/passwd', tempDir);
    expect(result.safe).toBe(false);
  });

  it('should reject write path with path traversal', async () => {
    const result = validateWritePath(path.join(tempDir, '../etc/passwd'), tempDir);
    expect(result.safe).toBe(false);
  });
});
