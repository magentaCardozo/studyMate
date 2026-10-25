import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, /api est relayé vers l'API Express (même origine → cookies HttpOnly).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:4000', changeOrigin: false } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], css: false },
} as never);
