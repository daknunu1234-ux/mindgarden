import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // server-only throws outside React Server Components; tests import server code directly.
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Some files are CPU-heavy (65 sprite renders, whole-deck grading, the PGlite database tests
    // that run every migration): with all workers busy, a test can pass 5 s without being stuck.
    testTimeout: 20_000,
  },
})
