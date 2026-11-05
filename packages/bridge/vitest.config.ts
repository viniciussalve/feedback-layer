import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // testa contra o fonte do core, sem depender de build prévio
    alias: { '@feedback-layer/core/note': fileURLToPath(new URL('../core/src/note.ts', import.meta.url)) },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
