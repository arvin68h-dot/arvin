// CodeEngine Provider Manager — 模型服务管理
// 统一管理 LLM Provider、模型路由、API 调用
// 性能优化：集成请求级 LRU 缓存，避免重复调用

import {
  type ProviderConfig,
  type ProviderResponse,
  type AgentMessage,
  type ToolDefinition,
  type LogLevel,
  ProviderType,
  UserRole,
  LogLevel as Level,
  createLogger,
  createProviderConfig,
  RequestCache,
} from '@codeengine/core';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as http from 'http';

// ─── 适配器接口 ───

interface ProviderAdapter {
  readonly type: ProviderType;
  readonly config: ProviderConfig;
  initialize(): Promise<void>;
  chat(messages: AgentMessage[], tools?: ToolDefinition[], options?: Record<string, unknown>): Promise<ProviderResponse>;
  destroy(): void;
}

// ─── Ollama Adapter ───

class OllamaAdapter implements ProviderAdapter {
  readonly type: ProviderType = ProviderType.OLLAMA;
  readonly config: ProviderConfig;
  private readonly baseUrl: string;
  private model: string;
  // 缓存：100 条，TTL 5 分钟
  private cache: RequestCache;

  constructor(config: ProviderConfig) {
    this.config = config;
    const url = config.baseURL || 'http://localhost:11434';
    this.baseUrl = url.replace(/\/+$/, '');
    this.model = config.model || 'qwen2.5';
    this.cache = new RequestCache(100, 300000);
  }

  get _model(): string { return this.model; }

  /** 检查是否需要调用 LLM，还是可以直接从缓存获取 */
  private shouldCachePrompt(messages: AgentMessage[]): boolean {
    // 对 USER/ASSISTANT 消息进行缓存，排除纯工具结果
    const relevantMessages = messages.filter(
      m => m.role === UserRole.USER || m.role === UserRole.ASSISTANT
    );
    return relevantMessages.length > 0;
  }

  async initialize(): Promise<void> {
    try {
      const res = await this.httpFetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) throw new Error('Ollama server not reachable');
    } catch (err) {
      throw new Error(`Failed to connect to Ollama at ${this.baseUrl}: ${(err as Error).message}`);
    }
  }

  async chat(
    messages: AgentMessage[],
    _tools?: ToolDefinition[],
    options?: Record<string, unknown>,
  ): Promise<ProviderResponse> {
    // 尝试从缓存获取结果
    if (this.shouldCachePrompt(messages)) {
      // 构建缓存键：系统提示 + 消息内容
      const systemMsg = messages.find(m => m.role === UserRole.SYSTEM);
      const systemPrompt = systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content)) : '';
      const msgContent = messages
        .filter(m => m.role !== UserRole.SYSTEM)
        .map(m => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
        .join('\n---\n');
      const cacheKey = this.cache.computeHash(`${systemPrompt}\n---\n${msgContent}`);

      const cached = this.cache.get(cacheKey);
      if (cached !== null) {
        // 恢复缓存的响应
        const parsed = JSON.parse(cached) as ProviderResponse;
        return parsed;
      }
    }

    const temperature = (options?.temperature as number) ?? this.config.temperature;
    const maxTokens = (options?.maxTokens as number) ?? this.config.maxTokens;

    const body = JSON.stringify({
      model: this.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })),
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    });

    const res = await this.httpFetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const text = await res.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        id: uuidv4(),
        model: this.model,
        content: text,
        stopReason: 'end_turn',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    const msg = parsed.message as { role?: string; content?: string } | undefined;

    const response: ProviderResponse = {
      id: uuidv4(),
      model: this.model,
      content: msg?.content || '',
      stopReason: 'end_turn',
      usage: parsed.timings ? {
        promptTokens: Math.floor((parsed.prompt_eval_count as number) || 0),
        completionTokens: Math.floor((parsed.eval_count as number) || 0),
        totalTokens: Math.floor(((parsed.prompt_eval_count as number) || 0) + ((parsed.eval_count as number) || 0)),
      } : { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };

    // 缓存结果
    if (this.shouldCachePrompt(messages)) {
      const systemMsg = messages.find(m => m.role === UserRole.SYSTEM);
      const systemPrompt = systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content)) : '';
      const msgContent = messages
        .filter(m => m.role !== UserRole.SYSTEM)
        .map(m => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
        .join('\n---\n');
      const cacheKey = this.cache.computeHash(`${systemPrompt}\n---\n${msgContent}`);
      this.cache.set(cacheKey, JSON.stringify(response));
    }

    return response;
  }

  destroy(): void {}

  private httpFetch(urlStr: string, init: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(urlStr, { method: init.method, headers: init.headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({
          ok: res.statusCode! >= 200 && res.statusCode! < 300,
          status: res.statusCode!,
          text: () => Promise.resolve(Buffer.concat(chunks).toString()),
        }));
      });
      req.on('error', reject);
      if (init.body) req.write(init.body);
      req.end();
    });
  }
}

