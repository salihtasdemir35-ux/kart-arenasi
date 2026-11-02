import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@kart/engine': path.resolve(__dirname, 'packages/engine/src/index.ts') } },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/server/test/**/*.test.ts', 'apps/client/test/**/*.test.tsx'],
    environmentMatchGlobs: [['apps/client/test/**', 'jsdom']],
    testTimeout: 60000,
  },
});
