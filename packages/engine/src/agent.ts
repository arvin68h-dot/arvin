// CodeEngine Agent Core Loop
import { type AgentMessage, type ToolDefinition, type RuntimeContext, type ProviderResponse, UserRole, LogLevel, createLogger, type Logger } from '@codeengine/core';
import type { SessionManager, SessionConfig, SessionMessage } from './session.js';
import type { ProviderRouter } from './provider.js';
import type { PromptBuilder } from './prompt.js';
import type { ToolRegistry } from '@codeengine/tool';
import { v4 as uuidv4 } from 'uuid';

export interface AgentConfig {
  sessionId?: string; maxTurns?: number; temperature?: number; maxTokens?: number; contextWindow?: number; providerId?: string;
}
export interface AgentResponse {
  message: string; toolCalls?: { toolName: string; input: Record<string, unknown> }[]; turnCount: number; tokenUsage?: { prompt: number; completion: number; total: number };
}

export class AgentLoop {
  private readonly sessionManager: SessionManager;
  private readonly providerRouter: ProviderRouter;
  private readonly promptBuilder: PromptBuilder;
  private readonly toolRegistry: ToolRegistry;
  private readonly logger: Logger;
  private readonly config: Required<AgentConfig>;
  private currentSessionId: string;

  constructor(sessionManager: SessionManager, providerRouter: ProviderRouter, promptBuilder: PromptBuilder, toolRegistry: ToolRegistry, config?: AgentConfig) {
    this.sessionManager = sessionManager;
    this.providerRouter = providerRouter;
    this.promptBuilder = promptBuilder;
    this.toolRegistry = toolRegistry;
    this.config = { sessionId: config?.sessionId || '', maxTurns: config?.maxTurns ?? 10, temperature: config?.temperature ?? 0.7, maxTokens: config?.maxTokens ?? 4096, contextWindow: config?.contextWindow ?? 100, providerId: config?.providerId || '' };
    this.logger = createLogger({ name: 'agent-loop', level: LogLevel.INFO });
    this.currentSessionId = '';
  }

  async run(input: string, ctx?: RuntimeContext): Promise<AgentResponse> {
    if (!this.currentSessionId) {
      const session = this.sessionManager.createSession();
      this.currentSessionId = session.id;
    }
    const session = this.sessionManager.getSession(this.currentSessionId);
    if (!session) throw new Error(`Session not found: ${this.currentSessionId}`);

    this.logger.info(`Agent run: ${input.slice(0, 100)}...`);

    const userMsg: SessionMessage = { id: uuidv4(), role: UserRole.USER, content: input, timestamp: Date.now() };
    this.sessionManager.addMessage(this.currentSessionId, userMsg);

    let turnCount = 0;
    let lastContent = '';
    let lastResponse: ProviderResponse | null = null;

    while (turnCount < this.config.maxTurns) {
      turnCount++;
      const contextWindow = this.sessionManager.getContextWindow(this.currentSessionId, this.config.contextWindow);
      const tools = this.toolRegistry.listTools();
      const messages = this.promptBuilder.buildStructuredMessages(contextWindow.messages, tools, { includeToolDefs: true, maxHistoryMessages: 30 });

      if (messages.length === 0) { this.logger.warn('No messages to send'); break; }

      const options = { providerId: this.config.providerId, temperature: this.config.temperature, maxTokens: this.config.maxTokens };
      const response = await this.providerRouter.chat(messages, tools, options);
      lastResponse = response;

      const contentText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      const assistantMsg: SessionMessage = {
        id: uuidv4(), role: UserRole.ASSISTANT, content: contentText, timestamp: Date.now(),
        tool_calls: response.toolCalls?.map(tc => ({ id: tc.id, name: tc.name, input: tc.input })),
      };
      this.sessionManager.addMessage(this.currentSessionId, assistantMsg);
      lastContent = contentText;

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const tc of response.toolCalls) {
          const result = await this.toolRegistry.execute(tc.name, tc.input || {}, ctx!);
          const toolMsg: SessionMessage = { id: uuidv4(), role: UserRole.TOOL, content: result.content, tool_use_id: tc.id, timestamp: Date.now() };
          this.sessionManager.addMessage(this.currentSessionId, toolMsg);
        }
        if (turnCount >= this.config.maxTurns) break;
        continue;
      }
      break;
    }

    return {
      message: lastContent, toolCalls: undefined, turnCount,
      tokenUsage: lastResponse?.usage ? { prompt: lastResponse.usage.promptTokens, completion: lastResponse.usage.completionTokens, total: lastResponse.usage.totalTokens } : undefined,
    };
  }

  getSession(): SessionMessage[] { return this.sessionManager.getMessages(this.currentSessionId); }
  switchSession(sessionId: string): void { this.currentSessionId = sessionId; this.logger.info(`Switched to session: ${sessionId}`); }
  createNewSession(config?: SessionConfig): void { const session = this.sessionManager.createSession(config); this.currentSessionId = session.id; this.logger.info(`New session created: ${session.id}`); }
}

export function createAgentLoop(sm: SessionManager, pr: ProviderRouter, pb: PromptBuilder, tr: ToolRegistry, config?: AgentConfig): AgentLoop {
  return new AgentLoop(sm, pr, pb, tr, config);
}
