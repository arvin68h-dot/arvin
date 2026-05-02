// CodeEngine LSP Client — JSON-RPC client managing LSP server processes
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { createLogger, LogLevel, type DiagnosticSeverity, type DiagnosticRange } from '@codeengine/core';
import { LspJsonRpc } from './jsonrpc.js';
import type { LanguageInfo } from './language.js';
import { DiagnosticManager, type LspDiagnostic } from './diagnostic.js';

export interface LspClientConfig {
  rootPath: string;
  workspaceFolders?: string[];
}

export interface ClientDocumentState {
  uri: string;
  languageId: string;
  version: number;
  content: string;
}

export interface ActiveClientEntry {
  docUri: string;
  diags: LspDiagnostic[];
}

export class LspClient {
  private logger = createLogger({ name: 'lsp:client', level: LogLevel.INFO });
  private jsonrpc: LspJsonRpc | null = null;
  private childProcess: ChildProcess | null = null;
  private documentState: ClientDocumentState | null = null;
  private serverInitialized = false;
  private languageInfo: LanguageInfo | null = null;
  private disposables: Array<() => void> = [];

  private _diagnosticManager: DiagnosticManager | null = null;

  get diagnosticManager(): DiagnosticManager {
    if (!this._diagnosticManager) {
      this._diagnosticManager = new DiagnosticManager(this);
    }
    return this._diagnosticManager;
  }

  get isActive(): boolean {
    return this.childProcess !== null && this.serverInitialized;
  }

  getActiveClients(): ActiveClientEntry[] {
    if (!this.documentState) return [];
    return [
      {
        docUri: this.documentState.uri,
        diags: [],
      },
    ];
  }

