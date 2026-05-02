// CodeEngine LSP — Language detection and server mapping
import * as path from 'path';

export interface LanguageInfo {
  languageId: string;
  fileExtensions: string[];
  filenames: string[];
  serverCommand: string;
  serverArgs?: string[];
  initializationOptions?: Record<string, unknown>;
}

const KNOWN_LANGUAGES: LanguageInfo[] = [
  {
    languageId: 'typescript',
    fileExtensions: ['.ts', '.tsx'],
    filenames: [],
    serverCommand: 'typescript-language-server',
    serverArgs: ['--stdio'],
    initializationOptions: { hostInfo: 'codeengine' },
  },
  {
    languageId: 'javascript',
    fileExtensions: ['.js', '.jsx', '.mjs'],
    filenames: [],
    serverCommand: 'typescript-language-server',
    serverArgs: ['--stdio'],
    initializationOptions: { hostInfo: 'codeengine' },
  },
  {
    languageId: 'go',
    fileExtensions: ['.go'],
    filenames: [],
    serverCommand: 'gopls',
    serverArgs: ['serve'],
    initializationOptions: { staticcheck: false },
  },
  {
    languageId: 'rust',
    fileExtensions: ['.rs'],
    filenames: [],
    serverCommand: 'rust-analyzer',
    serverArgs: [],
    initializationOptions: {},
  },
  {
    languageId: 'c',
    fileExtensions: ['.c', '.h'],
    filenames: [],
    serverCommand: 'clangd',
    serverArgs: ['--clangd-filename=clangd'],
    initializationOptions: {},
  },
  {
    languageId: 'cpp',
    fileExtensions: ['.cpp', '.hpp', '.cc', '.hh', '.cxx', '.hxx'],
    filenames: [],
    serverCommand: 'clangd',
    serverArgs: ['--clangd-filename=clangd'],
    initializationOptions: {},
  },
  {
    languageId: 'python',
    fileExtensions: ['.py', '.pyi'],
    filenames: [],
    serverCommand: 'pyright-langserver',
    serverArgs: ['--stdio'],
    initializationOptions: { diagnosticMode: 'openFilesOnly' },
  },
  {
    languageId: 'json',
    fileExtensions: ['.json', '.jsonc'],
    filenames: [],
    serverCommand: 'json-lsp',
    serverArgs: ['--stdio'],
    initializationOptions: {},
  },
];

export class LanguageMapper {
  private static _instance: LanguageMapper | null = null;

  private constructor() {}

  static getInstance(): LanguageMapper {
    if (!LanguageMapper._instance) {
      LanguageMapper._instance = new LanguageMapper();
    }
    return LanguageMapper._instance;
  }

  detectLanguage(filePath: string): LanguageInfo | null {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    for (const lang of KNOWN_LANGUAGES) {
      if (lang.fileExtensions.includes(ext)) return lang;
      if (lang.filenames.includes(basename)) return lang;
    }
    return null;
  }

  detectFromExtension(ext: string): LanguageInfo | null {
    const normalized = ext.startsWith('.') ? ext : `.${ext}`;
    for (const lang of KNOWN_LANGUAGES) {
      if (lang.fileExtensions.includes(normalized)) return lang;
    }
    return null;
  }

  getKnownLanguages(): LanguageInfo[] {
    return [...KNOWN_LANGUAGES];
  }
}
