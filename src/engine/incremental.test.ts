import { PDFDocument } from 'pdf-lib'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CompileResult } from '../types'
import { editTouchesLabels, IncrementalCompiler } from './incremental'
import type { WasmTexPdftexEngine } from './wasmtex-engine'

async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) doc.addPage([200, 200])
  return doc.save()
}

/** Minimal stand-in for WasmTexPdftexEngine recording how it was driven. */
class MockEngine {
  fullCalls = 0
  buildCalls = 0
  tailCalls = 0
  tailStatus = 0
  lastFull = ''
  async writeFile(_p: string, c: string): Promise<void> {
    this.lastFull = c
  }
  async compile(): Promise<CompileResult> {
    this.fullCalls++
    return {
      success: true,
      pdf: await makePdf(5),
      log: 'full',
      errors: [],
      compileTime: 1,
      synctex: null,
    }
  }
  async buildCheckpoint(_h: string) {
    this.buildCalls++
    return { fmt: new Uint8Array([1, 2, 3]), headPdf: await makePdf(2) }
  }
  async compileFromCheckpoint(_f: Uint8Array, _t: string) {
    this.tailCalls++
    const ok = this.tailStatus === 0 || this.tailStatus === 1
    return {
      pdf: ok ? await makePdf(1) : null,
      synctex: null,
      status: this.tailStatus,
      log: 'tail',
    }
  }
}

const PRE = '\\documentclass{article}\n'
const doc = (tail: string) =>
  `${PRE}\\begin{document}\nHead paragraph with enough text here.\n\\clearpage\n${tail}\n\\end{document}\n`

let mock: MockEngine
let inc: IncrementalCompiler
beforeEach(() => {
  mock = new MockEngine()
  inc = new IncrementalCompiler(mock as unknown as WasmTexPdftexEngine, { minHeadBytes: 0 })
})

describe('editTouchesLabels', () => {
  it('detects a label/ref command added in the middle of the text', () => {
    expect(editTouchesLabels('a b c', 'a \\ref{x} b c')).toBe(true)
    expect(editTouchesLabels('a b c', 'a \\label{x} b c')).toBe(true)
  })

  it('ignores ordinary text edits that touch no label markup', () => {
    expect(editTouchesLabels('hello world', 'hello brave world')).toBe(false)
    expect(editTouchesLabels('same', 'same')).toBe(false)
  })

  it('detects a label command completed exactly at the edit boundary', () => {
    // The unchanged common prefix already held the command's first chars (`\\r`), and the
    // edit completed it into `\\ref{x}`. A window limited to the literally-changed span
    // misses `\\ref`; the examined window must cover commands straddling the boundary.
    expect(editTouchesLabels('a \\r b', 'a \\ref{x} b')).toBe(true)
    // Same on removal: `\\ref{x}` reduced back to `\\r`.
    expect(editTouchesLabels('a \\ref{x} b', 'a \\r b')).toBe(true)
  })

  it('detects a sectioning command grown at the boundary (\\section → \\subsection)', () => {
    expect(editTouchesLabels('\\section{X}', '\\subsection{X}')).toBe(true)
  })

  it('flags numbering-shifting counter/appendix commands added in the tail', () => {
    expect(editTouchesLabels('Intro paragraph end.', 'Intro paragraph end. \\appendix')).toBe(true)
    expect(editTouchesLabels('Intro.', 'Intro. \\setcounter{section}{4}')).toBe(true)
    expect(editTouchesLabels('Intro.', 'Intro. \\stepcounter{section}')).toBe(true)
    expect(editTouchesLabels('Intro.', 'Intro. \\addtocounter{equation}{2}')).toBe(true)
    expect(editTouchesLabels('Intro.', 'Intro. \\newtheorem{thm}{Theorem}')).toBe(true)
  })

  it('flags cleveref/extended cross-reference commands like plain \\ref', () => {
    expect(editTouchesLabels('Intro.', 'Intro. \\cref{x}')).toBe(true)
    expect(editTouchesLabels('Intro.', 'Intro. \\Cref{x}')).toBe(true)
    expect(editTouchesLabels('Intro.', 'Intro. \\autoref{x}')).toBe(true)
    expect(editTouchesLabels('Intro.', 'Intro. \\nameref{x}')).toBe(true)
  })

  it('flags an added \\index entry so the index can be regenerated (makeindex re-run)', () => {
    // \index/\makeindex/\printindex edits must be treated as non-final: the fast path
    // returns before maybeRunMakeindex, so a new \index entry would otherwise go stale.
    expect(editTouchesLabels('Tail. \\index{a}', 'Tail. \\index{a}\\index{newterm}')).toBe(true)
    expect(editTouchesLabels('Body.', 'Body. \\printindex')).toBe(true)
  })

  it('does not over-fire on commands that merely share the \\index prefix', () => {
    expect(editTouchesLabels('a b', 'a \\indexspace b')).toBe(false)
  })

  it('keeps ordinary edits and unchanged-suffix labels non-triggering', () => {
    // Regression guards: the widened regex must not over-fire on plain text or on a
    // label that merely sits in the unchanged suffix near the edit.
    expect(editTouchesLabels('hello world', 'hello brave world')).toBe(false)
    expect(
      editTouchesLabels('AAA text. \\label{z} tail end.', 'BBB text. \\label{z} tail end.'),
    ).toBe(false)
  })

  it('does not over-fire on commands that merely share a label-command prefix', () => {
    // \partial (math symbol) shares the prefix \part; \reflectbox shares \ref. Neither
    // affects labels/numbering, so completing/inserting them must NOT force a full reconcile.
    expect(editTouchesLabels('$x$', '$\\partial x$')).toBe(false)
    expect(editTouchesLabels('box a', '\\reflectbox{a}')).toBe(false)
    expect(editTouchesLabels('hello world', 'hello \\partial world')).toBe(false)
    expect(editTouchesLabels('a \\partia b', 'a \\partial b')).toBe(false)
  })
})

