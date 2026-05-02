// ─── 配置系统 ───
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import type { ProviderConfig, ProviderType } from '../types/index.js';

// Use Record<string, unknown> throughout for simplicity
interface ProviderConfigLike extends Record<string, unknown> {
  id: string;
  type?: string;
  name?: string;
  model?: string;
  baseURL?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  timeout?: number;
}

interface ConfigSections extends Record<string, unknown> {
  general: Record<string, unknown>;
  session: Record<string, unknown>;
  providers: Record<string, ProviderConfigLike>;
  storage: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  compaction: Record<string, unknown>;
  permission: Record<string, unknown>;
  mcp: Record<string, unknown>;
  engine: Record<string, unknown>;
  skills: Record<string, unknown>;
  features: Record<string, unknown>;
  experimental: Record<string, unknown>;
}

const DEFAULT_CONFIG: ConfigSections = {
  general: { log_level: 'info', log_to_file: true, log_dir: '~/.codeengine/logs', max_concurrent_requests: 1, streaming_enabled: true },
  session: { auto_save: true, save_interval: 30000, max_messages: 10000, timeout: 3600000 },
  providers: {
    default: 'ollama' as any,
    ollama: Object.freeze({
      id: 'ollama', type: 'ollama' as const, name: 'Ollama', model: 'qwen3.6-35b',
      baseURL: 'http://10.0.0.11:1234', maxTokens: 8192, temperature: 0.7,
    }),
  },
  storage: { path: '~/.codeengine/data/codeengine.db', vacuumInterval: 86400000 },
  checkpoint: { auto_before_shell: true, max_snapshots: 20, backup_dir: '.codeengine.backup' },
  compaction: { strategy: 'hybrid', maxInputTokens: 128000, targetTokens: 64000, minTokens: 16000 },
  permission: { default: 'ask', always_allow: ['read_file', 'glob', 'list_dir'], always_deny: ['sudo'] },
  mcp: { servers: [] },
  engine: { compilers: { gpp: 'g++', gcc: 'gcc', python: 'python3', node: 'node' } },
  skills: { dir: '~/.codeengine/skills' },
  features: { codebase_search: true, lsp_integration: true, checkpoint_system: true, skill_system: true, task_planning: true, mcp_support: true },
  experimental: { recursive_editing: false, parallel_tool_execution: false, auto_suggestions: true },
};

let configCache: ConfigSections | null = null;
let configPath = '';

// ─── API 密钥加密 ───

/** 加密前缀标识：加密后的值以此开头 */
export const ENCRYPTED_PREFIX = '__encrypted__';

/**
 * XOR 加密 API 密钥
 * 使用用户提供的密码进行简单的 XOR 加密（非生产级别，但比明文存储好）
 * @param key - 要加密的原始密钥字符串
 * @param password - 加密密码
 * @returns 加密后的字符串（含前缀）
 */
export function encryptKey(key: string, password: string): string {
  if (!key) return key;
  if (!password) {
    throw new Error('encryptKey requires a password parameter');
  }

  const bytes = Buffer.from(key, 'utf-8');
  const pwdBytes = Buffer.from(password, 'utf-8');
  const encrypted = Buffer.alloc(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    encrypted[i] = bytes[i] ^ pwdBytes[i % pwdBytes.length];
  }

  // 添加校验和用于验证完整性
  const checksum = simpleChecksum(encrypted);
  return `${ENCRYPTED_PREFIX}${checksum}:${encrypted.toString('base64')}`;
}

/**
 * 解密已加密的 API 密钥
 * @param encrypted - 包含 __encrypted__ 前缀的已加密字符串
 * @param password - 解密密码
 * @returns 解密后的原始密钥
 */
export function decryptKey(encrypted: string, password: string): string {
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) {
    return encrypted;
  }

  if (!password) {
    throw new Error('decryptKey requires a password parameter');
  }

  const inner = encrypted.slice(ENCRYPTED_PREFIX.length);
  const colonIdx = inner.indexOf(':');
  if (colonIdx < 0) {
    throw new Error('Invalid encrypted format: missing checksum separator');
  }

  const checksum = inner.slice(0, colonIdx);
  const encoded = inner.slice(colonIdx + 1);

  const decrypted = Buffer.from(encoded, 'base64');
  const pwdBytes = Buffer.from(password, 'utf-8');
  const decryptedBytes = Buffer.alloc(decrypted.length);

  for (let i = 0; i < decrypted.length; i++) {
    decryptedBytes[i] = decrypted[i] ^ pwdBytes[i % pwdBytes.length];
  }

  // 验证完整性
  const computedChecksum = simpleChecksum(decryptedBytes);
  if (computedChecksum !== checksum) {
    throw new Error('Decryption failed: incorrect password or corrupted data');
  }

  return decryptedBytes.toString('utf-8');
}

/**
 * 简单的字符串校验和，用于验证加密数据完整性
 * @param data - 输入缓冲区
 * @returns 校验和字符串
 */
function simpleChecksum(data: Buffer): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * 检查字符串是否已加密
 * @param value - 要检查的字符串
 * @returns 是否已加密
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

// ─── 配置加载时自动解密 ───

/**
 * 递归解密配置对象中的加密 API 密钥
 * @param config - 配置对象
 * @param password - 解密密码
 * @returns 解密后的配置对象副本
 */
