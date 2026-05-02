// CodeEngine Request Cache — 请求缓存工具
// LRU 缓存，使用 SHA-256 哈希作为键，支持 TTL 过期策略

import { createHash } from 'crypto';

// ─── 缓存条目 ───

interface CacheEntry {
  /** 缓存值 */
  value: string;
  /** 过期时间戳（毫秒） */
  expiry: number;
}

// ─── 请求缓存类 ───

/**
 * 请求缓存器
 * 使用 LRU（最近最少使用）策略，自动过期，SHA-256 哈希键
 * 默认容量：100 条，TTL：5 分钟
 */
export class RequestCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttlMs: number;
  private maxEntriesBeforeCleanup: number;

  /**
   * 创建请求缓存实例
   * @param maxSize 最大缓存条目数，超过后清除最旧的条目（默认 100）
   * @param ttlMs 缓存条目过期时间（毫秒），0 表示永不过期（默认 300000 = 5 分钟）
   */
  constructor(maxSize = 100, ttlMs = 300000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.maxEntriesBeforeCleanup = Math.max(maxSize, 200);
    this.cache = new Map();
  }

  /** 获取缓存值，如果不存在或已过期则返回 null */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (this.ttlMs > 0 && Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /** 存储键值对到缓存 */
  set(key: string, value: string): void {
    // 如果缓存已满，清除最旧的条目
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      expiry: this.ttlMs > 0 ? Date.now() + this.ttlMs : 0,
    });

    // 定期清理过期条目
    if (this.cache.size >= this.maxEntriesBeforeCleanup) {
      this.cleanupExpired();
    }
  }

  /** 清除所有缓存条目 */
  clear(): void {
    this.cache.clear();
  }

  /** 获取当前缓存条目数 */
  size(): number {
    return this.cache.size;
  }

  /**
   * 使用 SHA-256 哈希计算输入字符串的摘要
   * @param input 输入字符串
   * @returns 64 字符的十六进制哈希字符串
   */
  computeHash(input: string): string {
    return createHash('sha256').update(input, 'utf-8').digest('hex');
  }

  /** 清除过期的缓存条目 */
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    this.cache.forEach((entry, key) => {
      if (this.ttlMs > 0 && now > entry.expiry) {
        expiredKeys.push(key);
      }
    });
    expiredKeys.forEach(key => this.cache.delete(key));
  }

  /** 驱逐最旧的缓存条目 */
  private evictOldest(): void {
    let oldestKey: string | undefined;
    this.cache.forEach((entry, key) => {
      oldestKey = key;
    });
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
