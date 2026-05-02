// CodeEngine LSP — Diagnostic management
import { createLogger, LogLevel, type DiagnosticSeverity, type DiagnosticRange } from '@codeengine/core';
import type { LspClient } from './client.js';
import type { LanguageInfo } from './language.js';

export interface ProjectDiagnostic {
  file: string;
  diagnostics: LspDiagnostic[];
}

export interface LspDiagnostic {
  code?: string | number;
  message: string;
  range: DiagnosticRange;
  severity: DiagnosticSeverity;
  source?: string;
}

export class DiagnosticManager {
  private readonly logger = createLogger({ name: 'lsp:diagnostics', level: LogLevel.INFO });
  private cache = new Map<string, LspDiagnostic[]>();

  constructor(private readonly client: LspClient) {}

  async getDiagnostics(filePath: string): Promise<LspDiagnostic[]> {
    // Check cache first
    const cached = this.cache.get(filePath);
    if (cached && Date.now() - (cached as unknown as { ts: number; diags: LspDiagnostic[] }).ts < 5000) {
      return (cached as unknown as { ts: number; diags: LspDiagnostic[] }).diags;
    }

    // Use LSP textDocument/diagnostic or textDocument/publishDiagnostics
    const docs = await this.client.getDocumentDiagnostics(filePath);
    
    const entry = { ts: Date.now(), diags: docs } as unknown as LspDiagnostic[];
    this.cache.set(filePath, entry);
    return docs;
  }

  async getProjectDiagnostics(dir: string): Promise<ProjectDiagnostic[]> {
    const diagnostics: ProjectDiagnostic[] = [];
    const clients = this.client.getActiveClients();
    
    for (const { docUri, diags } of clients) {
      if (docUri.startsWith(dir) || docUri.startsWith(dir)) {
        diagnostics.push({ file: docUri, diagnostics: diags });
      }
    }
    
    return diagnostics;
  }

  clearCache(filePath?: string): void {
    if (filePath) {
      this.cache.delete(filePath);
    } else {
      this.cache.clear();
    }
  }

  clearAll(): void {
    this.cache.clear();
  }
}
