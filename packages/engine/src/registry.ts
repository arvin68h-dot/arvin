// ─── Engine Registry ───
// Concrete implementation of the EngineRegistry interface.
// Maps Language -> LanguageEngine, tracks configs, provides file->engine lookup.

import type {
  LanguageEngine,
  EngineRegistry,
  EngineConfig,
  EngineStatus,
} from '@codeengine/core';
import { Language, BuildSystem, InstallSystem } from '@codeengine/core';

// Map of file extension -> Language for file-based engine lookup
const EXTENSION_MAP: Record<string, Language> = {
  '.cpp': Language.CPP, '.hpp': Language.CPP, '.cc': Language.CPP,
  '.h': Language.CPP, '.cxx': Language.CPP, '.hxx': Language.CPP,
  '.py': Language.PYTHON, '.pyi': Language.PYTHON, '.pyx': Language.PYTHON,
  '.js': Language.JAVASCRIPT, '.jsx': Language.JAVASCRIPT, '.mjs': Language.JAVASCRIPT,
  '.cjs': Language.JAVASCRIPT,
  '.ts': Language.TYPESCRIPT, '.tsx': Language.TYPESCRIPT, '.mts': Language.TYPESCRIPT,
  '.cts': Language.TYPESCRIPT,
  '.go': Language.GO, '.mod': Language.GO, '.sum': Language.GO,
  '.rs': Language.RUST,
  '.cs': Language.CSHARP, '.csproj': Language.CSHARP, '.sln': Language.CSHARP,
  '.ps1': Language.POWERSHELL, '.psm1': Language.POWERSHELL, '.psd1': Language.POWERSHELL,
  '.cmake': Language.CMAKE,
  '.CATPart': Language.CATIA, '.CATProduct': Language.CATIA,
  '.CATDrawing': Language.CATIA, '.cls': Language.CATIA, '.CATScript': Language.CATIA,
};

export class EngineRegistryImpl implements EngineRegistry {
  private engines = new Map<Language, LanguageEngine>();
  private configs = new Map<Language, EngineConfig>();

  register(engine: LanguageEngine): void {
    const status = engine.status();
    if (!status.language) return;
    this.engines.set(status.language, engine);
  }

  unregister(language: Language): void {
    this.engines.delete(language);
    this.configs.delete(language);
  }

  get(language: Language): LanguageEngine | undefined {
    return this.engines.get(language);
  }

  getAll(): LanguageEngine[] {
    return Array.from(this.engines.values());
  }

  getStatuses(): EngineStatus[] {
    return Array.from(this.engines.values()).map(e => e.status());
  }

  findForLanguage(lang: Language): LanguageEngine | undefined {
    return this.engines.get(lang);
  }

  findForFile(filePath: string): LanguageEngine | undefined {
    const ext = '.' + filePath.split('.').pop()?.toLowerCase();
    const lang = EXTENSION_MAP[ext || ''];
    if (lang) return this.engines.get(lang);
    return undefined;
  }

  getConfig(language: Language): EngineConfig | undefined {
    return this.configs.get(language);
  }

  setConfig(language: Language, config: EngineConfig): void {
    this.configs.set(language, config);
  }

  async initializeAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [lang, engine] of this.engines.entries()) {
      const config = this.configs.get(lang);
      if (config) {
        promises.push(engine.init(config).catch(err => {
          console.warn(`Failed to initialize engine ${lang}: ${err.message}`);
        }));
      } else {
        promises.push(engine.init({
          language: lang,
          buildSystem: lang === Language.CMAKE ? BuildSystem.CMAKE : BuildSystem.AUTO,
          installSystem: InstallSystem.SYSTEM,
          problemPatterns: [],
        }).catch(err => {
          console.warn(`Failed to initialize engine ${lang}: ${err.message}`);
        }));
      }
    }
    await Promise.all(promises);
  }

  // Auto-register built-in engines with default configs
  autoRegisterAll(): void {
    // Called by consumers after they create engine instances
  }
}

// ── Singleton ──

let _registry: EngineRegistryImpl | null = null;

export function createEngineRegistry(): EngineRegistry {
  if (!_registry) {
    _registry = new EngineRegistryImpl();
  }
  return _registry;
}

export function getEngineRegistry(): EngineRegistry {
  if (!_registry) {
    _registry = new EngineRegistryImpl();
  }
  return _registry;
}
