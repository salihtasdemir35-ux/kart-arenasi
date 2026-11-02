import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@kart/engine': path.resolve(__dirname, '../../packages/engine/src/index.ts') } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
