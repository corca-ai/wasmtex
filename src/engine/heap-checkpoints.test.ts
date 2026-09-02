import { describe, expect, it } from 'vitest'
import type { CompileResult } from '../types'
import {
  checkpointLineForEdit,
  HeapCheckpointCompiler,
  type HeapCheckpointEngine,
  lineOfOffset,
  lineStartOffset,
  projectPath,
} from './heap-checkpoints'

const PRE = '\\documentclass{article}\n\\begin{document}\n'
const para = (i: number) =>
  `Paragraph ${i} text that is long enough to matter for the head.\nSecond line of ${i}.\n`
const DOC = `${PRE}${Array.from({ length: 12 }, (_, i) => para(i + 1)).join('\n')}\\end{document}\n`

describe('line helpers', () => {
  it('maps lines and offsets both ways', () => {
    expect(lineStartOffset('a\nb\nc', 1)).toBe(0)
    expect(lineStartOffset('a\nb\nc', 3)).toBe(4)
    expect(lineStartOffset('a\nb', 5)).toBe(-1)
    expect(lineOfOffset('a\nb\nc', 4)).toBe(3)
    expect(lineOfOffset('a\nb\nc', 0)).toBe(1)
  })

  it('normalizes recorder paths to project paths', () => {
    expect(projectPath('/work/chapters/a.tex')).toBe('chapters/a.tex')
    expect(projectPath('./main.tex')).toBe('main.tex')
    expect(projectPath('/tex/article.cls')).toBeNull()
    expect(projectPath('/work/__strace.tex')).toBeNull()
  })
})

describe('checkpointLineForEdit', () => {
  it('picks the paragraph boundary before the edited paragraph', () => {
    const editAt = DOC.indexOf('Paragraph 8')
    const line = checkpointLineForEdit(DOC, editAt, 0)!
    const start = lineStartOffset(DOC, line)
    // One paragraph of slack: the checkpoint sits at the start of paragraph 7.
    expect(DOC.slice(start, start + 11)).toBe('Paragraph 7')
  })

  it('refuses the preamble and a too-small head', () => {
    expect(checkpointLineForEdit(DOC, 5)).toBeNull()
    expect(checkpointLineForEdit(DOC, DOC.indexOf('Paragraph 2'), 10_000)).toBeNull()
    expect(checkpointLineForEdit('no document env', 3)).toBeNull()
  })
})

class FakeEngine implements HeapCheckpointEngine {
  supportsHeapCheckpoints = true
  compiles: Array<{
    kind: 'full' | 'resume'
    id?: string
    arms: Array<{ id: string; line: number }>
  }> = []
  dropped: string[][] = []
  private bytes = 1000

  private result(arms: Array<{ id: string; line: number }>): CompileResult {
    return {
      success: true,
      pdf: new Uint8Array([1]),
      log: '',
      errors: [],
      compileTime: 1,
      synctex: null,
      heapCheckpoints: arms.map((a) => ({
        id: a.id,
        line: a.line,
        bytes: this.bytes,
        ms: 1,
        inputs: ['/work/main.tex', '/work/chapter.tex'],
      })),
    }
  }
  async compile(options?: { checkpoints?: Array<{ id: string; line: number }> }) {
    const arms = options?.checkpoints ?? []
    this.compiles.push({ kind: 'full', arms })
    return this.result(arms)
  }
  async compileFromHeapCheckpoint(id: string, checkpoints?: Array<{ id: string; line: number }>) {
    const arms = checkpoints ?? []
    this.compiles.push({ kind: 'resume', id, arms })
    return this.result(arms)
  }
  async dropHeapCheckpoints(ids?: string[]) {
    this.dropped.push(ids ?? ['*'])
  }
}

describe('HeapCheckpointCompiler', () => {
  const files = () => new Map([['chapter.tex', 'chapter']])

  it('arms before the end on the first compile, then resumes edits after the checkpoint', async () => {
    const engine = new FakeEngine()
    const hc = new HeapCheckpointCompiler(engine, { minHeadBytes: 0 })
    const arms = hc.armsForFullCompile(DOC, files())
    expect(arms).toHaveLength(1)
    const full = await engine.compile({ checkpoints: arms })
    hc.noteFull(DOC, files(), full)
    expect(hc.held).toHaveLength(1)
    const cpStart = lineStartOffset(DOC, hc.held[0]!.line)

    // An edit after the checkpoint resumes from it and arms a new one for that region.
    const edited = DOC.replace('Second line of 12.', 'Second line of 12, edited.')
    expect(DOC.indexOf('Second line of 12.')).toBeGreaterThan(cpStart)
    const resume = await hc.tryResume(edited, files())
    expect(resume?.checkpointId).toBe(arms[0]!.id)
    expect(resume?.final).toBe(true)
    expect(engine.compiles.at(-1)?.kind).toBe('resume')

    // The same checkpoint serves a second edit in the region (it is reusable).
    const edited2 = edited.replace('Paragraph 11 text', 'Paragraph 11 (touched) text')
    const resume2 = await hc.tryResume(edited2, files())
    expect(resume2).not.toBeNull()
  })

  it('does not resume when the prefix, an input, or the preamble changed', async () => {
    const engine = new FakeEngine()
    const hc = new HeapCheckpointCompiler(engine, { minHeadBytes: 0 })
    hc.noteFull(
      DOC,
      files(),
      await engine.compile({ checkpoints: hc.armsForFullCompile(DOC, files()) }),
    )
    // Edit before the checkpoint: prefix differs.
    expect(
      await hc.tryResume(DOC.replace('Paragraph 2 text', 'Paragraph 2 TEXT'), files()),
    ).toBeNull()
    // Same tail edit but an opened input changed.
    const tail = DOC.replace('Second line of 12.', 'Second line of 12!')
    expect(await hc.tryResume(tail, new Map([['chapter.tex', 'changed']]))).toBeNull()
    // Preamble changed.
    expect(await hc.tryResume(tail.replace('{article}', '{report}'), files())).toBeNull()
    // Plain tail edit still works.
    expect(await hc.tryResume(tail, files())).not.toBeNull()
  })

  it('reports label-touching edits as not final', async () => {
    const engine = new FakeEngine()
    const hc = new HeapCheckpointCompiler(engine, { minHeadBytes: 0 })
    hc.noteFull(
      DOC,
      files(),
      await engine.compile({ checkpoints: hc.armsForFullCompile(DOC, files()) }),
    )
    const resume = await hc.tryResume(DOC.replace('Second line of 12.', 'See \\ref{x}.'), files())
    expect(resume?.final).toBe(false)
  })

  it('keeps within the checkpoint budget, dropping the least recently used', async () => {
    const engine = new FakeEngine()
    const hc = new HeapCheckpointCompiler(engine, { minHeadBytes: 0, maxCheckpoints: 2 })
    let doc = DOC
    for (let i = 3; i <= 6; i++) {
      // Each edit lands in a different paragraph so a new checkpoint is armed each time.
      doc = doc.replace(`Second line of ${i}.`, `Second line of ${i} edited.`)
      const arms = hc.armsForFullCompile(doc, files())
      hc.noteFull(doc, files(), await engine.compile({ checkpoints: arms }))
    }
    await new Promise((r) => setTimeout(r, 0))
    expect(hc.held.length).toBeLessThanOrEqual(2)
    expect(engine.dropped.length).toBeGreaterThan(0)
  })
})
