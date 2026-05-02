// CodeEngine Compaction Engine — 上下文压缩引擎
// 自动压缩长会话，保持关键信息同时控制上下文窗口大小
// 性能优化：贪心摘要算法，混合策略，阈值控制

import {
  type AgentMessage,
  type Session,
  type CompactionConfig,
  CompactionStrategy,
  UserRole,
  LogLevel,
  createLogger,
} from '@codeengine/core';
import type { SessionMessage, SessionManager } from './session.js';
import type { ProviderRouter } from './provider.js';

// ─── 压缩策略 ───

export interface CompactionSummary {
  strategy: CompactionStrategy;
  messagesKept: number;
  messagesRemoved: number;
  summary?: string;
}

/**
 * 压缩引擎配置
 */
export interface CompactionEngineConfig {
  strategy?: CompactionStrategy;
  minTokens?: number;
  maxTokens?: number;
  keepRecent?: number;
  summarizeThreshold?: number;
  /** 贪心算法的窗口大小 - 保留最近 N 条完整消息 */
  greedyWindow?: number;
  /** 消息分组聚合大小 */
  groupSize?: number;
}

// ─── 压缩引擎 ───

export class CompactionEngine {
  private readonly config: Required<CompactionEngineConfig>;
  private readonly logger;

  constructor(
    config?: CompactionEngineConfig,
  ) {
    this.config = {
      strategy: config?.strategy ?? CompactionStrategy.MERGE,
      minTokens: config?.minTokens ?? 16000,
      maxTokens: config?.maxTokens ?? 128000,
      keepRecent: config?.keepRecent ?? 20,
      summarizeThreshold: config?.summarizeThreshold ?? 50,
      greedyWindow: config?.greedyWindow ?? 20,
      groupSize: config?.groupSize ?? 5,
    };
    this.logger = createLogger({ name: 'compaction', level: LogLevel.INFO });
  }

  /** 检查是否需要压缩 */
  needsCompaction(messages: SessionMessage[]): boolean {
    const tokenCount = this.estimateTokens(messages);
    return tokenCount > this.config.minTokens;
  }

  /** 获取当前消息的 token 估算 */
  estimateMessageTokens(messages: SessionMessage[]): number {
    return this.estimateTokens(messages);
  }

  /** 执行压缩 */
  async compact(
    messages: SessionMessage[],
    providerRouter?: ProviderRouter,
  ): Promise<CompactionSummary> {
    const summary: CompactionSummary = {
      strategy: this.config.strategy,
      messagesKept: 0,
      messagesRemoved: 0,
    };

    switch (this.config.strategy) {
    case CompactionStrategy.MERGE:
      return this.compactGreedy(messages, summary);
    case CompactionStrategy.SUMMARIZE:
      if (providerRouter) {
        return await this.compactHybrid(messages, providerRouter, summary);
      }
      return this.compactGreedy(messages, summary);
    case CompactionStrategy.HYBRID:
      if (providerRouter) {
        return await this.compactHybrid(messages, providerRouter, summary);
      }
      return this.compactGreedy(messages, summary);
    default:
      return this.compactGreedy(messages, summary);
    }
  }

  /** 估算 token 数 */
  private estimateTokens(messages: SessionMessage[]): number {
    let tokens = 0;
    for (const msg of messages) {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      tokens += Math.ceil(text.length / 4);
      if (msg.role === UserRole.TOOL) tokens += 100;
    }
    return tokens;
  }

  /** 贪心保留策略：保留最近 N 条 + 系统消息 */
  private compactGreedy(messages: SessionMessage[], summary: CompactionSummary): CompactionSummary {
    const systemMsg = messages.find(m => m.role === UserRole.SYSTEM);
    const keepCount = Math.max(this.config.greedyWindow, systemMsg ? 2 : 0);
    const kept = systemMsg ? [systemMsg, ...messages.slice(-keepCount + 1)] : messages.slice(-keepCount);

    summary.messagesKept = kept.length;
    summary.messagesRemoved = messages.length - kept.length;

    this.logger.info(`Compaction (greedy): ${messages.length} -> ${kept.length}`);
    return summary;
  }

