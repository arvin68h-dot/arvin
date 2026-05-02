// CodeEngine LSP Server Launcher — Auto-detect, install, and launch LSP servers
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { createLogger, LogLevel } from '@codeengine/core';
import { LanguageMapper, type LanguageInfo } from './language.js';
import { LspClient, type LspClientConfig } from './client.js';

const logger = createLogger({ name: 'lsp:launch', level: LogLevel.INFO });

export interface LspServerConfig {
  /** Custom path to LSP server binary (overrides auto-detection) */
  customPath?: string;
  /** Node.js bin directory (used for npm-installed servers) */
  nodeModulesBin?: string;
}

export class LspServerLauncher {
  private readonly languageMapper = LanguageMapper.getInstance();
  private clients = new Map<string, LspClient>();
  private config: LspServerConfig = {};

  constructor(config?: LspServerConfig) {
    this.config = config || {};
  }

  /** Start LSP server for a file */
  async startForFile(filePath: string, workspaceConfig: LspClientConfig): Promise<LspClient | null> {
    const ext = path.extname(filePath);
    const languageInfo = this.languageMapper.detectFromExtension(ext);

    if (!languageInfo) {
      logger.debug(`No LSP server registered for extension: ${ext}`);
      return null;
    }

    // Check if client already exists for this file
    for (const [key, client] of Array.from(this.clients.entries())) {
      if (client.isActive && client['languageInfo']?.languageId === languageInfo.languageId) {
        logger.debug(`Reusing existing LSP client: ${languageInfo.languageId}`);
        await client.openDocument(filePath, '');
        return client;
      }
    }

    const client = new LspClient();
    const started = await client.start(filePath, languageInfo, workspaceConfig);

    if (started) {
      const key = languageInfo.languageId;
      this.clients.set(key, client);
      logger.info(`LSP server started for ${languageInfo.languageId}: ${filePath}`);
    } else {
      logger.warn(`Failed to start LSP server: ${languageInfo.serverCommand}`);
    }

    return started ? client : null;
  }

  /** Check if an LSP server binary is available */
  isServerAvailable(languageId: string): boolean {
    const languageInfo = this.languageMapper.detectFromExtension(languageId);
    if (!languageInfo) return false;

    const cmd = this.config.customPath || languageInfo.serverCommand;

    // Check custom path first
    if (this.config.customPath && fs.existsSync(this.config.customPath)) return true;

    // Check node_modules/.bin
    if (this.config.nodeModulesBin) {
      const binPath = path.join(this.config.nodeModulesBin, languageInfo.serverCommand);
      if (fs.existsSync(binPath)) return true;
    }

    // Check if in PATH (via execFile)
    return new Promise<boolean>((resolve) => {
      execFile(cmd, ['--version'], { timeout: 3000 }, (err) => {
        resolve(!err);
      });
    }) as unknown as boolean;
  }

  /** List all configured LSP servers */
  listServers(): { languageId: string; available: boolean; server: string }[] {
    const languages = this.languageMapper.getKnownLanguages();
    return languages.map((lang) => ({
      languageId: lang.languageId,
      available: this.isServerAvailable(lang.languageId) as boolean,
      server: lang.serverCommand,
    }));
  }

  /** Stop all LSP clients */
  stopAll(): void {
    for (const [, client] of Array.from(this.clients.entries())) {
      client.stop();
    }
    this.clients.clear();
  }

  /** Get all active clients */
  getActiveClients(): LspClient[] {
    return Array.from(this.clients.values());
  }
}
