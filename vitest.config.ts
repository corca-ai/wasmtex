import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    alias: {
      'monaco-editor': path.resolve(__dirname, 'src/__mocks__/monaco-editor.ts'),
    },
    coverage: {
      provider: 'v8',
      // text-summary + text print to the CI log; html/lcov are uploaded as an artifact.
      reporter: ['text-summary', 'text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Count every source file, not just those a test imports, so untested files
      // show up as 0% rather than silently vanishing from the denominator.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.smoke.test.ts',
        'src/**/__tests__/**',
        'src/**/__mocks__/**',
        'src/**/*.d.ts',
        // These integration drivers also have focused unit/protocol tests, but
        // their partial instrumentation is not an end-to-end coverage measure.
        // Keep runtime qualifications and remaining gaps in docs/testing-map.md.
        // The pure worker-host seam and BaseWorkerEngine request queue are now
        // included: both are directly exercised without generated WASM or a DOM.
        'src/main.ts',
        'src/wasmtex.ts',
        'src/headless.ts',
        'src/index.ts',
        'src/lsp.ts',
        'src/lsp-monaco.ts',
        'src/node.ts',
        'src/synctex.ts',
        'src/warmup.ts',
        'src/component-types.ts',
        'src/editor/**',
        'src/viewer/pdf-viewer.ts',
        'src/viewer/page-renderer.ts',
        'src/engine/wasmtex-worker.ts',
        'src/engine/wasmtex-engine.ts',
        'src/engine/tex-fmt-engine.ts',
        'src/engine/bibtex-engine.ts',
        'src/engine/makeindex-engine.ts',
        'src/engine/xetex-engine.ts',
        'src/engine/node-host.ts',
        'src/engine/warmup.ts',
        'src/lsp/language-feature-providers.ts',
        'src/lsp/register-providers.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
})