  /** 混合策略：保留最新完整消息 + 对旧消息进行贪心聚合 */
  private async compactHybrid(
    messages: SessionMessage[],
    providerRouter: ProviderRouter,
    summary: CompactionSummary,
  ): Promise<CompactionSummary> {
    const systemMsg = messages.find(m => m.role === UserRole.SYSTEM);
    const userMessages = messages.filter(m => m.role === UserRole.USER || m.role === UserRole.ASSISTANT);

    // 检查是否超过摘要阈值，未超过则使用贪心策略
    if (userMessages.length <= this.config.summarizeThreshold) {
      return this.compactGreedy(messages, summary);
    }

    // 保留最近 N 条完整消息
    const recentCount = Math.max(this.config.greedyWindow, this.config.keepRecent);
    const recent = userMessages.slice(-recentCount);
    const toSummarize = userMessages.slice(0, userMessages.length - recentCount);

    const kept: SessionMessage[] = systemMsg ? [systemMsg] : [];
    kept.push(...recent);

    // 将待摘要消息分组，每组生成一条摘要消息
    const groups: SessionMessage[][] = [];
    const groupSize = this.config.groupSize;
    for (let i = 0; i < toSummarize.length; i += groupSize) {
      groups.push(toSummarize.slice(i, i + groupSize));
    }

    // 计算压缩前的总 token 数（在分组外计算，避免作用域问题）
    const toSummarizeMessages = toSummarize;
    const tokensBefore = this.estimateTokens(toSummarizeMessages);

    // 对每组生成合并摘要
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];

      // 生成组合并消息（避免不必要的 LLM 调用）
      const groupedContent = group.map((msg, idx) => {
        const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        return `[${g * groupSize + idx + 1}] (${msg.role}): ${text.slice(0, 500)}`;
      }).join('\n\n');

      // 插入压缩摘要消息
      const summaryMsg: SessionMessage = {
        id: `compact-group-${g}`,
        role: UserRole.ASSISTANT,
        content: `[COMPACTED] ${group.length} messages grouped: ${groupedContent}`,
        timestamp: group[0].timestamp,
      };

      kept.push(summaryMsg);
    }

    const tokensAfter = this.estimateTokens(kept);
    const tokenReduction = tokensBefore - tokensAfter;

    summary.messagesKept = kept.length;
    summary.messagesRemoved = messages.length - kept.length;
    summary.summary = `Hybrid compaction: ${messages.length} -> ${kept.length} (tokens: ${tokensBefore} -> ${tokensAfter}, reduction: ${tokenReduction})`;

    this.logger.info(`Compaction (hybrid): ${messages.length} -> ${kept.length}, tokens: ${tokensBefore} -> ${tokensAfter}`);
    return summary;
  }

  /** 轮询保留策略 */
  private compactRoundRobin(messages: SessionMessage[], summary: CompactionSummary): CompactionSummary {
    const systemMsg = messages.find(m => m.role === UserRole.SYSTEM);
    const keepEvery = 3;
    let keepCount = 0;
    const kept: SessionMessage[] = [];

    for (let i = messages.length - 1; i >= 0 && keepCount < this.config.keepRecent; i--) {
      const msg = messages[i];
      if (msg.role === UserRole.SYSTEM) { kept.unshift(msg); continue; }
      if (i % keepEvery === 0 || keepCount < 2) {
        kept.unshift(msg);
        keepCount++;
      }
    }

    summary.messagesKept = kept.length;
    summary.messagesRemoved = messages.length - kept.length;

    this.logger.info(`Compaction (round-robin): ${messages.length} -> ${kept.length}`);
    return summary;
  }
}

let _compactionEngine: CompactionEngine | null = null;

/** 获取全局压缩引擎单例 */
export function getCompactionEngine(): CompactionEngine {
  if (!_compactionEngine) _compactionEngine = new CompactionEngine();
  return _compactionEngine;
}
