import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SynctexParser } from '../synctex/synctex-parser'
import { buildSectionedDoc as buildDoc, SMOKE_TEXLIVE as TEXLIVE } from './__tests__/smoke-compile'
import type { FileSet, IncrementalCompiler } from './incremental'
import type { WasmTexPdftexEngine } from './wasmtex-engine'

/**
 * #99 Phase 2 ground truth: the SyncTeX produced by merging the tail's SyncTeX onto the last
 * full compile's head must agree with a REAL full compile of the same edited document — this is
 * what justifies skipping the reconcile. Compares forward-lookup pages and inverse-lookup lines
 * of the merged data against the full-compile data across the whole document, for both a
 * single-file edit and a multi-file (`\include`d chapter) edit.
 *
 * Opt-in (network + curl + engine assets):
 *   P2GT=1 npx vitest run src/engine/incremental-synctex.smoke.test.ts
 */
const RUN = process.env.P2GT === '1'

type Doc = { source: string; files: FileSet }
type Parsed = Awaited<ReturnType<SynctexParser['parse']>>

/** Boot a node-host engine + a fresh IncrementalCompiler/parser, run `fn`, always terminate. */
async function withEngine(
  fn: (
    engine: WasmTexPdftexEngine,
    inc: IncrementalCompiler,
    parser: SynctexParser,
  ) => Promise<void>,
): Promise<void> {
  const { installNodeWorkerHost } = await import('./node-host')
  const { WasmTexPdftexEngine: Engine } = await import('./wasmtex-engine')
  const { IncrementalCompiler: Inc } = await import('./incremental')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const ASSET = 'http://assets.local/'
  installNodeWorkerHost({ publicDir: join(root, 'public'), assetBaseUrl: ASSET })
  const engine = new Engine({ assetBaseUrl: ASSET, texliveUrl: TEXLIVE })
  try {
    await engine.init()
    await fn(engine, new Inc(engine), new SynctexParser())
  } finally {
    engine.terminate?.()
  }
}

/** Seed a full compile of `base` (→ `noteFull` head merge-base), apply the `edited` tail edit via
 *  the incremental fast path, then full-compile the edited doc as ground truth. Returns the merged
 *  (spliced) SyncTeX and the full-compile truth so each test asserts its own invariants. */
async function mergedVsTruth(
  engine: WasmTexPdftexEngine,
  inc: IncrementalCompiler,
  parser: SynctexParser,
  base: Doc,
  edited: Doc,
): Promise<{ merged: Parsed; truth: Parsed }> {
  for (const [name, content] of base.files) await engine.writeFile(name, content)
  engine.setMainFile('main.tex')
  const full0 = await engine.compile()
  expect(full0.synctex).not.toBeNull()
  inc.noteFull(base.source, base.files, full0.synctex)

  // The engine FS now carries the edited files; the fast path reads chapters from it, and the
  // subsequent full compile (ground truth) sees the same edited document.
  for (const [name, content] of edited.files) await engine.writeFile(name, content)
  const r = await inc.tryIncremental(edited.source, edited.files)
  expect(r).not.toBeNull()
  expect(r!.incremental).toBe(true)
  expect(r!.final).toBe(true)
  expect(r!.synctexData).not.toBeNull()

  const fullE = await engine.compile()
  const truth = await parser.parse(fullE.synctex!)
  return { merged: r!.synctexData!, truth }
}

function mainTag(data: { inputs: Map<number, string> }): number {
  for (const [tag, name] of data.inputs)
    if (name === 'main.tex' || name.endsWith('/main.tex')) return tag
  return -1
}

/** For every source file+line the full-compile `truth` knows, forward-lookup in both `truth` and
 *  `merged` and count how many land on a different page. Zero mismatches ⇒ the splice reproduces
 *  the full compile's page mapping across every file (main + `\include`d chapters). */
function forwardPageMismatch(
  parser: SynctexParser,
  truth: Parsed,
  merged: Parsed,
): { checked: number; mismatch: number } {
  let checked = 0
  let mismatch = 0
  for (const [tag, file] of truth.inputs) {
    if (file.endsWith('.aux')) continue
    for (const key of truth.friendIndex!.keys()) {
      const [t, ln] = key.split(':')
      if (Number(t) !== tag) continue
      const tr = parser.forwardLookup(truth, file, Number(ln))
      const me = parser.forwardLookup(merged, file, Number(ln))
      if (!tr || !me) continue
      checked++
      if (tr.page !== me.page) mismatch++
    }
  }
  return { checked, mismatch }
}

/** A main file that `\include`s three chapters (each `\include` forces a `\clearpage`, so each
 *  chapter is its own page boundary) plus the chapter bodies. Chapters are padded past the
 *  checkpoint's min-head-bytes so an edit to the last one still takes the fast path. */