describe('IncrementalCompiler (#55)', () => {
  it('first compile is always a full compile', async () => {
    const r = await inc.compile(doc('Tail body.'))
    expect(r.incremental).toBe(false)
    expect(mock.fullCalls).toBe(1)
  })

  it('a body edit after a page break uses a checkpoint and splices head+tail', async () => {
    await inc.compile(doc('Tail body.'))
    const r = await inc.compile(doc('Tail body edited.'))
    expect(r.incremental).toBe(true)
    expect(r.checkpointBuilt).toBe(true)
    expect(mock.buildCalls).toBe(1)
    expect(mock.tailCalls).toBe(1)
    expect(mock.fullCalls).toBe(1) // no extra full compile
    // spliced: head (2) + tail (1) = 3 pages
    const pages = (await PDFDocument.load(r.pdf!)).getPageCount()
    expect(pages).toBe(3)
  })

  it('reuses a cached checkpoint when the head is unchanged', async () => {
    await inc.compile(doc('Tail body.'))
    await inc.compile(doc('Tail body v2.'))
    const r = await inc.compile(doc('Tail body v3.'))
    expect(r.incremental).toBe(true)
    expect(r.checkpointBuilt).toBe(false)
    expect(mock.buildCalls).toBe(1) // built once, reused
  })

  it('falls back to full when the preamble changes', async () => {
    await inc.compile(doc('Tail.'))
    const r = await inc.compile(
      `${PRE}\\usepackage{amsmath}\n\\begin{document}\nHead.\n\\clearpage\nTail.\n\\end{document}\n`,
    )
    expect(r.incremental).toBe(false)
    expect(mock.buildCalls).toBe(0)
  })

  it('falls back to full when there is no page break before the edit', async () => {
    const noBreak = (t: string) => `${PRE}\\begin{document}\n${t}\n\\end{document}\n`
    await inc.compile(noBreak('Body one.'))
    const r = await inc.compile(noBreak('Body one edited.'))
    expect(r.incremental).toBe(false)
  })

  it('marks the result non-final when the edit touches labels', async () => {
    await inc.compile(doc('Tail body.'))
    const r = await inc.compile(doc('Tail body.\\label{new}'))
    expect(r.incremental).toBe(true)
    expect(r.final).toBe(false)
  })

  it('stays final when the edit does not touch a label that exists later in the tail', async () => {
    await inc.compile(doc('AAA text. \\label{z} tail end.'))
    const r = await inc.compile(doc('BBB text. \\label{z} tail end.'))
    expect(r.incremental).toBe(true)
    expect(r.final).toBe(true) // \label{z} is in the unchanged suffix, not the edit
  })

  it('falls back to full when the tail compile fails', async () => {
    await inc.compile(doc('Tail body.'))
    mock.tailStatus = 2
    const r = await inc.compile(doc('Tail body edited.'))
    expect(r.incremental).toBe(false)
    expect(mock.fullCalls).toBe(2) // fell back to a full compile
  })

  it('setMainFile re-points the diff baseline at the new main file', () => {
    // snapshot()/editOffset() key off mainFile; a bare reset() would leave them bound to the
    // old name, overwriting the real main entry with the active source and corrupting the diff.
    const ic = new IncrementalCompiler(mock as unknown as WasmTexPdftexEngine, {
      minHeadBytes: 0,
      mainFile: 'main.tex',
    })
    ic.noteFull(
      'OLD',
      new Map([
        ['main.tex', 'OLD'],
        ['chapter1.tex', 'C1'],
      ]),
    )
    ic.setMainFile('chapter1.tex')
    ic.noteFull(
      'C1-edited',
      new Map([
        ['main.tex', 'OLD'],
        ['chapter1.tex', 'C1'],
      ]),
    )
    const last = (ic as unknown as { last: Map<string, string> }).last
    expect(last.get('chapter1.tex')).toBe('C1-edited') // active source keyed under new main
    expect(last.get('main.tex')).toBe('OLD') // real main.tex NOT clobbered
  })

  it('evicts old checkpoints beyond the LRU limit', async () => {
    inc = new IncrementalCompiler(mock as unknown as WasmTexPdftexEngine, {
      minHeadBytes: 0,
      maxCheckpoints: 1,
    })
    // Each distinct head (different text before \clearpage) → a new checkpoint.
    const docWith = (head: string, tail: string) =>
      `${PRE}\\begin{document}\n${head}\n\\clearpage\n${tail}\n\\end{document}\n`
    await inc.compile(docWith('Head A paragraph.', 'tail'))
    await inc.compile(docWith('Head A paragraph.', 'tail edit')) // checkpoint A built
    await inc.compile(docWith('Head B paragraph.', 'tail')) // full (head changed → preamble same, but firstDiff in head → no boundary before edit)
    await inc.compile(docWith('Head B paragraph.', 'tail edit2')) // checkpoint B built, A evicted
    expect(mock.buildCalls).toBe(2)
  })
})

