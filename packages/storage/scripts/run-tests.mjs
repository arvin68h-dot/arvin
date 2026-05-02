// @ts-nocheck
// Storage Unit Tests runner — each test file runs in its own Node.js process
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, '..');
const TEST_DB = path.join(STORAGE_DIR, 'test-codeengine.db');

const TEST_FILES = [
  'src/tests/test-sessions.ts',
  'src/tests/test-messages.ts',
  'src/tests/test-skills.ts',
  'src/tests/test-tasks.ts',
  'src/tests/test-remaining.ts',
];

let passed = 0, failed = 0;
const results = [];

function runTestFile(file) {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', '--test', file], {
      cwd: STORAGE_DIR,
      env: { ...process.env, CODEENGINE_DATA_DIR: TEST_DB },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        passed++;
        results.push('  ✓ ' + path.basename(file));
      } else {
        failed++;
        results.push('  ✗ ' + path.basename(file) + ' (exit ' + code + ')');
        const match = stderr.match(/error: '\\s*([^\n]+)/) || stdout.match(/error: '\\s*([^\n]+)/);
        if (match) results.push('      ' + match[1]);
      }
      resolve(code === 0);
    });
  });
}

(async () => {
  console.log('');
  for (const file of TEST_FILES) {
    await runTestFile(file);
  }
  results.forEach(r => console.log(r));
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════');
  console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed);
  console.log('═══════════════════════════════════════════');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
})();