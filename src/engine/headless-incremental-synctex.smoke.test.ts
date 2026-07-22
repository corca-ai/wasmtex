import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SynctexParser } from '../synctex/synctex-parser'
import { buildSectionedDoc as buildDoc, SMOKE_TEXLIVE as TEXLIVE } from './__tests__/smoke-compile'

/**
 * #99 P2 (host-integration path): the headless `WasmTexCompiler({ incremental: true })` — which a host app
 * uses, reading `result.synctex`/`synctexData` for its own inverse search — must return exact
 * spliced `synctexData` on an incremental fast paint, so click-to-source stays correct.
 *
 *   P2GT=1 npx vitest run src/engine/headless-incremental-synctex.smoke.test.ts
 */
const RUN = process.env.P2GT === '1'
const ASSET = 'http://assets.local/'

async function makeCompiler(mainTex: string, incremental: boolean) {
  const { installNodeWorkerHost } = await import('./node-host')
  const { WasmTexCompiler } = await import('../headless')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  installNodeWorkerHost({ publicDir: join(root, 'public'), assetBaseUrl: ASSET })
  return new WasmTexCompiler({
    engine: 'pdflatex',
    assetBaseUrl: ASSET,
    texliveUrl: TEXLIVE,
    files: { 'main.tex': mainTex },
    incremental,
  })
}

describe.runIf(RUN)('#99 P2: headless WasmTexCompiler returns spliced synctexData', () => {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear end-to-end smoke
  it('an incremental fast paint carries exact synctexData while synctex stays null', async () => {
    const parser = new SynctexParser()
    const c = await makeCompiler(buildDoc('BASE'), true)
    try {
      await c.init()
      const full = await c.compile() // seeds the head merge-base
      expect(full.synctex).not.toBeNull()
      expect(full.synctexData ?? null).toBeNull() // full compile: raw bytes, no pre-parsed data

      // Edit the last section (final tail edit) → fast paint.
      c.setFile('main.tex', buildDoc('EDITED'))
      const fast = await c.compile()
      // The host contract: synctex bytes null on a fast paint, but synctexData is the exact splice.
      expect(fast.success).toBe(true)
      expect(fast.synctex).toBeNull()
      expect(fast.synctexData, 'fast paint must carry spliced synctexData').not.toBeNull()

      // Ground truth: inverse lookups on the merged data match a full compile of the edited doc.
      const truthC = await makeCompiler(buildDoc('EDITED'), false)
      let truthData: Awaited<ReturnType<SynctexParser['parse']>>
      try {
        await truthC.init()
        const t = await truthC.compile()
        truthData = await parser.parse(t.synctex!)
      } finally {
        truthC.dispose?.()
      }
      const merged = fast.synctexData!
      expect(merged.pages.size).toBe(truthData.pages.size)
      const lastPage = Math.max(...truthData.pages.keys())
      let mTag = -1
      for (const [tag, name] of truthData.inputs)
        if (name === 'main.tex' || name.endsWith('/main.tex')) mTag = tag
      const nodes = (truthData.pages.get(lastPage) || []).filter(
        (n) => n.input === mTag && n.line > 0 && n.type !== 'vbox',
      )
      let checked = 0
      let ok = 0
      for (let i = 0; i < nodes.length; i += Math.max(1, Math.floor(nodes.length / 8))) {
        const n = nodes[i]!
        const inv = parser.inverseLookup(merged, lastPage, n.h + 1, n.v)
        checked++
        if (inv && Math.abs(inv.line - n.line) <= 1 && inv.file === 'main.tex') ok++
      }
      expect(checked).toBeGreaterThan(0)
      expect(ok).toBe(checked)
    } finally {
      c.dispose?.()
    }
  }, 240_000)
})
