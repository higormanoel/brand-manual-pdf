import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/studio', rollupOptions: { input: { studio: 'index.html', export: 'export.html' } } },
  server: { host: '127.0.0.1', strictPort: false },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] },
});
