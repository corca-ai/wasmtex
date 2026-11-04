import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { TexliveVersion } from '../types'
import { SMOKE_TEXLIVE } from './__tests__/smoke-compile'

/**
 * LuaLaTeX heap checkpoints on the real checkpoint build. Opt-in: it needs an asset set
 * whose `wasmtex/<year>/` holds `wasmtex-luatex-checkpoint.{js,wasm}` and network access
 * to the TeX Live mirror. Run once per annual line:
 *
 *   NODE_COMPILE_SMOKE=1 WASMTEX_SMOKE_PUBLIC_DIR=/path/to/assets \
 *     WASMTEX_SMOKE_TEXLIVE_VERSION=2026 WASMTEX_SMOKE_TEXLIVE_URL=<mirror> \
 *     npx vitest run src/engine/luatex-heap-checkpoints.smoke.test.ts
 */
const RUN = process.env.NODE_COMPILE_SMOKE === '1'
const YEAR = (process.env.WASMTEX_SMOKE_TEXLIVE_VERSION ?? '2026') as TexliveVersion
const PUBLIC =
  process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(import.meta.dirname, '..', '..', 'public')
const ASSET = 'http://assets.local/'

const filler = 'The preview keeps precise typography while the author edits this paragraph. '
const paragraph = (n: number, edit = '') => `\\section{Section ${n}}\n${filler.repeat(6)}${edit}\n`
const doc = (edit = '') =>
  [
    '% !TEX program = lualatex',
    '\\documentclass{article}',
    '\\begin{document}',
    ...Array.from({ length: 12 }, (_, i) => paragraph(i + 1, i === 9 ? edit : '')),
    // An argument spanning lines: the second line is read while the macro scans it.
    '\\newcommand\\spread[1]{#1}\\spread{first half',
    'second half}',
    '\\end{document}',
    '',
  ].join('\n')
const lineOf = (text: string, needle: string) => text.split('\n').indexOf(needle) + 1

/** PDF bytes without the creation dates and document IDs a rerun changes. */
const typeset = (pdf: Uint8Array | null) =>
  pdf
    ? Buffer.from(pdf)
        .toString('latin1')
        .replace(/\/(CreationDate|ModDate)\s*\([^)]*\)/g, '')
        .replace(/\/ID\s*\[[^\]]*\]/g, '')
    : null

/** Page objects, including those inside compressed object streams. */
function pageCount(pdf: Uint8Array | null): number {
  if (!pdf) return 0
  const text = Buffer.from(pdf).toString('latin1')
  let all = text
  for (const match of text.matchAll(/stream\r?\n/g)) {
    const end = text.indexOf('endstream', match.index)
    try {
      all += inflateSync(
        Buffer.from(text.slice(match.index + match[0].length, end), 'latin1'),
      ).toString('latin1')
    } catch {}
  }
  return (all.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
}

describe.runIf(RUN)(`LuaLaTeX heap checkpoints (${YEAR})`, () => {
  it('resumes and previews like a fresh compile, refusing unsafe and oversized states', async () => {
    const { installNodeWorkerHost } = await import('./node-host')
    const { WasmTexLuatexEngine } = await import('./luatex-engine')
    const host = installNodeWorkerHost({ publicDir: PUBLIC, assetBaseUrl: ASSET })
    const options = { assetBaseUrl: ASSET, texliveVersion: YEAR, texliveUrl: SMOKE_TEXLIVE }
    const lab = new WasmTexLuatexEngine({ ...options, luatexHeapCheckpoints: true })
    const reference = new WasmTexLuatexEngine(options)
    try {
      await lab.init()
      await reference.init()
      expect(lab.supportsHeapCheckpoints).toBe(true)
      expect(reference.supportsHeapCheckpoints).toBe(false)
      const source = doc()
      await lab.writeFile('main.tex', source)
      const armed = await lab.compile({
        checkpoints: [
          { id: 'section', line: lineOf(source, '\\section{Section 10}') },
          { id: 'argument', line: lineOf(source, 'second half}') },
        ],
      })
      expect(armed.success).toBe(true)
      expect(armed.heapCheckpoints?.map((record) => record.id)).toEqual(['section'])
      expect(armed.heapCheckpointRefusals).toEqual([{ id: 'argument', reason: 'stack' }])

      for (const edit of [' First edit.', ' A second, longer edit to the same paragraph.']) {
        await lab.writeFile('main.tex', doc(edit))
        await reference.writeFile('main.tex', doc(edit))
        const resumed = await lab.compileFromHeapCheckpoint('section')
        const fresh = await reference.compile()
        expect(resumed.success).toBe(true)
        expect(typeset(resumed.pdf)).toBe(typeset(fresh.pdf))
        const preview = await lab.compileHeapPreview(2, 'section')
        expect(preview?.success).toBe(true)
        expect(pageCount(preview?.pdf ?? null)).toBe(2)
      }
      // The preview put the work directory back: a fresh compile still finds its format.
      expect((await lab.compile()).success).toBe(true)

      lab.setCheckpointBudget(1, 8 * 1024 * 1024)
      const tight = await lab.compile({
        checkpoints: [{ id: 'tight', line: lineOf(source, '\\section{Section 10}') }],
      })
      expect(tight.heapCheckpoints ?? []).toEqual([])
      expect(tight.heapCheckpointRefusals).toMatchObject([{ id: 'tight', reason: 'budget' }])
    } finally {
      lab.terminate()
      reference.terminate()
      host.dispose()
    }
  }, 600_000)
})