// ─── 路由器 ───

export class ProviderRouter {
  private adapters: Map<string, ProviderAdapter> = new Map();
  private currentId: string = 'default';
  private logger = createLogger({ name: 'provider-router', level: Level.INFO });

  registerAdapter(id: string, adapter: ProviderAdapter): void {
    this.adapters.set(id, adapter);
    if (!this.currentId) this.currentId = id;
    this.logger.info(`Adapter registered: ${id} (${adapter.type})`);
  }

  registerProvider(config: ProviderConfig): string {
    const id = config.id || uuidv4().slice(0, 8);
    const adapter = new OllamaAdapter(config);
    this.registerAdapter(id, adapter);
    return id;
  }

  async initializeAll(): Promise<void> {
    const entries = Array.from(this.adapters.entries());
    for (const [id, adapter] of entries) {
      try {
        await adapter.initialize();
        this.logger.info(`Adapter initialized: ${id}`);
      } catch (err) {
        this.logger.warn(`Failed to init ${id}: ${(err as Error).message}`);
      }
    }
  }

  useProvider(id: string): boolean {
    if (!this.adapters.has(id)) return false;
    this.currentId = id;
    this.logger.info(`Switched to provider: ${id}`);
    return true;
  }

  async chat(messages: AgentMessage[], tools?: ToolDefinition[], opts?: { providerId?: string; temperature?: number; maxTokens?: number }): Promise<ProviderResponse> {
    const adapter = this.getAdapter(opts?.providerId);
    return adapter.chat(messages, tools, { temperature: opts?.temperature, maxTokens: opts?.maxTokens });
  }

  async chatWithMessages(prompt: string, context?: string): Promise<ProviderResponse> {
    const messages: AgentMessage[] = [
      { id: uuidv4(), role: UserRole.SYSTEM, content: context || 'You are a helpful coding assistant.', timestamp: Date.now() },
      { id: uuidv4(), role: UserRole.USER, content: prompt, timestamp: Date.now() },
    ];
    return this.chat(messages);
  }

  private getAdapter(id?: string): ProviderAdapter {
    const key = id || this.currentId;
    const adapter = this.adapters.get(key);
    if (!adapter) throw new Error(`No adapter: ${key}`);
    return adapter;
  }

  listProviders(): { id: string; type: string; model: string; active: boolean }[] {
    return Array.from(this.adapters.entries()).map(([id, a]) => ({
      id, type: a.type, model: a.config.model, active: id === this.currentId,
    }));
  }

  destroy(): void {
    const adapters = Array.from(this.adapters.values());
    for (const a of adapters) a.destroy();
    this.adapters.clear();
  }
}

// ─── 单例 ───

let _router: ProviderRouter | null = null;

/** 获取全局 Provider 路由器单例 */
export function getProviderRouter(): ProviderRouter {
  if (!_router) {
    _router = new ProviderRouter();
    const def = createProviderConfig({ model: 'qwen2.5', maxTokens: 4096 });
    _router.registerProvider(def);
  }
  return _router;
}
