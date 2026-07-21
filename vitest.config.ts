import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    alias: {
      'monaco-editor': path.resolve(__dirname, 'src/__mocks__/monaco-editor.ts'),
    },
  },
})
