import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['e2e/**/*.test.ts', 'setup.ts'],
    testTimeout: 60000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@codeengine/core': path.resolve(__dirname, '../packages/core/src/index.ts'),
      '@codeengine/engine': path.resolve(__dirname, '../packages/engine/src/index.ts'),
      '@codeengine/storage': path.resolve(__dirname, '../packages/storage/src/index.ts'),
      '@codeengine/tool': path.resolve(__dirname, '../packages/tool/src/index.ts'),
    },
  },
});
