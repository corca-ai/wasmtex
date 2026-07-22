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
      ],
      // No thresholds yet — this is reporting-only until we have a baseline to gate on.
    },
  },
})
