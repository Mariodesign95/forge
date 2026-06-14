import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@forge/types': path.resolve(__dirname, '../types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: 'localhost',
  },
  build: {
    outDir: '../extension/dist/ui',
    emptyOutDir: true,
  },
});
