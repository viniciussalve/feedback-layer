import { defineConfig } from 'vitest/config'

// Gera dist/feedback-layer.iife.js para uso por <script src>.
// O tsc (build:tsc) já emitiu os módulos ESM em dist/, por isso emptyOutDir=false.
export default defineConfig({
  build: {
    emptyOutDir: false,
    target: 'es2022',
    lib: {
      entry: 'src/auto.ts',
      formats: ['iife'],
      name: 'FeedbackLayer',
      fileName: () => 'feedback-layer.iife.js',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
})