describe('IncrementalCompiler — speculative prebuild (#99)', () => {
  it('warms a checkpoint that the next tail edit reuses (no build on the edit)', async () => {
    await inc.compile(doc('Tail body.')) // full → seeds baseline (main.aux)
    expect(await inc.prebuild(doc('Tail body.'))).toBe(true) // speculatively build last-boundary checkpoint
    expect(mock.buildCalls).toBe(1)
    const r = await inc.compile(doc('Tail body edited.')) // the real edit
    expect(r.incremental).toBe(true)
    expect(r.checkpointBuilt).toBe(false) // reused the prebuilt checkpoint
    expect(mock.buildCalls).toBe(1) // NOT rebuilt — the first edit is already fast
    expect(mock.tailCalls).toBe(1)
  })

  it('is a no-op before any full compile (no baseline to diff/seed against)', async () => {
    expect(await inc.prebuild(doc('Tail.'))).toBe(false)
    expect(mock.buildCalls).toBe(0)
  })

  it('is a no-op when the checkpoint is already warm', async () => {
    await inc.compile(doc('Tail.'))
    expect(await inc.prebuild(doc('Tail.'))).toBe(true)
    expect(await inc.prebuild(doc('Tail.'))).toBe(false) // already cached
    expect(mock.buildCalls).toBe(1)
  })

  it('is a no-op when no page break precedes the offset', async () => {
    await inc.compile(doc('Tail.')) // seed baseline
    expect(await inc.prebuild(doc('Tail.'), new Map(), 0)).toBe(false) // offset before the \clearpage
    expect(mock.buildCalls).toBe(0)
  })

  it('is a no-op when the preamble differs from the baseline', async () => {
    await inc.compile(doc('Tail.'))
    const changed = `${PRE}\\usepackage{amsmath}\n\\begin{document}\nHead paragraph with enough text here.\n\\clearpage\nTail.\n\\end{document}\n`
    expect(await inc.prebuild(changed)).toBe(false)
    expect(mock.buildCalls).toBe(0)
  })
})

