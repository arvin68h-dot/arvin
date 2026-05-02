// CodeEngine — Project Detection
import { readFileSync, readdirSync, statSync, existsSync, promises as fs } from 'node:fs';
import { join, basename, extname } from 'node:path';
import type { ProjectInfo } from '../types/index.js';
import { Language, BuildSystem } from '../types/index.js';

// Language extensions map
const LANGUAGE_EXTENSIONS: Record<string, Language> = {
  '.cpp': Language.CPP,
  '.cc': Language.CPP,
  '.cxx': Language.CPP,
  '.hh': Language.CPP,
  '.hpp': Language.CPP,
  '.h': Language.CPP,
  '.c': Language.CPP,
  '.cs': Language.CSHARP,
  '.go': Language.GO,
  '.py': Language.PYTHON,
  '.js': Language.JAVASCRIPT,
  '.jsx': Language.JAVASCRIPT,
  '.mjs': Language.JAVASCRIPT,
  '.cjs': Language.JAVASCRIPT,
  '.ts': Language.TYPESCRIPT,
  '.tsx': Language.TYPESCRIPT,
  '.mts': Language.TYPESCRIPT,
  '.cts': Language.TYPESCRIPT,
  '.rs': Language.RUST,
  '.toml': Language.CMAKE, // Cargo.toml
  '.ps1': Language.POWERSHELL,
  '.psm1': Language.POWERSHELL,
  '.psd1': Language.POWERSHELL,
};

// Language header extensions
const HEADER_EXTENSIONS = ['.h', '.hpp', '.hh', '.hxx', '.h++'];

// Build system files
const BUILD_SYSTEM_FILES: Record<string, { system: BuildSystem; config?: string }> = {
  'Makefile': { system: BuildSystem.MAKE },
  'makefile': { system: BuildSystem.MAKE },
  'GNUmakefile': { system: BuildSystem.MAKE },
  'CMakeLists.txt': { system: BuildSystem.CMAKE },
  'CMakeLists.cmake': { system: BuildSystem.CMAKE },
  'package.json': { system: BuildSystem.NPM, config: 'package.json' },
  'pnpm-lock.yaml': { system: BuildSystem.PNPM, config: 'pnpm-lock.yaml' },
  'Cargo.toml': { system: BuildSystem.CARGO, config: 'Cargo.toml' },
};

// Package manager detection
const PACKAGE_MANAGERS = new Map<string, string>([
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['Cargo.lock', 'cargo'],
  ['go.mod', 'go'],
]);

// Files to ignore
const IGNORE_DIRS = new Set(['node_modules', '.git', '.codeengine', 'dist', 'build', '.vscode', '.idea', '.DS_Store']);

/**
 * Detect the project type, languages, build system, and package manager
 * in a given directory.
 */
export function detectProject(dir: string): ProjectInfo {
  const detectedFiles: string[] = [];
  const languages = new Set<Language>();
  let buildSystem: BuildSystem | null = null;
  let packageManager: string | null = null;
  let configFile: string | undefined;

  const dirsToCheck: string[] = [dir];
  const visited = new Set<string>();

  while (dirsToCheck.length > 0) {
    const currentDir = dirsToCheck.shift()!;

    if (visited.has(currentDir)) continue;
    visited.add(currentDir);

    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);

      try {
        const st = statSync(fullPath);

        if (st.isDirectory()) {
          if (!IGNORE_DIRS.has(entry)) {
            dirsToCheck.push(fullPath);
          }
          continue;
        }

        detectedFiles.push(entry);

        // Check build system files
        if (entry in BUILD_SYSTEM_FILES) {
          const info = BUILD_SYSTEM_FILES[entry];
          if (buildSystem === null) {
            buildSystem = info.system;
          }
          if (info.config && configFile === undefined) {
            configFile = info.config;
          }
        }

        // Check package manager
        if (!packageManager && PACKAGE_MANAGERS.has(entry)) {
          packageManager = PACKAGE_MANAGERS.get(entry)!;
        }

        // Detect language from extension
        const ext = extname(entry).toLowerCase();
        if (ext in LANGUAGE_EXTENSIONS) {
          // For header files, map them to their source language
          let lang = LANGUAGE_EXTENSIONS[ext];
          if (HEADER_EXTENSIONS.includes(ext)) {
            // Default headers to CPP
            lang = Language.CPP;
          }
          languages.add(lang);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  }

  return {
    directory: dir,
    languages: Array.from(languages),
    buildSystem,
    packageManager,
    configFile,
    detectedFiles,
  };
}
