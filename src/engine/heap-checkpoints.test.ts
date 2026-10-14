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
    expect(projectPath('/work/sub/../config.tex')).toBe('config.tex')
    expect(projectPath('./sub/../config.tex')).toBe('config.tex')
    expect(projectPath('../config.tex')).toBeNull()
    expect(projectPath('/work/sub/../.config.tex')).toBeNull()
    expect(projectPath('/tex/article.cls')).toBeNull()
    expect(projectPath('/work/__strace.tex')).toBeNull()
  })
})

describe('checkpointLineForEdit', () => {
  it('can retain document-start state for repeated first-paragraph previews', () => {
    expect(checkpointLineForEdit(DOC, PRE.length, 0)).toBe(3)
    expect(checkpointLineForEdit(DOC, PRE.length + 5, 0)).toBe(3)
    expect(checkpointLineForEdit(DOC, PRE.length - 1, 0)).toBeNull()
    expect(checkpointLineForEdit(DOC, PRE.length + 5)).toBeNull()
  })
  it('picks the paragraph boundary before the edited paragraph', () => {
    const editAt = DOC.indexOf('Paragraph 8')
    const line = checkpointLineForEdit(DOC, editAt, 0)!
    const start = lineStartOffset(DOC, line)
    // One paragraph of slack: the checkpoint sits at the start of paragraph 7.
    expect(DOC.slice(start, start + 11)).toBe('Paragraph 7')
  })

  it('keeps unseparated source lines close to the edit with one line of slack', () => {
    const source = PRE + Array.from({ length: 40 }, (_, i) => `Line ${i}.`).join('\n')
    const offset = source.indexOf('Line 30.')
    expect(checkpointLineForEdit(source, offset, 0, true)).toBe(lineOfOffset(source, offset) - 1)
    expect(checkpointLineForEdit(source, offset + 4, 0, true)).toBe(
      lineOfOffset(source, offset) - 1,
    )
    expect(checkpointLineForEdit(source, source.indexOf('Line 1.'), 0, true)).toBe(3)
    expect(checkpointLineForEdit(source, offset, source.length)).toBeNull()
    expect(checkpointLineForEdit(source, offset, 0)).toBe(3)
  })

  it('refuses the preamble and a too-small head', () => {
    expect(checkpointLineForEdit(DOC, 5)).toBeNull()
    expect(checkpointLineForEdit(DOC, DOC.indexOf('Paragraph 2'), 10_000)).toBeNull()
    expect(checkpointLineForEdit('no document env', 3)).toBeNull()
  })
})

class FakeEngine implements HeapCheckpointEngine {
  supportsHeapCheckpoints = true
  supportsLineCheckpoints = true
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

  it('retains paragraph placement on workers without line-placement capability', () => {
    const engine = new FakeEngine()
    const source = PRE + Array.from({ length: 30 }, (_, i) => `Line ${i}.`).join('\n')
    const hc = new HeapCheckpointCompiler(engine, { minHeadBytes: 0 })
    engine.supportsLineCheckpoints = false
    expect(hc.armsForFullCompile(source, files())[0]?.line).toBe(3)
    engine.supportsLineCheckpoints = true
    expect(hc.armsForFullCompile(source, files())[0]?.line).toBe(31)
  })

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

  it('lets callers refuse untracked prefix inputs before resuming a discovery pass', async () => {
    const engine = new FakeEngine()
    const hc = new HeapCheckpointCompiler(engine, { minHeadBytes: 0 })
    const result = await engine.compile({ checkpoints: hc.armsForFullCompile(DOC, files()) })
    result.heapCheckpoints![0]!.inputs!.push('/work/figure.pdf', '/tex/article.cls')
    hc.noteFull(DOC, files(), result)
    const edited = DOC.replace('Second line of 12.', 'Second line of 12!')
    const observed: string[][] = []
    const rejectFigure = (paths: readonly string[]) => {
      observed.push([...paths])
      return !paths.some((path) => path.endsWith('/figure.pdf'))
    }
    expect(await hc.tryResume(edited, files(), rejectFigure)).toBeNull()
    expect(observed).toEqual([
      ['/work/main.tex', '/work/chapter.tex', '/work/figure.pdf', '/tex/article.cls'],
    ])
    expect(engine.compiles.every((call) => call.kind === 'full')).toBe(true)
    // Refusal preserves the checkpoint for a caller able to validate those inputs.
    expect(await hc.tryResume(edited, files())).not.toBeNull()
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

it.each([
  './sub/../config.tex',
  '/work/sub/../config.tex',
  '../work/config.tex',
  '/tex/../work/config.tex',
])('invalidates an already read secondary path alias: %s', async (alias) => {
  const engine = new FakeEngine()
  const hc = new HeapCheckpointCompiler(engine, { minHeadBytes: 0 })
  const source = DOC
  hc.noteFull(source, new Map([['config.tex', 'ORIGINAL']]), {
    success: true,
    pdf: new Uint8Array([1]),
    synctex: null,
    log: '',
    errors: [],
    compileTime: 1,
    heapCheckpoints: [
      {
        id: 'alias',
        line: 10,
        bytes: 1024,
        ms: 1,
        inputs: ['/work/main.tex', alias],
        inputsComplete: true,
      },
    ],
  })
  hc.invalidateFile('config.tex')
  expect(hc.held).toEqual([])
  expect(await hc.tryResume(source, new Map([['config.tex', 'CHANGED']]))).toBeNull()
})