  /** Start LSP server for a file */
  async start(filePath: string, languageInfo: LanguageInfo, config: LspClientConfig): Promise<boolean> {
    try {
      this.stop();
    } catch {
      // ignore
    }

    this.languageInfo = languageInfo;
    const serverCmd = languageInfo.serverCommand;
    const serverArgs = languageInfo.serverArgs || [];

    this.logger.info(`Starting LSP server: ${serverCmd} for ${filePath}`);

    const workspaceRoot = config.rootPath || path.dirname(filePath);

    this.childProcess = spawn(serverCmd, serverArgs, {
      cwd: workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    });

    const jsonrpc = new LspJsonRpc();
    this.jsonrpc = jsonrpc;

    // Override _writeRaw to actually write to the child process
    jsonrpc._writeRaw = (data: string) => {
      if (this.childProcess?.stdin) {
        this.childProcess.stdin.write(data);
      }
    };

    // Override onMessage handler to capture diagnostics
    const originalOnMessage = jsonrpc.onMessage.bind(jsonrpc);
    jsonrpc.onMessage = (data: string) => {
      originalOnMessage(data);
      // Try to parse diagnostics from publishDiagnostics notification
      try {
        const msg = JSON.parse(data.includes('\r\n') ? data.split('\r\n')[1] || data : data);
        if (msg?.method === 'textDocument/publishDiagnostics') {
          this.logger.debug(`Received diagnostics for ${(msg as Record<string, unknown>)?.uri}`);
        }
      } catch {
        // not JSON
      }
    };

    // Listen to stderr for server output
    this.childProcess.stderr?.on('data', (data: Buffer) => {
      // Pipe stderr through jsonrpc for content-length framing
      jsonrpc.onMessage(data.toString());
    });

    // Send initialize request
    const initParams = {
      processId: process.pid,
      clientInfo: { name: 'CodeEngine', version: '0.1.0' },
      rootUri: this.toUri(workspaceRoot),
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: true, willSave: false },
          diagnostic: { dynamicRegistration: true },
          publishDiagnostics: { relatedDocumentPatternSortKey: '' },
          completion: { completionItem: { snippetSupport: false } },
        },
        workspace: { workspaceFolders: true },
      },
      initializationOptions: languageInfo.initializationOptions,
    };

    try {
      await this.jsonrpc.send('initialize', initParams);
      this.serverInitialized = true;
      this.logger.info(`LSP server initialized for ${languageInfo.languageId}`);

      // Send initialized notification
      this.jsonrpc.notify('initialized', {});
      return true;
    } catch (err) {
      this.logger.error(`LSP initialization failed: ${(err as Error).message}`);
      this.stop();
      return false;
    }
  }

  /** Open a document in the LSP server */
  async openDocument(filePath: string, content: string): Promise<void> {
    if (!this.jsonrpc || !this.isActive) return;

    const uri = this.toUri(filePath);
    const languageId = this.languageInfo?.languageId || 'plaintext';

    this.documentState = { uri, languageId, version: 1, content };

    this.jsonrpc.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });

    this.logger.debug(`Opened document: ${uri}`);
  }

  /** Change document content */
  async changeDocument(content: string): Promise<void> {
    if (!this.jsonrpc || !this.documentState || !this.isActive) return;

    this.documentState.version++;
    this.documentState.content = content;

    const range = this.computeRange(content, this.documentState.content);

    this.jsonrpc.notify('textDocument/didChange', {
      textDocument: { uri: this.documentState.uri, version: this.documentState.version },
      contentChanges: range
        ? [{ range, text: content }]
        : [{ range: { start: { line: 0, character: 0 }, end: { line: 1000000, character: 0 } }, text: content }],
    });
  }

  /** Close a document */
  async closeDocument(): Promise<void> {
    if (!this.jsonrpc || !this.documentState || !this.isActive) return;

    this.jsonrpc.notify('textDocument/didClose', {
      textDocument: { uri: this.documentState.uri },
    });

    this.documentState = null;
  }

  /** Get diagnostics for current document */
  async getDocumentDiagnostics(filePath: string): Promise<LspDiagnostic[]> {
    // Trigger diagnostics via hover or documentHighlight as fallback
    // LSP spec: diagnostics come via publishDiagnostics notification
    // We track them in cache
    if (this._diagnosticManager) {
      return this._diagnosticManager.getDiagnostics(filePath);
    }
    return [];
  }

  /** Stop the LSP server */
  stop(): void {
    if (this.childProcess) {
      try { this.childProcess.kill('SIGTERM'); } catch { /* ignore */ }
      this.childProcess = null;
    }
    this.jsonrpc = null;
    this.serverInitialized = false;
    this.documentState = null;
    this.languageInfo = null;
  }

  /** Request hover info at position */
  async requestHover(line: number, character: number): Promise<unknown> {
    if (!this.jsonrpc || !this.documentState) return null;
    return this.jsonrpc.send('textDocument/hover', {
      textDocument: { uri: this.documentState.uri },
      position: { line, character },
    });
  }

  /** Request completions */
  async requestCompletions(line: number, character: number): Promise<unknown> {
    if (!this.jsonrpc || !this.documentState) return null;
    return this.jsonrpc.send('textDocument/completion', {
      textDocument: { uri: this.documentState.uri },
      position: { line, character },
    });
  }

  /** Request goto definition */
  async requestDefinition(line: number, character: number): Promise<unknown> {
    if (!this.jsonrpc || !this.documentState) return null;
    return this.jsonrpc.send('textDocument/definition', {
      textDocument: { uri: this.documentState.uri },
      position: { line, character },
    });
  }

  /** Request references */
  async requestReferences(line: number, character: number): Promise<unknown> {
    if (!this.jsonrpc || !this.documentState) return null;
    return this.jsonrpc.send('textDocument/references', {
      textDocument: { uri: this.documentState.uri },
      position: { line, character },
      context: { includeDeclaration: true },
    });
  }

  private toUri(filePath: string): string {
    const abs = path.resolve(filePath);
    return `file://${abs}`;
  }

  private computeRange(newContent: string, oldContent: string): { start: { line: number; character: number }; end: { line: number; character: number } } | null {
    // Simple change detection: find first changed line
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    for (let i = 0; i < Math.min(oldLines.length, newLines.length); i++) {
      if (oldLines[i] !== newLines[i]) {
        return {
          start: { line: i, character: 0 },
          end: { line: i + 1, character: 0 },
        };
      }
    }
    return null;
  }
}