describe('IncrementalCompiler.canFastServe (#99)', () => {
  it('is false before any full compile (no baseline)', () => {
    expect(inc.canFastServe(doc('Tail.'))).toBe(false)
  })

  it('is true for a servable final tail edit', async () => {
    await inc.compile(doc('Tail.'))
    expect(inc.canFastServe(doc('Tail edited.'))).toBe(true)
    expect(mock.buildCalls).toBe(0) // pure pre-flight — no compile/build
  })

  it('is false for a label-touching (non-final) edit', async () => {
    await inc.compile(doc('Tail.'))
    expect(inc.canFastServe(doc('Tail \\label{x}.'))).toBe(false)
  })

  it('is false when no page break precedes the edit', async () => {
    const noBreak = (t: string) => `${PRE}\\begin{document}\n${t}\n\\end{document}\n`
    await inc.compile(noBreak('Body text.'))
    expect(inc.canFastServe(noBreak('Body text edited.'))).toBe(false)
  })

  it('is false when the preamble changed', async () => {
    await inc.compile(doc('Tail.'))
    expect(
      inc.canFastServe(
        `${PRE}\\usepackage{amsmath}\n\\begin{document}\nHead paragraph with enough text here.\n\\clearpage\nTail.\n\\end{document}\n`,
      ),
    ).toBe(false)
  })
})

