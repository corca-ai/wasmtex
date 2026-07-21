import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mergeTailSynctex } from '../synctex/synctex-merge'
import { SynctexParser } from '../synctex/synctex-parser'

/**
 * #99 Phase 2 ground truth: the SyncTeX produced by merging the tail's SyncTeX onto the last
 * full compile's head must agree with a REAL full compile of the same edited document — this is
 * what justifies skipping the reconcile. Compares forward-lookup pages and inverse-lookup lines
 * of the merged data against the full-compile data across the whole document.
 *
 * Opt-in (network + curl + engine assets):
 *   P2GT=1 npx vitest run src/engine/incremental-synctex.smoke.test.ts
 */
const RUN = process.env.P2GT === '1'
const TEXLIVE = 'https://d1jectpaw0dlvl.cloudfront.net/2025/'

function buildDoc(lastMarker: string): string {
  const filler = 'The quick brown fox jumps over the lazy dog across measurable pages. '.repeat(3)
  const N = 6
  const sections = Array.from({ length: N }, (_, i) => {
    const n = i + 1
    const marker = n === N ? lastMarker : `S${n}`
    return `\\section{Section ${n}}\n${filler}\n\nMarker-${n}: ${marker} sits in plain text here.\n\n${filler}\n`
  })
  return (
    '\\documentclass{article}\n\\begin{document}\n' +
    sections.map((s, i) => s + (i < sections.length - 1 ? '\n\\clearpage\n' : '')).join('\n') +
    '\n\\end{document}\n'
  )
}

function mainTag(data: { inputs: Map<number, string> }): number {
  for (const [tag, name] of data.inputs)
    if (name === 'main.tex' || name.endsWith('/main.tex')) return tag
  return -1
}

describe.runIf(RUN)('#99 P2: merged SyncTeX == full-compile SyncTeX', () => {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear end-to-end ground-truth comparison
  it('a tail edit merges to the same page/line mapping a full compile would produce', async () => {
    const { installNodeWorkerHost } = await import('./node-host')
    const { WasmTexPdftexEngine } = await import('./wasmtex-engine')
    const { IncrementalCompiler } = await import('./incremental')
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const ASSET = 'http://assets.local/'
    installNodeWorkerHost({ publicDir: join(root, 'public'), assetBaseUrl: ASSET })
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: ASSET, texliveUrl: TEXLIVE })
    const parser = new SynctexParser()
    try {
      await engine.init()
      const inc = new IncrementalCompiler(engine)

      // 1) Full compile of the base doc → the "last full" head SyncTeX.
      const base = buildDoc('BASE')
      const files = new Map([['main.tex', base]])
      await engine.writeFile('main.tex', base)
      engine.setMainFile('main.tex')
      const full0 = await engine.compile()
      inc.noteFull(base, files)
      expect(full0.synctex).not.toBeNull()
      const headData = await parser.parse(full0.synctex!)

      // 2) Tail edit → incremental result carrying the tail SyncTeX + merge inputs.
      const edited = buildDoc('EDITED')
      const filesE = new Map([['main.tex', edited]])
      const r = await inc.tryIncremental(edited, filesE)
      expect(r).not.toBeNull()
      expect(r!.incremental).toBe(true)
      expect(r!.final).toBe(true)
      expect(r!.headUnchangedSinceFull).toBe(true)
      expect(r!.tailSynctex).not.toBeNull()

      // 3) Merge.
      const tailData = await parser.parse(r!.tailSynctex!)
      const merged = mergeTailSynctex({
        head: headData,
        tail: tailData,
        headPageCount: r!.headPageCount!,
        tailLineOffset: r!.tailLineOffset!,
        mainFile: 'main.tex',
        tailFile: 'tail.tex',
      })
      expect(merged).not.toBeNull()

      // 4) Ground truth: a real full compile of the edited doc.
      await engine.writeFile('main.tex', edited)
      const fullE = await engine.compile()
      const truth = await parser.parse(fullE.synctex!)

      // Same page count.
      expect(merged!.pages.size).toBe(truth.pages.size)

      // 5a) Forward lookup: every main.tex source line the truth knows maps to the SAME page in
      // the merged data (the crux — the tail's doc-line offset lands content on the right page).
      const mTag = mainTag(truth)
      const lines = new Set<number>()
      for (const key of truth.friendIndex!.keys()) {
        const [tag, ln] = key.split(':')
        if (Number(tag) === mTag) lines.add(Number(ln))
      }
      let checked = 0
      let pageMismatch = 0
      for (const line of lines) {
        const t = parser.forwardLookup(truth, 'main.tex', line)
        const m = parser.forwardLookup(merged!, 'main.tex', line)
        if (!t || !m) continue
        checked++
        if (t.page !== m.page) pageMismatch++
      }
      expect(checked).toBeGreaterThan(10)
      expect(pageMismatch).toBe(0) // exact page agreement across the whole document

      // 5b) Inverse lookup on the LAST (edited) page: clicking real node positions resolves to
      // the same source line the full compile would (allow ±1 like the other synctex e2e).
      const lastPage = Math.max(...truth.pages.keys())
      const truthNodes = (truth.pages.get(lastPage) || []).filter(
        (n) => n.input === mTag && n.line > 0 && n.type !== 'vbox',
      )
      let invChecked = 0
      let invClose = 0
      for (let i = 0; i < truthNodes.length; i += Math.max(1, Math.floor(truthNodes.length / 10))) {
        const n = truthNodes[i]!
        const m = parser.inverseLookup(merged!, lastPage, n.h + 1, n.v)
        invChecked++
        if (m && Math.abs(m.line - n.line) <= 1 && m.file === 'main.tex') invClose++
      }
      expect(invChecked).toBeGreaterThan(0)
      expect(invClose).toBe(invChecked) // every sampled click on the edited page resolves correctly
    } finally {
      engine.terminate?.()
    }
  }, 240_000)
})
