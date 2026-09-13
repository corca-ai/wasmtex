import { copyFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { installNodeWorkerHost } from './node-host'
import { smokeTexliveProfile } from './smoke-texlive-profile'
import { WasmTexPdftexEngine } from './wasmtex-engine'

const root = fileURLToPath(new URL('../../', import.meta.url))
const profile = smokeTexliveProfile()
let staged = ''

describe.runIf(process.env.NODE_COMPILE_SMOKE === '1')(
  'authored pdfTeX cold format on WASM',
  () => {
    beforeAll(() => {
      staged = mkdtempSync(join(tmpdir(), 'wasmtex-cold-format-'))
      const assets = join(staged, 'wasmtex', profile.version)
      cpSync(
        join(
          process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(root, 'public'),
          'wasmtex',
          profile.version,
        ),
        assets,
        { recursive: true },
      )
      // Exercise this checkout's controller against the pinned generated core.
      // The staged tree is test-only; published assets and receipts stay untouched.
      copyFileSync(
        join(root, 'wasm-build/pdftex-worker.js'),
        join(assets, 'wasmtex-pdftex.worker.js'),
      )
    })
    afterAll(() => {
      if (staged) rmSync(staged, { recursive: true, force: true })
    })

    it.each([
      true,
      false,
    ])('preserves cold/repeat/edited input (disablePreambleSnapshot=%s)', async (disablePreambleSnapshot) => {
      const host = installNodeWorkerHost({
        publicDir: staged,
        assetBaseUrl: 'http://assets.local/',
      })
      const engine = new WasmTexPdftexEngine({
        assetBaseUrl: 'http://assets.local/',
        texliveVersion: profile.version,
        texliveUrl: profile.url,
        skipFormatPreload: true,
        disablePreambleSnapshot,
      })
      const main =
        '\\documentclass{article}\n\\begin{document}\n\\input{nested/body.tex}\n\\end{document}'
      try {
        await engine.init()
        await engine.mkdir('nested')
        await engine.writeFile('main.tex', main)
        engine.setMainFile('main.tex')
        for (const [index, name] of ['cold', 'cold', 'changed'].entries()) {
          await engine.writeFile('nested/body.tex', `\\section{${name}}\\label{${name}} Body.`)
          const result = await engine.compile()
          expect(result.success, result.log).toBe(true)
          expect(result.pdf?.length).toBeGreaterThan(0)
          expect(result.synctex?.length).toBeGreaterThan(0)
          if (!disablePreambleSnapshot) {
            expect(result.preambleSnapshot).toBe(true)
            expect(result.preambleRebuilt).toBe(index === 0)
          }
          if (index === 0) expect(result.format?.length).toBeGreaterThan(0)
          else expect(result.format).toBeUndefined()
          expect(await engine.readFile('main.tex')).toBe(main)
          expect(await engine.readFile('main.aux')).toContain(`\\newlabel{${name}}`)
        }
      } finally {
        engine.terminate()
        host.dispose()
      }
    }, 240_000)
  },
)
