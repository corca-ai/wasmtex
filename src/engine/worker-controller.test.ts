import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..', 'wasm-build')
const ENGINES = ['pdftex', 'bibtex', 'bibtex8', 'makeindex', 'xetex', 'dvipdfm', 'luatex'] as const
const HOOKS: Record<(typeof ENGINES)[number], readonly string[]> = {
  pdftex: ['kpse_find_file_impl', 'kpse_find_pk_impl'],
  bibtex: ['kpse_find_file_impl'],
  bibtex8: ['kpse_find_file_impl'],
  makeindex: ['kpse_find_file_impl'],
  xetex: ['kpse_find_file_impl', 'fontconfig_search_font_impl'],
  dvipdfm: ['kpse_find_file_impl'],
  luatex: ['kpse_find_file_impl', 'fontconfig_search_font_impl'],
}

describe('authored worker controllers', () => {
  for (const engine of ENGINES) {
    it(`${engine} publishes policy separately from its generated module`, () => {
      const source = readFileSync(join(ROOT, `${engine}-worker.js`), 'utf8')
      expect(source).toContain('self.Module = {}')
      expect(source).toContain(`wasmtex-${engine}.js`)

      const importAt = source.lastIndexOf('importScripts(')
      expect(importAt).toBeGreaterThan(0)
      for (const hook of HOOKS[engine]) {
        expect(source.slice(0, importAt)).toContain(`self.${hook} = ${hook}`)
      }
      expect(source.slice(importAt)).toMatch(/^importScripts\([\s\S]*\)\s*;?\s*$/)
    })
  }
})
