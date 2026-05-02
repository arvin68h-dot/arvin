// ─── 日志系统 ───
import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { expandPath } from '../config/index.js';
import type { LogLevel, LogEntry } from '../types/index.js';
import { LogLevel as LogLevels } from '../types/index.js';

const LEVEL_MAP: Record<string, LogLevel> = {
  trace: LogLevels.TRACE, debug: LogLevels.DEBUG, info: LogLevels.INFO,
  warn: LogLevels.WARN, error: LogLevels.ERROR, silent: LogLevels.SILENT,
};

export interface LoggerOptions {
  name?: string;
  level?: LogLevel;
  toFile?: boolean;
  logDir?: string;
  maxFiles?: number;
}

export class Logger {
  private name: string;
  private level: LogLevel;
  private toFile: boolean;
  private logDir: string;
  private maxFiles: number;
  private currentFile: string = '';

  constructor(options: LoggerOptions = {}) {
    this.name = options.name || 'codeengine';
    this.level = options.level ?? LogLevels.INFO;
    this.toFile = options.toFile ?? false;
    this.logDir = options.logDir ?? expandPath('~/.codeengine/logs');
    this.maxFiles = options.maxFiles ?? 7;

    if (this.toFile) {
      if (!existsSync(this.logDir)) mkdirSync(this.logDir, { recursive: true });
      this.currentFile = join(this.logDir, `${this.name}.log`);
    }
  }

  shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  write(entry: LogEntry): void {
    const formatted = `[${new Date(entry.timestamp).toISOString()}] [${this.name}] [${entry.level}] ${entry.message}${entry.context ? ' ' + JSON.stringify(entry.context) : ''}\n`;
    if (this.shouldLog(entry.level)) console.log(formatted.trim());
    if (this.toFile) {
      this.rotate();
      try { appendFileSync(this.currentFile, formatted, 'utf-8'); } catch { /* ignore */ }
    }
  }

  trace(msg: string, ctx?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevels.TRACE)) this.write({ timestamp: Date.now(), level: LogLevels.TRACE, message: msg, context: ctx });
  }
  debug(msg: string, ctx?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevels.DEBUG)) this.write({ timestamp: Date.now(), level: LogLevels.DEBUG, message: msg, context: ctx });
  }
  info(msg: string, ctx?: Record<string, unknown>): void {
    this.write({ timestamp: Date.now(), level: LogLevels.INFO, message: msg, context: ctx });
  }
  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.write({ timestamp: Date.now(), level: LogLevels.WARN, message: msg, context: ctx });
  }
  error(msg: string, ctx?: Record<string, unknown>): void {
    this.write({ timestamp: Date.now(), level: LogLevels.ERROR, message: msg, context: ctx });
  }
  setLevel(level: string): void {
    this.level = typeof level === 'string' ? (LEVEL_MAP[level.toLowerCase()] ?? LogLevels.INFO) : (level as LogLevel);
  }
  getLevel(): LogLevel {
    return this.level;
  }
  enableFileLogging(enabled: boolean): void {
    this.toFile = enabled;
  }

  private rotate(): void {
    if (!existsSync(this.logDir)) return;
    try {
      const files = readdirSync(this.logDir)
        .filter(f => f.startsWith(this.name) && f.endsWith('.log'))
        .sort((a, b) => parseInt(b) - parseInt(a));
      for (let i = this.maxFiles; i < files.length; i++) {
        unlinkSync(join(this.logDir, files[i]));
      }
    } catch { /* ignore */ }
  }
}

let globalLogger: Logger | null = null;

export function createLogger(options: LoggerOptions = {}): Logger {
  if (!globalLogger) globalLogger = new Logger(options);
  return globalLogger;
}

export function getGlobalLogger(): Logger {
  if (!globalLogger) globalLogger = createLogger();
  return globalLogger;
}

export const log = {
  trace: (msg: string, ctx?: Record<string, unknown>) => createLogger().trace(msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => createLogger().debug(msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => createLogger().info(msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => createLogger().warn(msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => createLogger().error(msg, ctx),
};
