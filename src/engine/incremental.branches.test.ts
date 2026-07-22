import { PDFDocument } from 'pdf-lib'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CompileResult } from '../types'
import { type FileSet, IncrementalCompiler, type IncrementalResult } from './incremental'
import type { WasmTexPdftexEngine } from './wasmtex-engine'

async function makePdf(n: number): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  for (let i = 0; i < n; i++) d.addPage([200, 200])
  return d.save()
}

/** A minimal, valid SyncTeX body: preamble + one page + one hbox node on source line 1,
 *  with a single `Input:1:<name>` mapping — enough for {@link mergeTailSynctex} to find the
 *  main/tail tags and produce a merged result. */
function synctexBytes(inputName: string): Uint8Array {
  const text = [
    'SyncTeX Version:1',
    `Input:1:${inputName}`,
    'Magnification:1000',
    'Unit:1',
    'X Offset:0',
    'Y Offset:0',
    'Content:',
    '{1',
    '(1,1:100,100:1000,1000,0',
    ')',
    '}',
    'Postamble:',
    '',
  ].join('\n')
  return new TextEncoder().encode(text)
}

const HEAD_SYNCTEX = synctexBytes('main.tex')
const TAIL_SYNCTEX = synctexBytes('tail.tex')

/** Configurable engine stand-in: lets a test dictate the SyncTeX bytes each compile path
 *  returns, the tail status, and whether the checkpoint build yields a head PDF. */
class SynctexMockEngine {
  fullCalls = 0
  buildCalls = 0
  tailCalls = 0
  tailStatus = 0
  fullSynctex: Uint8Array | null = null
  tailSynctex: Uint8Array | null = null
  headPdfNull = false
  async writeFile(_p: string, _c: string): Promise<void> {}
  async compile(): Promise<CompileResult> {
    this.fullCalls++
    return {
      success: true,
      pdf: await makePdf(5),
      log: 'full',
      errors: [],
      compileTime: 1,
      synctex: this.fullSynctex,
    }
  }
  async buildCheckpoint(_h: string) {
    this.buildCalls++
    const headPdf = this.headPdfNull ? null : await makePdf(2)
    return { fmt: Uint8Array.of(1, 2, 3), headPdf }
  }
  async compileFromCheckpoint(_f: Uint8Array, _t: string) {
    this.tailCalls++
    const servable = this.tailStatus <= 1 // statuses 0 (ok) and 1 (warning) still yield a PDF
    const tailPdf = servable ? await makePdf(1) : null
    return { pdf: tailPdf, status: this.tailStatus, synctex: this.tailSynctex, log: 'tail' }
  }
}

const PRE = '\\documentclass{article}\n'
const doc = (tail: string) =>
  `${PRE}\\begin{document}\nHead paragraph with enough text here.\n\\clearpage\n${tail}\n\\end{document}\n`
/** Two page breaks → three editable regions (head / mid-head / tail). */
const threeReg = (a: string, b: string, c: string) =>
  `${PRE}\\begin{document}\n${a}\n\\clearpage\n${b}\n\\clearpage\n${c}\n\\end{document}\n`
/** A single-`\clearpage` doc whose head loads `\input{name}` before the page break. */
const inputHead = (name: string, tail: string) =>
  `${PRE}\\begin{document}\n\\input{${name}}\nHead paragraph with enough text here to matter.\n\\clearpage\n${tail}\n\\end{document}\n`

/** Build a multi-file project programmatically: `main` `\include`s each named chapter and
 *  `files` maps every path (main + chapters) to its content. */
function project(chapters: Array<[string, string]>): { main: string; files: FileSet } {
  const includes = chapters.map(([name]) => `\\include{${name}}`).join('\n')
  const main = `${PRE}\\begin{document}\n${includes}\n\\end{document}\n`
  const files: FileSet = new Map([['main.tex', main]])
  for (const [name, body] of chapters) files.set(`${name}.tex`, body)
  return { main, files }
}

let mock: SynctexMockEngine
let inc: IncrementalCompiler
beforeEach(() => {
  mock = new SynctexMockEngine()
  inc = new IncrementalCompiler(mock as unknown as WasmTexPdftexEngine, { minHeadBytes: 0 })
})

/** Full-compile `before` (seeding the baseline), then compile `after` and return that second,
 *  incremental result. Optional per-phase file sets support multi-file projects. */
async function fullThenEdit(
  before: string,
  after: string,
  filesBefore?: FileSet,
  filesAfter?: FileSet,
): Promise<IncrementalResult> {
  await inc.compile(before, filesBefore)
  return inc.compile(after, filesAfter ?? filesBefore)
}

/** Number of cached checkpoints (reads the compiler's private LRU map). */
function checkpointCount(c: IncrementalCompiler): number {
  return (c as unknown as { checkpoints: Map<string, unknown> }).checkpoints.size
}

