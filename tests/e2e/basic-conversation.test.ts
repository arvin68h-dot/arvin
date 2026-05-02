// basic-conversation.test.ts — 基本对话测试
// 测试：输入 → Mock LLM → 文本响应

import { describe, it, expect, beforeEach } from 'vitest';
import { MockOllamaProvider } from '../setup';

describe('Basic Conversation Flow', () => {
  let mockProvider: MockOllamaProvider;

  beforeEach(() => {
    mockProvider = new MockOllamaProvider();
  });

  it('should generate response for general question', async () => {
    const messages = [{ role: 'user', content: 'What is CodeEngine?' }];
    const response = await mockProvider.generate('', messages);

    expect(response).toBeDefined();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    expect(mockProvider.callLog.length).toBe(1);
  });

  it('should generate response for Python-related question', async () => {
    const messages = [{ role: 'user', content: 'Write a Python script to calculate fibonacci numbers' }];
    const response = await mockProvider.generate('Python', messages);

    expect(response).toBeDefined();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    expect(mockProvider.callLog.length).toBe(1);
  });

  it('should generate response for C++-related question', async () => {
    const messages = [{ role: 'user', content: 'Write a C++ hello world program' }];
    const response = await mockProvider.generate('C++', messages);

    expect(response).toBeDefined();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    expect(mockProvider.callLog.length).toBe(1);
  });

  it('should handle multi-turn conversation', async () => {
    const systemPrompt = 'You are a coding assistant';
    const messages = [
      { role: 'user', content: 'Write me a Go program' },
      { role: 'assistant', content: 'Here is the Go code...' },
      { role: 'user', content: 'Add error handling' },
    ];
    const response = await mockProvider.generate(systemPrompt, messages);

    expect(response).toBeDefined();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    expect(mockProvider.callLog.length).toBe(1);
  });

  it('should log all calls', async () => {
    await mockProvider.generate('Test', [{ role: 'user', content: 'Hello' }]);
    await mockProvider.generate('Test', [{ role: 'user', content: 'World' }]);

    expect(mockProvider.callLog.length).toBe(2);
    expect(mockProvider.callLog[0].messages.length).toBe(1);
    expect(mockProvider.callLog[1].messages.length).toBe(1);
  });

  it('should clear call log', async () => {
    await mockProvider.generate('Test', [{ role: 'user', content: 'Hello' }]);
    expect(mockProvider.callLog.length).toBe(1);

    mockProvider.clearCallLog();
    expect(mockProvider.callLog.length).toBe(0);
  });
});
