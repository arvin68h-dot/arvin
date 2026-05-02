// CodeEngine Prompt Builder — Prompt 构建器
// 根据会话上下文动态构建模型输入 Prompt

import { type AgentMessage, type ToolDefinition, UserRole } from '@codeengine/core';
import type { SessionMessage, ContextWindow, AssistantMessage, ToolResultMessage } from './session.js';

interface PromptTemplate {
  system: string;
  userPrefix?: string;
  assistantPrefix?: string;
  toolPrefix?: string;
  separator?: string;
}

const DEFAULT_TEMPLATE: PromptTemplate = {
  system: '{system_prompt}',
  userPrefix: 'User: ',
  assistantPrefix: 'Assistant: ',
  toolPrefix: '[Tool Result] {tool_use_id}: ',
  separator: '\n',
};

export interface BuildOptions {
  template?: Partial<PromptTemplate>;
  includeToolDefs?: boolean;
  maxHistoryMessages?: number;
}

export class PromptBuilder {
  private readonly template: PromptTemplate;
  constructor(template?: PromptTemplate) { this.template = { ...DEFAULT_TEMPLATE, ...template }; }

  buildSystemPrompt(systemPrompt: string): string {
    return this.template.system.replace('{system_prompt}', systemPrompt);
  }

  buildInput(messages: SessionMessage[], toolDefs: ToolDefinition[] = [], options?: BuildOptions): string {
    const parts: string[] = [];
    const max = options?.maxHistoryMessages ?? 50;
    const history = messages.slice(-max);

    for (const msg of history) {
      const role = msg.role;
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (role === UserRole.USER) {
        parts.push((this.template.userPrefix || 'User: ') + content);
      } else if (role === UserRole.ASSISTANT) {
        parts.push(this.formatAssistantMessage(msg as AssistantMessage));
      } else if (role === UserRole.TOOL) {
        parts.push(this.formatToolResult(msg as ToolResultMessage));
      } else if (role === UserRole.DEV) {
        const dev = msg as { content: string; level: string };
        parts.push(`[Dev ${dev.level.toUpperCase()}] ${dev.content}`);
      }
    }

    if (options?.includeToolDefs && toolDefs.length > 0) {
      parts.unshift('[AVAILABLE TOOLS]');
      parts.push(toolDefs.map(t => `${t.name}: ${t.description}`).join('\n'));
      parts.push('[/AVAILABLE TOOLS]\n');
    }

    return parts.join(this.template.separator || '\n');
  }

  buildStructuredMessages(messages: SessionMessage[], toolDefs: ToolDefinition[], options?: BuildOptions): AgentMessage[] {
    const max = options?.maxHistoryMessages ?? 50;
    const history = messages.slice(-max);
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.role !== UserRole.USER) return [];

    const structured: AgentMessage[] = [];

    if (options?.includeToolDefs && toolDefs.length > 0) {
      structured.push({
        id: 'sys-tools', role: UserRole.SYSTEM,
        content: `Available tools:\n${toolDefs.map(t => `- ${t.name}: ${t.description}`).join('\n')}`,
        timestamp: Date.now(),
      });
    }

    for (const msg of history.slice(0, -1)) structured.push(this.toAgentMessage(msg));
    structured.push(this.toAgentMessage(lastMsg));
    return structured;
  }

  private formatAssistantMessage(msg: AssistantMessage): string {
    let text = this.formatContent(msg.content);
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        text += `\n[Tool Call: ${tc.name} (${tc.id}) Input: ${JSON.stringify(tc.input || {})}]`;
      }
    }
    return (this.template.assistantPrefix || 'Assistant: ') + text;
  }

  private formatToolResult(msg: ToolResultMessage): string {
    if (typeof msg.content === 'string') {
      return (this.template.toolPrefix || '').replace('{tool_use_id}', msg.tool_use_id) + msg.content;
    }
    if (Array.isArray(msg.content)) {
      return msg.content.map(block => {
        if (typeof block === 'object' && block !== null && 'error' in block) {
          const b = block as { type?: string; content?: string; error?: string };
          if (b.error) return `[Error] ${b.error}`;
          return b.content || '';
        }
        return String(block);
      }).join('\n');
    }
    return String(msg.content);
  }

  private formatContent(content: string | unknown[]): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(block => {
        if (typeof block === 'string') return block;
        if (typeof block === 'object' && block !== null) {
          const b = block as { type?: string; text?: string; content?: string };
          if (b.type === 'text' && b.text) return b.text;
          if (b.content) return String(b.content);
        }
        return String(block);
      }).join('');
    }
    return String(content);
  }

  private toAgentMessage(msg: SessionMessage): AgentMessage {
    return { id: msg.id, role: msg.role, content: this.formatContent(msg.content), timestamp: msg.timestamp };
  }
}

let _builder: PromptBuilder | null = null;
export function getPromptBuilder(): PromptBuilder {
  if (!_builder) _builder = new PromptBuilder();
  return _builder;
}