/** Point the mock at valid head + tail SyncTeX so the splice path runs end to end. */
function enableSynctex(): void {
  mock.fullSynctex = HEAD_SYNCTEX
  mock.tailSynctex = TAIL_SYNCTEX
}

describe('IncrementalCompiler — default minHeadBytes gate', () => {
  it('falls back to full when the head is smaller than the default minimum (2000 bytes)', async () => {
    // No minHeadBytes option → the 2000-byte default applies. doc()'s head is ~80 bytes, so
    // the fast-path pre-flight rejects it as too small and the edit compiles fully.
    const gated = new IncrementalCompiler(mock as unknown as WasmTexPdftexEngine)
    await gated.compile(doc('Tail body.')) // full, seeds baseline
    const r = await gated.compile(doc('Tail body edited.'))
    expect(r.incremental).toBe(false)
    expect(mock.buildCalls).toBe(0) // never built a checkpoint — head under the gate
    expect(mock.fullCalls).toBe(2)
  })
})

describe('IncrementalCompiler.noteFull — preamble-change checkpoint eviction', () => {
  it('clears cached checkpoints when a full compile reports a changed preamble', async () => {
    await fullThenEdit(doc('Tail body.'), doc('Tail body edited.')) // caches one checkpoint
    expect(checkpointCount(inc)).toBe(1)
    // A subsequent full compile whose preamble differs from the last known main source must
    // invalidate every cached checkpoint (they baked in the old preamble's format).
    const changed = `${PRE}\\usepackage{amsmath}\n\\begin{document}\nHead paragraph with enough text here.\n\\clearpage\nTail body edited.\n\\end{document}\n`
    inc.noteFull(changed, new Map())
    expect(checkpointCount(inc)).toBe(0)
  })

  it('keeps cached checkpoints when the preamble is unchanged', async () => {
    await fullThenEdit(doc('Tail body.'), doc('Tail body edited.'))
    expect(checkpointCount(inc)).toBe(1)
    inc.noteFull(doc('Tail body edited again.'), new Map()) // same preamble → no eviction
    expect(checkpointCount(inc)).toBe(1)
  })
})

describe('IncrementalCompiler — tail status handling', () => {
  it('serves incrementally on a warning status (status 1) tail compile', async () => {
    await inc.compile(doc('Tail body.'))
    mock.tailStatus = 1 // pdf present, non-zero status → exercises the status!==1 guard operand
    const r = await inc.compile(doc('Tail body edited.'))
    expect(r.incremental).toBe(true)
    expect(mock.tailCalls).toBe(1)
  })
})

describe('IncrementalCompiler — checkpoint build failure', () => {
  it('falls back to full when the checkpoint build yields no head PDF', async () => {
    await inc.compile(doc('Tail body.')) // full baseline
    mock.headPdfNull = true // buildCheckpoint returns headPdf: null → ensureCheckpoint throws
    const r = await inc.compile(doc('Tail body edited.'))
    expect(r.incremental).toBe(false) // caught → full fallback
    expect(mock.buildCalls).toBe(1) // build was attempted
    expect(mock.fullCalls).toBe(2)
  })
})

describe('IncrementalCompiler.prebuild — additional guards', () => {
  it('is a no-op for a checkpoint-unreproducible document (\\tableofcontents)', async () => {
    await inc.compile(doc('Tail body.')) // seed baseline
    const built = await inc.prebuild(doc('\\tableofcontents\nTail body.'))
    expect(built).toBe(false)
    expect(mock.buildCalls).toBe(0)
  })

  it('is a no-op when the head is below minHeadBytes', async () => {
    const strict = new IncrementalCompiler(mock as unknown as WasmTexPdftexEngine, {
      minHeadBytes: 2000,
    })
    await strict.compile(doc('Tail body.')) // full baseline
    const built = await strict.prebuild(doc('Tail body.')) // boundary exists, but head < 2000 bytes
    expect(built).toBe(false)
    expect(mock.buildCalls).toBe(0)
  })
})

describe('IncrementalCompiler — include-name resolution edge cases', () => {
  it('serves incrementally when the head references an include with no matching file', async () => {
    // \input{missing} in the head resolves to '' (no direct match; the basename scan visits the
    // unrelated notes.tex, matches nothing) — the head still compiles and the fast path proceeds.
    const extra: FileSet = new Map([['notes.tex', 'unreferenced helper']])
    const r = await fullThenEdit(inputHead('missing', 'TAIL'), inputHead('missing', 'TAIL2'), extra)
    expect(r.incremental).toBe(true)
  })

  it('treats an ambiguous basename include as empty content and still serves', async () => {
    // \input{intro} could resolve to a/intro.tex OR b/intro.tex — ambiguous, so includedContent
    // refuses to guess and returns '' (folded into the checkpoint key as empty).
    const twins: FileSet = new Map([
      ['a/intro.tex', 'X'],
      ['b/intro.tex', 'Y'],
    ])
    const r = await fullThenEdit(inputHead('intro', 'TAIL'), inputHead('intro', 'TAIL2'), twins)
    expect(r.incremental).toBe(true)
  })
})