function buildMultiFile(
  ch3Marker: string,
): { main: string } & Record<'ch1' | 'ch2' | 'ch3', string> {
  const filler =
    'The quick brown fox jumps over the lazy dog across many measurable pages. '.repeat(12)
  const chapter = (n: number, marker: string) =>
    `\\section{Chapter ${n}}\n${filler}\n\nMarker-${n}: ${marker} sits in plain text.\n\n${filler}\n`
  return {
    main: '\\documentclass{article}\n\\begin{document}\n\\include{ch1}\n\\include{ch2}\n\\include{ch3}\n\\end{document}\n',
    ch1: chapter(1, 'C1'),
    ch2: chapter(2, 'C2'),
    ch3: chapter(3, ch3Marker),
  }
}

describe.runIf(RUN)('#99 P2: merged SyncTeX == full-compile SyncTeX', () => {
  it('a single-file tail edit merges to the same page/line mapping a full compile would produce', async () => {
    await withEngine(async (engine, inc, parser) => {
      const base = buildDoc('BASE')
      const edited = buildDoc('EDITED')
      const { merged, truth } = await mergedVsTruth(
        engine,
        inc,
        parser,
        { source: base, files: new Map([['main.tex', base]]) },
        { source: edited, files: new Map([['main.tex', edited]]) },
      )

      // Same page count.
      expect(merged.pages.size).toBe(truth.pages.size)

      // Forward lookup: every main.tex source line the truth knows maps to the SAME page in the
      // merged data (the crux — the tail's doc-line offset lands content on the right page).
      const { checked, mismatch } = forwardPageMismatch(parser, truth, merged)
      expect(checked).toBeGreaterThan(10)
      expect(mismatch).toBe(0) // exact page agreement across the whole document

      // Inverse lookup on the LAST (edited) page: clicking real node positions resolves to the same
      // source line the full compile would (allow ±1 like the other synctex e2e).
      const mTag = mainTag(truth)
      const lastPage = Math.max(...truth.pages.keys())
      const truthNodes = (truth.pages.get(lastPage) || []).filter(
        (n) => n.input === mTag && n.line > 0 && n.type !== 'vbox',
      )
      let invChecked = 0
      let invClose = 0
      for (let i = 0; i < truthNodes.length; i += Math.max(1, Math.floor(truthNodes.length / 10))) {
        const n = truthNodes[i]!
        const m = parser.inverseLookup(merged, lastPage, n.h + 1, n.v)
        invChecked++
        if (m && Math.abs(m.line - n.line) <= 1 && m.file === 'main.tex') invClose++
      }
      expect(invChecked).toBeGreaterThan(0)
      expect(invClose).toBe(invChecked) // every sampled click on the edited page resolves correctly
    })
  }, 240_000)

  it('a multi-file tail edit merges the edited chapter at file-relative lines like a full compile', async () => {
    await withEngine(async (engine, inc, parser) => {
      const base = buildMultiFile('C3-BASE')
      const edited = buildMultiFile(
        'C3-EDITED with substantially more marker text to reflow the page',
      )
      const baseFiles: FileSet = new Map([
        ['main.tex', base.main],
        ['ch1.tex', base.ch1],
        ['ch2.tex', base.ch2],
        ['ch3.tex', base.ch3],
      ])
      const editedFiles: FileSet = new Map(baseFiles)
      editedFiles.set('ch3.tex', edited.ch3) // only the LAST chapter changes; the head is untouched
      const { merged, truth } = await mergedVsTruth(
        engine,
        inc,
        parser,
        { source: base.main, files: baseFiles },
        { source: base.main, files: editedFiles }, // main.tex itself is unchanged — the edit is in ch3
      )

      // Same page count.
      expect(merged.pages.size).toBe(truth.pages.size)

      // Forward page mapping agrees across EVERY file — main.tex AND ch1/ch2/ch3 — proving the
      // chapters are spliced at their file-relative lines, not misattributed to the main tag.
      const { checked, mismatch } = forwardPageMismatch(parser, truth, merged)
      expect(checked).toBeGreaterThan(10)
      expect(mismatch).toBe(0)

      // The edited chapter is present in the merged inputs under its own name (not folded into main),
      // and inverse-clicking its nodes on the last page resolves to ch3.tex at file-relative lines.
      const ch3In = (data: Parsed) => [...data.inputs].find(([, n]) => n.endsWith('ch3.tex'))?.[0]
      expect(ch3In(merged)).toBeDefined()
      const truthCh3 = ch3In(truth)!
      const lastPage = Math.max(...truth.pages.keys())
      const ch3Nodes = (truth.pages.get(lastPage) || []).filter(
        (n) => n.input === truthCh3 && n.line > 0 && n.type !== 'vbox',
      )
      let invChecked = 0
      let invClose = 0
      for (let i = 0; i < ch3Nodes.length; i += Math.max(1, Math.floor(ch3Nodes.length / 8))) {
        const n = ch3Nodes[i]!
        const m = parser.inverseLookup(merged, lastPage, n.h + 1, n.v)
        invChecked++
        if (m && Math.abs(m.line - n.line) <= 1 && m.file.endsWith('ch3.tex')) invClose++
      }
      expect(invChecked).toBeGreaterThan(0)
      expect(invClose).toBe(invChecked)
    })
  }, 240_000)
})
