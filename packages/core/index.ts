// CodeEngine Core — 核心内核包
// 显式导出，避免 export * 冲突

// 类型和值全部从 types/index.ts
export * from './src/types/index.js';

// 协议
export * from './src/types/protocol.js';

// 配置
export * from './src/config/index.js';

// ─── 日志 — 显式导出，跳过 Logger class 类型名冲突 ───
export {
  createLogger, getGlobalLogger, log, type LoggerOptions,
} from './src/util/logger.js';

// ─── 项目检测 ───
export * from './src/detector/project.js';

// ─── 请求缓存 ───
export { RequestCache } from './src/provider/cache.js';