describe('IncrementalCompiler — removed chapter in the label diff', () => {
  it('handles a chapter removed since the last snapshot (defaults its next-text to empty)', async () => {
    const three = project([
      ['ch1', 'Alpha'],
      ['ch2', 'Beta'],
      ['ch3', 'Gamma'],
    ])
    const two = project([
      ['ch1', 'Alpha'],
      ['ch2', 'Beta'],
    ]) // ch3 (and its \include) dropped
    await inc.compile(three.main, three.files) // full baseline (head includes ch1, ch2)
    // The label diff walks the union of old+new files: ch3 is in the previous snapshot but absent
    // from the new file set, so its next-text defaults to '' rather than throwing.
    const r = await inc.compile(two.main, two.files)
    expect(r.incremental).toBe(true)
    expect(r.final).toBe(true) // removing a label-free chapter body touches no labels
  })
})

describe('IncrementalCompiler — SyncTeX tail splice (#99 P2)', () => {
  it('splices the tail SyncTeX onto the last full head and reuses the parsed head on the next paint', async () => {
    enableSynctex()
    const r1 = await fullThenEdit(doc('Tail body.'), doc('Tail body edited.'))
    expect(r1.incremental).toBe(true)
    expect(r1.synctexData).not.toBeNull()
    expect(r1.synctexData?.inputs.get(1)).toBe('main.tex') // head main tag preserved
    // Head PDF = 2 pages (makePdf(2)), so the single tail page lands on page 3 of the splice.
    expect(r1.synctexData?.pages.has(3)).toBe(true)

    // A second tail edit reuses the already-parsed last-full SyncTeX (cached branch of
    // ensureLastFullSynctex) rather than re-parsing the bytes.
    const r2 = await inc.compile(doc('Tail body edited twice.'))
    expect(r2.incremental).toBe(true)
    expect(r2.synctexData).not.toBeNull()
  })

  it('degrades to null SyncTeX when the last full recorded none but the tail carries some', async () => {
    mock.tailSynctex = TAIL_SYNCTEX // tail has SyncTeX; fullSynctex stays null (no merge base)
    const r = await fullThenEdit(doc('Tail body.'), doc('Tail body edited.'))
    expect(r.incremental).toBe(true)
    expect(r.synctexData ?? null).toBeNull() // no head merge-base → can't splice safely
  })

  it('refuses the splice when the head changed since the last full compile (stale merge base)', async () => {
    enableSynctex()
    await inc.compile(threeReg('AAAA', 'BBBB', 'TAIL')) // full → last-full head = ...BBBB...

    // Edit the MIDDLE region (a fast paint, no new full compile): head splits at the first
    // \clearpage, so its prefix (AAAA) is still identical to the last full → splice runs.
    const rMid = await inc.compile(threeReg('AAAA', 'BXXX', 'TAIL'))
    expect(rMid.incremental).toBe(true)
    expect(rMid.synctexData).not.toBeNull()

    // Now edit the TAIL: the head splits at the SECOND \clearpage, so it now bakes in BXXX while
    // the last-full merge base still describes BBBB — the prefix no longer matches → null.
    const rTail = await inc.compile(threeReg('AAAA', 'BXXX', 'TAIL2'))
    expect(rTail.incremental).toBe(true)
    expect(rTail.synctexData ?? null).toBeNull()
  })
})

describe('IncrementalCompiler — SyncTeX tail splice, multi-file head', () => {
  it('splices when every chapter the head includes is unchanged since the last full', async () => {
    enableSynctex()
    const { main, files } = project([
      ['ch1', 'A'],
      ['ch2', 'B'],
      ['ch3', 'C'],
    ])
    await inc.compile(main, files) // full baseline
    const edited = new Map(files).set('ch2.tex', 'B2') // edit ch2; head still bakes in ch1 (unchanged)
    const r = await inc.compile(main, edited)
    expect(r.incremental).toBe(true)
    expect(r.synctexData).not.toBeNull()
  })

  it('refuses the splice when a head-included chapter differs from the last full snapshot', async () => {
    enableSynctex()
    const proj = project([
      ['ch1', 'A'],
      ['ch2', 'B'],
      ['ch3', 'C'],
    ])
    await inc.compile(proj.main, proj.files) // full: last-full ch2 = 'B'
    const paint2 = new Map(proj.files)
    paint2.set('ch2.tex', 'B2') // fast paint editing ch2 → this.last ch2 becomes 'B2'
    await inc.compile(proj.main, paint2)
    const paint3 = new Map(paint2)
    paint3.set('ch3.tex', 'C2') // now edit ch3 → head splits before ch3, so it includes the changed ch2
    const r = await inc.compile(proj.main, paint3)
    expect(r.incremental).toBe(true)
    expect(r.synctexData ?? null).toBeNull() // head ch2 (B2) != last-full ch2 (B) → bail out
  })
})
