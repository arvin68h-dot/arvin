// CodeEngine LSP — 语言服务器协议集成
// LSP Client、诊断、语言检测、Server 启动
// 性能优化：项目级单例，防止重复启动

import { LspClient } from './client.js';
import { LspJsonRpc } from './jsonrpc.js';
import { DiagnosticManager } from './diagnostic.js';
import { LanguageMapper } from './language.js';

// ─── 重新导出 ───
export { LspClient };
export { LspJsonRpc };
export { DiagnosticManager };
export { LanguageMapper };

// ─── LSP 单例管理 ───

/** LSP 服务器实例池，每个项目路径仅保留一个实例 */
class LSPServerPool {
  private static instances: Map<string, LspClient> = new Map();

  /**
   * 获取指定项目的 LSP 客户端实例
   * 如果已存在则返回缓存的实例，否则创建新实例
   * @param projectPath 项目根路径
   * @returns LSP 客户端实例
   */
  static getInstance(projectPath: string): LspClient {
    const normalizedPath = projectPath.replace(/\/+$/, '');
    let client = this.instances.get(normalizedPath);
    if (!client) {
      client = new LspClient();
      this.instances.set(normalizedPath, client);
    }
    return client;
  }

  /**
   * 销毁指定项目的 LSP 实例
   * @param projectPath 项目根路径
   */
  static destroyInstance(projectPath: string): void {
    const normalizedPath = projectPath.replace(/\/+$/, '');
    const client = this.instances.get(normalizedPath);
    if (client) {
      client.stop();
      this.instances.delete(normalizedPath);
    }
  }

  /** 获取当前缓存的所有实例数量 */
  static getInstanceCount(): number {
    return this.instances.size;
  }

  /** 销毁所有缓存的实例 */
  static clearAll(): void {
    this.instances.forEach(client => client.stop());
    this.instances.clear();
  }
}

/** 获取指定项目的 LSP 单例客户端 */
export function getLSPInstance(projectPath: string): LspClient {
  return LSPServerPool.getInstance(projectPath);
}

/** 销毁指定项目的 LSP 实例 */
export function disposeLSPInstance(projectPath: string): void {
  LSPServerPool.destroyInstance(projectPath);
}
