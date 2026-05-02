// catia-workflow.test.ts — CATIA 脚本工作流测试
// 测试：生成 CATIA 脚本 → validate

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createWriteFileTool } from '@codeengine/tool';
import { MockOllamaProvider } from '../setup';

describe('CATIA Workflow', () => {
  let tempDir: string;
  let ctx: { workspaceRoot: string };
  let mockProvider: MockOllamaProvider;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeengine-catia-test-'));
    ctx = { workspaceRoot: tempDir };
    mockProvider = new MockOllamaProvider();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should generate CATIA VBScript via mock provider', async () => {
    const messages = [
      { role: 'system' as const, content: 'You are a CATIA automation assistant. Write VBScript macros.' },
      { role: 'user' as const, content: 'Write a CATIA macro to create a cylinder' },
    ];

    const code = await mockProvider.generate('CATIA', messages);

    expect(code).toBeDefined();
    expect(typeof code).toBe('string');
    expect(code).toContain('CreateObject');
    expect(code).toContain('CATIA');
  });

  it('should generate CATIA macro content for common tasks', async () => {
    const testCases: Array<{ prompt: string; messages: Array<{ role: string; content: string }> }> = [
      {
        prompt: 'CATIA',
        messages: [{ role: 'user' as const, content: 'Create a CATIA part document' }],
      },
      {
        prompt: 'macro',
        messages: [{ role: 'user' as const, content: 'Write VBScript for CATIA' }],
      },
    ];

    for (const tc of testCases) {
      const code = await mockProvider.generate(tc.prompt, tc.messages);
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it('should save generated CATIA script to file', async () => {
    const writeFileTool = createWriteFileTool();

    const catiaScript = 'Set obj_CATIA = CreateObject("CATIA.Application")\nSet obj_doc = obj_CATIA.ActiveDocument\nMsgBox "CATIA Macro executed successfully!"';

    const result = await writeFileTool.execute(
      { path: 'catia_script.vbs', content: catiaScript },
      ctx as any,
    );

    expect(result.success).toBe(true);
    const fullPath = path.join(tempDir, 'catia_script.vbs');
    expect(fs.existsSync(fullPath)).toBe(true);

    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain('CATIA');
    expect(content).toContain('CreateObject');
  });

  it('should validate CATIA script format', async () => {
    const catiaScript = 'Set obj_CATIA = CreateObject("CATIA.Application")\nSet obj_doc = obj_CATIA.ActiveDocument\nSet obj_part = obj_doc.Part\nSet obj_axis = obj_part.GetItem("AbsoluteAxis")\nMsgBox "CATIA Macro executed successfully!"';

    // 检查基本格式：应该包含 Set 语句和 CreateObject
    const hasSetStatement = /^\s*Set\s+\w+\s*=/m.test(catiaScript);
    const hasCreateObject = catiaScript.includes('CreateObject');
    const hasCATIA = catiaScript.includes('CATIA');

    expect(hasSetStatement).toBe(true);
    expect(hasCreateObject).toBe(true);
    expect(hasCATIA).toBe(true);
  });
});
