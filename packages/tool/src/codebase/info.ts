import * as fs from 'fs';
import * as path from 'path';
import { createLogger, type RuntimeContext, LogLevel } from '@codeengine/core';

export function createCodebaseInfoTool() {
  const logger = createLogger({ name: 'tool:codebase_info', level: LogLevel.INFO });

  return {
    name: 'codebase_info',
    description: 'Get project overview: file tree (first 50), dependency files, detected build systems and languages.',
    execute: async (_input: Record<string, unknown>, ctx: RuntimeContext) => {
      const root = ctx.workspaceRoot;

      function tree(dir: string, prefix = ''): string[] {
        if (prefix.length > 200) return [];
        const entries: string[] = [];
        try {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of items) {
            const name = entry.name;
            if (name.startsWith('.') || name.startsWith('node_modules') || name.startsWith('dist')) continue;
            entries.push(`${prefix}${name}`);
            if (entries.length > 50) break;
            const full = path.join(dir, name);
            if (fs.statSync(full).isDirectory()) {
              entries.push(...tree(full, prefix + '  '));
            }
          }
        } catch {
          // ignore
        }
        return entries;
      }

      const depFiles = ['package.json', 'Cargo.toml', 'go.mod', 'pom.xml', 'CMakeLists.txt', 'Makefile', 'setup.py', 'pyproject.toml'];
      const foundDeps = depFiles.filter(f => fs.existsSync(path.join(root, f)));

      const builds = ['Makefile', 'CMakeLists.txt', 'package.json', 'build.gradle', 'Cargo.toml', 'go.mod'];
      const detectedBuilds = builds.filter(f => fs.existsSync(path.join(root, f)));

      const langExt: Record<string, string[]> = {
        'C/C++': ['.cpp', '.hpp', '.c', '.h', '.cc', '.hh'],
        'Python': ['.py', '.pyx'],
        'TypeScript/JS': ['.ts', '.tsx', '.js', '.jsx'],
        'Go': ['.go'],
        'Rust': ['.rs'],
        'C#': ['.cs'],
        'CATIA': ['.CATPart', '.CATProduct', '.CATDrawing'],
      };

      const detectedLangs: string[] = [];
      for (const [lang, exts] of Object.entries(langExt)) {
        for (const ext of exts) {
          const count = countFiles(root, ext);
          if (count > 0) {
            detectedLangs.push(`${lang} (${count} files)`);
            break;
          }
        }
      }

      const fileTree = tree(root).join('\n');
      const output = [
        '=== Codebase Overview ===',
        `Root: ${root}`,
        '',
        `Detected Build Systems: ${detectedBuilds.length > 0 ? detectedBuilds.join(', ') : 'None detected'}`,
        `Detected Languages: ${detectedLangs.length > 0 ? detectedLangs.join(', ') : 'None detected'}`,
        '',
        `Dependency Files: ${foundDeps.length > 0 ? foundDeps.join(', ') : 'None found'}`,
        '',
        `File Tree (first 50):\n${fileTree || '(empty)'}`,
      ].join('\n');

      return { success: true, content: output };
    },
  };
}

function countFiles(dir: string, ext: string): number {
  let count = 0;
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of items) {
      const name = entry.name;
      const full = path.join(dir, name);
      if (entry.isDirectory()) {
        if (name === 'node_modules' || name === '.git' || name.startsWith('.')) continue;
        count += countFiles(full, ext);
      } else if (name.endsWith(ext)) {
        count++;
      }
    }
  } catch {
    // ignore
  }
  return count;
}