describe('IncrementalCompiler — multi-file (#55 / #54 dep-aware)', () => {
  const mfMain =
    '\\documentclass{article}\n\\begin{document}\n\\include{ch1}\n\\include{ch2}\n\\include{ch3}\n\\end{document}\n'
  const files = (c1: string, c2: string, c3: string) =>
    new Map([
      ['main.tex', mfMain],
      ['ch1.tex', c1],
      ['ch2.tex', c2],
      ['ch3.tex', c3],
    ])

  let m: MockEngine
  let ic: IncrementalCompiler
  beforeEach(() => {
    m = new MockEngine()
    ic = new IncrementalCompiler(m as unknown as WasmTexPdftexEngine, { minHeadBytes: 0 })
  })

  it('editing a later chapter compiles incrementally from the boundary before it', async () => {
    await ic.compile(mfMain, files('A', 'B', 'C')) // full
    const r = await ic.compile(mfMain, files('A', 'B', 'C edited'))
    expect(r.incremental).toBe(true)
    expect(m.buildCalls).toBe(1)
    expect(m.fullCalls).toBe(1) // no extra full
  })

  it('editing the first chapter falls back to full (no boundary before it)', async () => {
    await ic.compile(mfMain, files('A', 'B', 'C'))
    const r = await ic.compile(mfMain, files('A edited', 'B', 'C'))
    expect(r.incremental).toBe(false)
  })

  it('a changed early chapter invalidates checkpoints whose head includes it', async () => {
    await ic.compile(mfMain, files('A', 'B', 'C')) // full
    await ic.compile(mfMain, files('A', 'B', 'C2')) // ch3 edit → build checkpoint (head includes ch1,ch2)
    expect(m.buildCalls).toBe(1)
    await ic.compile(mfMain, files('A2', 'B', 'C2')) // ch1 edit → full (nothing before it)
    await ic.compile(mfMain, files('A2', 'B', 'C3')) // ch3 edit again, but ch1 differs → key changed → rebuild
    expect(m.buildCalls).toBe(2)
  })

  it('reuses the checkpoint when only the edited later chapter changes', async () => {
    await ic.compile(mfMain, files('A', 'B', 'C'))
    await ic.compile(mfMain, files('A', 'B', 'C2')) // build
    const r = await ic.compile(mfMain, files('A', 'B', 'C3')) // same head → reuse
    expect(r.incremental).toBe(true)
    expect(r.checkpointBuilt).toBe(false)
    expect(m.buildCalls).toBe(1)
  })

  it('a chapter edit that adds a label is non-final', async () => {
    await ic.compile(mfMain, files('A', 'B', 'C'))
    const r = await ic.compile(mfMain, files('A', 'B', 'C \\label{x}'))
    expect(r.incremental).toBe(true)
    expect(r.final).toBe(false)
  })

  it('marks the result non-final when the edit adds an \\index entry (re-runs makeindex)', async () => {
    await inc.compile(doc('Tail body. \\printindex'))
    const r = await inc.compile(doc('Tail body. \\index{newterm}\\printindex'))
    expect(r.incremental).toBe(true)
    expect(r.final).toBe(false) // forces a full compile so makeindex re-runs
  })

  it('invalidates the checkpoint head when a non-.tex asset in the head changes', async () => {
    // A title-page figure (\includegraphics{fig.png} before \clearpage) is baked into the
    // checkpoint head; changing the asset must rebuild the head, not splice a stale one.
    const f1 = new Map([
      ['main.tex', doc('Tail body.')],
      ['fig.png', 'PNGv1'],
    ])
    await inc.compile(doc('Tail body.'), f1) // full — seeds baseline
    await inc.compile(doc('Tail body edit.'), f1) // builds checkpoint (fig v1)
    expect(mock.buildCalls).toBe(1)
    const f2 = new Map([
      ['main.tex', doc('Tail body edit.')],
      ['fig.png', 'PNGv2'],
    ])
    const r = await inc.compile(doc('Tail body edit.'), f2) // only the asset changed
    // The stale checkpoint must NOT be reused as-is: either rebuild it or fall back to full.
    expect(r.incremental && mock.buildCalls === 1).toBe(false)
  })

  it('invalidates a checkpoint whose head includes a subdir chapter by bare basename', async () => {
    // \input{intro} resolves (TEXINPUTS) to chapters/intro.tex; the key/offset must match it
    // by basename, else a changed head chapter is served from a stale checkpoint.
    const mainBase =
      '\\documentclass{article}\n\\begin{document}\n\\input{intro}\nHead paragraph with enough text here to matter.\n\\clearpage\n'
    const mk = (tail: string) => `${mainBase}${tail}\n\\end{document}\n`
    const m2 = new MockEngine()
    const ic2 = new IncrementalCompiler(m2 as unknown as WasmTexPdftexEngine, { minHeadBytes: 0 })
    const fA = new Map([
      ['main.tex', mk('TAIL')],
      ['chapters/intro.tex', 'AAAA'],
    ])
    await ic2.compile(mk('TAIL'), fA) // full
    await ic2.compile(mk('TAIL edit'), fA) // builds checkpoint (intro = AAAA)
    expect(m2.buildCalls).toBe(1)
    const fB = new Map([
      ['main.tex', mk('TAIL edit')],
      ['chapters/intro.tex', 'BBBB-changed'],
    ])
    const r = await ic2.compile(mk('TAIL edit'), fB) // head chapter changed, tail same
    expect(r.incremental && m2.buildCalls === 1).toBe(false)
  })

  it('treats a newly added chapter (with sectioning) as non-final', async () => {
    await ic.compile(mfMain, files('A', 'B', 'C'))
    const main4 = mfMain.replace('\\include{ch3}\n', '\\include{ch3}\n\\include{ch4}\n')
    const f4 = files('A', 'B', 'C')
    f4.set('main.tex', main4)
    f4.set('ch4.tex', '\\section{Four}\\label{d}')
    const r = await ic.compile(main4, f4)
    expect(r.final).toBe(false) // new chapter shifts numbering → full reconcile
  })
})