function decryptConfigValues(config: Record<string, unknown>, password: string): Record<string, unknown> {
  const result = { ...config };

  for (const [key, value] of Object.entries(result)) {
    if (key === 'apiKey' && typeof value === 'string') {
      if (value.startsWith(ENCRYPTED_PREFIX)) {
        try {
          (result as Record<string, unknown>)[key] = decryptKey(value, password);
        } catch {
          // 如果解密失败，保留原值（可能是密码错误）
          (result as Record<string, unknown>)[key] = value;
        }
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = decryptConfigValues(value as Record<string, unknown>, password);
    }
  }

  return result;
}

export function expandPath(p: string): string {
  if (!p) return p;
  if (p.startsWith('~/')) return join(process.env.HOME || '', p.slice(2));
  if (p.startsWith('~')) return join(process.env.HOME || '/', p.slice(1));
  return resolve(p);
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !(Array.isArray(value)) && key in result && typeof result[key] === 'object') {
      (result as Record<string, unknown>)[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

export function loadConfig(path?: string): ConfigSections {
  if (configCache && !path) return configCache;
  configPath = path || expandPath('~/.codeengine/config.toml');
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    configCache = parseTOML(raw) as ConfigSections;
    configCache = deepMerge(DEFAULT_CONFIG, configCache) as ConfigSections;
  } else {
    configCache = { ...DEFAULT_CONFIG };
    const cfg = configCache!;
    (cfg.storage.path as string) = expandPath((cfg.storage.path as string) || '');
    (cfg.general.log_dir as string) = expandPath((cfg.general.log_dir as string) || '');
    (cfg.skills.dir as string) = expandPath((cfg.skills.dir as string) || '');
    ensureDir(dirname((cfg.storage.path as string) || ''));
    ensureDir((cfg.general.log_dir as string) || '');
    ensureDir((cfg.skills.dir as string) || '');
  }
  return configCache || DEFAULT_CONFIG;
}

export function reloadConfig(): void {
  configCache = null;
  loadConfig();
}

export function saveConfig(config: Partial<ConfigSections>): void {
  if (!configPath) configPath = expandPath('~/.codeengine/config.toml');
  const base = configCache || DEFAULT_CONFIG;
  configCache = deepMerge(base, config) as ConfigSections;
  writeFileSync(configPath, toTOML(configCache), 'utf-8');
}

/**
 * 在保存配置时自动加密 API 密钥
 * @param config - 要保存的配置对象
 * @param password - 加密密码
 */
export function saveConfigEncrypted(config: Partial<ConfigSections>, password: string): void {
  if (!configPath) configPath = expandPath('~/.codeengine/config.toml');
  const base = configCache || DEFAULT_CONFIG;
  const merged = deepMerge(base, config) as ConfigSections;

  // 递归加密所有 apiKey 字段
  const encrypted = encryptConfigValues(merged, password);
  configCache = encrypted as ConfigSections;
  writeFileSync(configPath, toTOML(configCache), 'utf-8');
}

/**
 * 递归加密配置对象中的 API 密钥
 * @param config - 配置对象
 * @param password - 加密密码
 * @returns 加密后的配置副本
 */
function encryptConfigValues(config: Record<string, unknown>, password: string): Record<string, unknown> {
  const result = { ...config };

  for (const [key, value] of Object.entries(result)) {
    if (key === 'apiKey' && typeof value === 'string') {
      if (!value.startsWith(ENCRYPTED_PREFIX)) {
        try {
          (result as Record<string, unknown>)[key] = encryptKey(value, password);
        } catch {
          // 加密失败时保留原值
        }
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = encryptConfigValues(value as Record<string, unknown>, password);
    }
  }

  return result;
}

export function getConfig<T = unknown>(key?: string): T {
  const cfg = loadConfig();
  if (!key) return cfg as unknown as T;
  const parts = key.split('.');
  let current: Record<string, unknown> = cfg as Record<string, unknown>;
  for (const part of parts) {
    if (current && part in current) {
      current = current[part] as Record<string, unknown>;
    } else {
      throw new Error(`Config key not found: ${key}`);
    }
  }
  return current as T;
}

export function setConfig(key: string, value: unknown): void {
  const parts = key.split('.');
  const cfg = loadConfig() as Record<string, unknown>;
  let current = cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  saveConfig(cfg);
}

export function getDefaultConfig(): ConfigSections {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function parseTOML(input: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection: string | null = null;
  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      currentSection = sec[1].trim();
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }
    const kv = line.match(/^(\w[\w_]*)\s*=\s*(.+)$/);
    if (kv) {
      const val = parseTOMLValue(kv[2].trim());
      const target = currentSection ? ((result as Record<string, unknown>)[currentSection] as Record<string, unknown>) : result;
      target[kv[1]] = val;
    }
  }
  return result;
}

function parseTOMLValue(v: string): unknown {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => parseTOMLValue(s.trim()));
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function toTOML(obj: Record<string, unknown>, indent = ''): string {
  let out = '';
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const isProvider = key === 'providers' || (value as Record<string, unknown>).type;
      if (isProvider) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          out += `${indent}${k} = ${fmt(v)}\n`;
        }
      } else {
        out += `${indent}[${key}]\n`;
        out += toTOML(value as Record<string, unknown>, indent);
      }
    } else if (Array.isArray(value)) {
      out += `${indent}${key} = [${value.map(fmt).join(', ')}]\n`;
    } else {
      out += `${indent}${key} = ${fmt(value)}\n`;
    }
  }
  return out;
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'boolean') return v.toString();
  if (v === null || v === undefined) return 'null';
  return String(v);
}

export function createProviderConfig(partial: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: partial.id || 'custom', type: (partial.type || 'openai_compatible') as ProviderType,
    name: partial.name || 'Custom', model: partial.model || 'unknown',
    baseURL: partial.baseURL, apiKey: partial.apiKey,
    maxTokens: partial.maxTokens || 4096, temperature: partial.temperature ?? 0.7,
    topP: partial.topP, timeout: partial.timeout || 60000,
  };
}
