import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/env.ts'],
    // Les tests d'intégration partagent une base : exécution séquentielle des fichiers.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
