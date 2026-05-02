// E2E Test Setup — Mock Provider
// 模拟 LLM Provider，返回预设响应，用于端到端测试

import type {
  AgentMessage,
  ProviderResponse,
  ToolDefinition,
  UserRole,
} from '../packages/core/src/types/index.js';

// 宽松的消息类型（测试用）
interface TestMessage {
  role: string;
  content: string;
}

function uuidv4(): string {
  return crypto.randomUUID();
}

/**
 * 角色辅助常量
 */
const ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
  SYSTEM: 'system',
  THINKING: 'thinking',
  DEV: 'dev',
} as const;

/**
 * ProviderType 辅助常量
 */
const PROVIDER = {
  OLLAMA: 'ollama',
} as const;

/**
 * 将宽松消息转为 AgentMessage（测试用）
 */
function toAgentMsg(m: TestMessage): AgentMessage {
  return {
    id: uuidv4(),
    role: (m.role as UserRole) || 'user',
    content: m.content,
    timestamp: Date.now(),
  };
}

/**
 * 模拟响应内容生成
 */
function generateMockResponse(systemPrompt: string, messages: TestMessage[]): string {
  const lastUserMessage = [...messages].reverse().find(m => m.role === ROLE.USER);
  const userText = lastUserMessage
    ? (typeof lastUserMessage.content === 'string' ? lastUserMessage.content : JSON.stringify(lastUserMessage.content))
    : '';

  if (systemPrompt.includes('Python') || userText.includes('python')) {
    return 'import time\n\ndef main():\n    print("Hello from Python!")\n\nif __name__ == "__main__":\n    main()';
  }

  if (systemPrompt.includes('C++') || userText.includes('C++') || userText.includes('cpp')) {
    return '#include <iostream>\n\nint main() {\n    std::cout << "Hello from C++!" << std::endl;\n    return 0;\n}';
  }

  if (systemPrompt.includes('CATIA') || userText.includes('macro') || userText.includes('VBScript')) {
    return 'Set obj_CATIA = CreateObject("CATIA.Application")\nSet obj_doc = obj_CATIA.ActiveDocument\nSet obj_part = obj_doc.Part\nSet obj_hss = obj_part.HybridShapeFactory\nSet obj_axis = obj_part.GetItem("AbsoluteAxis")\nMsgBox "CATIA Macro executed successfully!"';
  }

  if (systemPrompt.includes('Go') || userText.includes('go ')) {
    return 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n}';
  }

  if (systemPrompt.includes('Rust') || userText.includes('rustc')) {
    return 'fn main() {\n    println!("Hello from Rust!");\n}';
  }

  if (userText.includes('read_file') || userText.includes('write_file') || userText.includes('edit_file')) {
    return 'Here is the file content after editing:\n\n// File edited successfully\nconst greeting = `Hello from CodeEngine!`;\nconsole.log(greeting);';
  }

  if (userText.includes('compile') || userText.includes('build') || userText.includes('make')) {
    return 'Build completed successfully. No errors found.';
  }

  return 'Standard response for testing. All operations completed successfully.';
}

/**
 * Mock Ollama Provider — 模拟 Ollama LLM 响应
 * 根据系统提示和用户消息返回预设的测试响应
 */
export class MockOllamaProvider {
  /** 调用日志 */
  private _callLog: Array<{ messages: TestMessage[]; response: string }> = [];

  /** 获取调用日志 */
  get callLog(): typeof this._callLog {
    return this._callLog;
  }

  /** 清空调用日志 */
  clearCallLog(): void {
    this._callLog = [];
  }

  /**
   * 生成模拟的 LLM 响应
   * @param systemPrompt - 系统提示
   * @param messages - 对话消息（宽松类型）
   * @returns 模拟的 LLM 响应字符串
   */
  async generate(systemPrompt: string, messages: TestMessage[]): Promise<string> {
    const content = generateMockResponse(systemPrompt, messages);
    this._callLog.push({ messages, response: content });
    return content;
  }
}

/**
 * 模拟的 ProviderAdapter 实现
 */
export class MockProviderAdapter {
  private mock: MockOllamaProvider;
  private config: Record<string, unknown>;

  constructor(mock: MockOllamaProvider, config?: Record<string, unknown>) {
    this.mock = mock;
    this.config = config || {
      id: 'mock',
      type: PROVIDER.OLLAMA,
      name: 'Mock Provider',
      model: 'mock-model',
      baseURL: 'http://localhost:11434',
      maxTokens: 4096,
      temperature: 0.7,
    };
  }

  /** 生成模拟响应并包装为 ProviderResponse */
  async chat(
    messages: TestMessage[],
    _tools?: ToolDefinition[],
    _options?: Record<string, unknown>,
  ): Promise<ProviderResponse> {
    const agentMessages = messages.map(toAgentMsg);
    const systemMsg = agentMessages.find(m => m.role === ROLE.SYSTEM);
    const systemPrompt = systemMsg
      ? (typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content))
      : '';
    const content = await this.mock.generate(systemPrompt, messages);

    return {
      id: uuidv4(),
      model: 'mock-model',
      content,
      stopReason: 'end_turn' as const,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  get type(): string {
    return PROVIDER.OLLAMA;
  }

  get configData(): Record<string, unknown> {
    return this.config;
  }

  async initialize(): Promise<void> {
    // No-op for mock
  }

  destroy(): void {
    // No-op for mock
  }
}
