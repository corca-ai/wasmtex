import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe.each(['xetex', 'luatex', 'dvipdfm'])('%s cache transfer', (engine) => {
  it('returns independently owned file bytes without detaching cached files or aliases', () => {
    const original = new Uint8Array([0, 13, 255, 17])
    const responses: Array<{ files: Array<{ filename: string; data: ArrayBuffer }> }> = []
    const scope = createContext({
      importScripts() {},
      FS: { readFile: () => original.slice() },
      postMessage(message: unknown, transfer: ArrayBuffer[]) {
        responses.push(structuredClone(message, { transfer }) as (typeof responses)[number])
      },
    })
    scope.self = scope
    runInContext(
      readFileSync(new URL(`../../wasm-build/${engine}-worker.js`, import.meta.url), 'utf8'),
      scope,
    )
    runInContext(
      "texlive200['47/font.otf'] = '/tex/font.otf'; texlive200['36/font'] = '/tex/font.otf'",
      scope,
    )
    for (let i = 0; i < 2; i++) {
      runInContext("self.onmessage({ data: { cmd: 'dumpcache' } })", scope)
      const files = responses[i]!.files
      expect(files.map((file) => file.filename)).toEqual(['font.otf', 'font'])
      for (const file of files) expect(new Uint8Array(file.data)).toEqual(original)
      expect(original.byteLength).toBe(4)
    }
  })
})
