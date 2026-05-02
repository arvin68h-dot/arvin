// CodeEngine Storage Cache — 存储层 LRU 缓存
// O(1) 查找的 LRU 缓存实现，使用 Map + 哨兵节点
// 支持可配置最大尺寸和 TTL 过期

import { Message, MessageRole } from '@codeengine/core';

// ─── 缓存条目 ───

interface CacheEntry<T> {
  /** 缓存值 */
  value: T;
  /** 过期时间戳（毫秒），0 表示永不过期 */
  expiry: number;
  /** 访问时间（用于 LRU 淘汰） */
  lastAccessed: number;
}

// ─── LRU 缓存 ───

/**
 * 存储层 LRU 缓存
 *
 * 采用 Map + 访问时间戳实现 O(1) get/set：
 * - Map 保证插入顺序，Map 的迭代器按插入顺序遍历
 * - 每次 get 时重新插入到 Map 末尾（最近使用）
 * - 淘汰时删除第一个条目（最久未使用）
 * - 支持 TTL 过期策略
 *
 * @template T 缓存值的类型
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttlMs: number;

  /**
   * 创建 LRU 缓存实例
   * @param maxSize 最大缓存条目数（默认 128）
   * @param ttlMs 缓存条目过期时间（毫秒），0 表示永不过期（默认 0）
   */
  constructor(maxSize = 128, ttlMs = 0) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 缓存值，不存在或已过期则返回 null
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (this.ttlMs > 0 && Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    // 更新最后访问时间，并重新插入到 Map 末尾（标记为最近使用）
    entry.lastAccessed = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * 存储键值对到缓存
   * @param key 缓存键
   * @param value 缓存值
   */
  set(key: string, value: T): void {
    // 如果键已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // 如果缓存已满，淘汰最久未使用的条目
    else if (this.cache.size >= this.maxSize) {
      this.evict();
    }

    this.cache.set(key, {
      value,
      expiry: this.ttlMs > 0 ? Date.now() + this.ttlMs : 0,
      lastAccessed: Date.now(),
    });
  }

  /**
   * 删除指定键的缓存条目
   * @param key 缓存键
   * @returns 是否存在该键
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清除所有缓存条目
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取当前缓存条目数
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 检查是否包含指定键
   * @param key 缓存键
   * @returns 是否包含
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.ttlMs > 0 && Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 执行一次过期清理
   */
  pruneExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    this.cache.forEach((entry, key) => {
      if (this.ttlMs > 0 && now > entry.expiry) {
        expiredKeys.push(key);
      }
    });
    expiredKeys.forEach(k => this.cache.delete(k));
  }

  /** 淘汰最久未使用的条目 */
  private evict(): void {
    // Map 迭代顺序 = 插入顺序，第一个是最近未使用的
    const firstKey = this.getOldestKey();
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  /** 获取最久未使用的键 */
  private getOldestKey(): string | null {
    for (const key of this.cache.keys()) {
      return key;
    }
    return null;
  }
}

// ─── 会话数据脱敏导出 ───

/**
 * 敏感数据模式：用于匹配和替换消息中的敏感信息
 */
const SENSITIVE_PATTERNS: { regex: RegExp; replacement: string }[] = [
  // API 密钥和 token
  { regex: /api[_-]?key\s*[=:]\s*["']?[A-Za-z0-9+/=_-]{16,}["']?/gi, replacement: 'api_key: [REDACTED]' },
  { regex: /token\s*[=:]\s*["']?[A-Za-z0-9+/=_-]{16,}["']?/gi, replacement: 'token: [REDACTED]' },
  { regex: /Authorization:\s*Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi, replacement: 'Authorization: Bearer [REDACTED]' },
  { regex: /x-api-key:\s*[A-Za-z0-9\-._~+\/=]+/gi, replacement: 'x-api-key: [REDACTED]' },
  { regex: /OPENAI_API_KEY\s*=\s*[A-Za-z0-9\-._~+\/=]+/gi, replacement: 'OPENAI_API_KEY = [REDACTED]' },
  { regex: /OLLAMA_API_KEY\s*=\s*[A-Za-z0-9\-._~+\/=]+/gi, replacement: 'OLLAMA_API_KEY = [REDACTED]' },
  { regex: /ANTHROPIC_API_KEY\s*=\s*[A-Za-z0-9\-._~+\/=]+/gi, replacement: 'ANTHROPIC_API_KEY = [REDACTED]' },

  // 密码
  { regex: /password\s*[=:]\s*["']?[^\s"'&]{4,}["']?/gi, replacement: 'password: [REDACTED]' },
  { regex: /passwd\s*[=:]\s*["']?[^\s"'&]{4,}["']?/gi, replacement: 'passwd: [REDACTED]' },
  { regex: /secret\s*[=:]\s*["']?[^\s"'&]{4,}["']?/gi, replacement: 'secret: [REDACTED]' },

  // 个人身份信息
  { regex: /\b\d{3}[-.]?\d{4}[-.]?\d{4}\b/g, replacement: 'xxx-xxxx-xxxx' }, // 类似信用卡号
  { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },

  // 内部 IP 地址（保留公网 IP）
  { regex: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g, replacement: '[PRIVATE_IP]' },
  { regex: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[PRIVATE_IP]' },
  { regex: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g, replacement: '[PRIVATE_IP]' },
];

/**
 * 对单条消息进行脱敏处理
 * @param msg - 要脱敏的消息
 * @returns 脱敏后的消息
 */
function sanitizeMessage(msg: Message): Message {
  let content = msg.content;

  // 对 content 应用所有敏感数据模式
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    content = content.replace(regex, replacement);
  }

  return {
    ...msg,
    content,
  };
}

/**
 * 导出用会话数据脱敏
 * 移除或替换消息中的 API 密钥、token、密码等敏感数据
 * @param messages - 要脱敏的消息数组
 * @returns 脱敏后的消息数组
 */
export function sanitizeForExport(messages: Message[], includeTools = true): Message[] {
  return messages.map(msg => sanitizeMessage(msg));
}
