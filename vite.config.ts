import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The browser projection proof imports SSR dynamically, outside HTML scanning.
  // Discover it before serving modules to avoid a mid-proof optimizer reload.
  optimizeDeps: { include: ['react-dom/server'] },
  build: { outDir: 'dist/studio', rollupOptions: { input: { studio: 'index.html', export: 'export.html' } } },
  server: { host: '127.0.0.1', strictPort: false },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] },
});
