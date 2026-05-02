// CodeEngine Compaction Package — 压缩引擎
// 压缩策略、摘要生成、关键信息提取
// 性能优化：贪心算法、混合策略、阈值控制

import { CompactionStrategy, type CompactionConfig, type CompactionResult } from '@codeengine/core';

// ─── 导出压缩核心类型 ───

/**
 * 压缩策略枚举别名，用于快速类型引用
 */
export type CompactionStrategyType = CompactionStrategy;

/**
 * 压缩结果摘要
 */
export interface CompactionSummary {
  /** 使用的策略 */
  strategy: CompactionStrategy;
  /** 保留的消息数量 */
  messagesKept: number;
  /** 移除的消息数量 */
  messagesRemoved: number;
  /** 压缩摘要文本 */
  summary?: string;
}

/**
 * 压缩引擎配置
 */
export interface CompactionEngineConfig {
  /** 压缩策略（默认 MERGE） */
  strategy?: CompactionStrategy;
  /** 最小 token 阈值，超过后触发压缩 */
  minTokens?: number;
  /** 最大 token 限制 */
  maxTokens?: number;
  /** 保留最近消息数量（默认 20） */
  keepRecent?: number;
  /** 开始摘要的阈值（默认 50） */
  summarizeThreshold?: number;
  /** 贪心窗口大小 */
  greedyWindow?: number;
  /** 消息分组聚合大小 */
  groupSize?: number;
}

// ─── 工具函数 ───

/**
 * 快速估算文本的 token 数量
 * @param text 输入文本
 * @returns 估算的 token 数
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * 判断是否超过压缩阈值
 * @param tokenCount 当前 token 数
 * @param minTokens 最小阈值
 * @returns 是否需要压缩
 */
export function needsCompaction(tokenCount: number, minTokens: number = 16000): boolean {
  return tokenCount > minTokens;
}

// 重新导出核心类型
export type { CompactionConfig, CompactionResult };
export { CompactionStrategy };
