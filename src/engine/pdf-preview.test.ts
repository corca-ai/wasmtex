import { PDFDocument } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'
import { IncrementalCompiler } from './incremental'
import { createPdfPreviewParts } from './pdf-splice'
import type { WasmTexPdftexEngine } from './wasmtex-engine'

async function pdf(width: number) {
  const document = await PDFDocument.create()
  document.addPage([width, 200])
  return document.save()
}

const source = (tail: string) =>
  `\\documentclass{article}\n\\begin{document}\nHead.\n\\clearpage\n${tail}\n\\end{document}`

async function fixture() {
  const head = await pdf(100)
  const tail = await pdf(150)
  const engine = {
    buildCheckpoint: vi.fn(async () => ({ fmt: new Uint8Array([1]), headPdf: head })),
    compileFromCheckpoint: vi.fn(async () => ({ pdf: tail, status: 0, log: '', synctex: null })),
  }
  const compiler = new IncrementalCompiler(engine as unknown as WasmTexPdftexEngine, {
    minHeadBytes: 0,
  })
  compiler.noteFull(source('original'))
  return { compiler, engine, head }
}

describe('deferred PDF previews', () => {
  it('preserves the default byte result and materializes the same pages in opt-in mode', async () => {
    const { compiler } = await fixture()
    const ordinary = await compiler.tryIncremental(source('ordinary'))
    expect(ordinary?.pdf).toBeInstanceOf(Uint8Array)
    const preview = await compiler.tryIncremental(source('preview'), new Map(), true)
    const parts = preview?.pdf
    if (!parts || parts instanceof Uint8Array) throw new Error('expected parts')
    expect(Object.isFrozen(parts)).toBe(true)
    expect(Object.isFrozen(parts.parts)).toBe(true)
    const materialized = await PDFDocument.load(await parts.materialize())
    const canonical = await PDFDocument.load(ordinary!.pdf!)
    expect(materialized.getPages().map((page) => page.getWidth())).toEqual(
      canonical.getPages().map((page) => page.getWidth()),
    )
  })

  it('shares the stable head but keeps each tail snapshot after edits and reset', async () => {
    const { compiler, engine, head } = await fixture()
    const first = (await compiler.tryIncremental(source('first'), new Map(), true))?.pdf
    engine.compileFromCheckpoint.mockResolvedValue({
      pdf: await pdf(180),
      status: 0,
      log: '',
      synctex: null,
    })
    const second = (await compiler.tryIncremental(source('second'), new Map(), true))?.pdf
    if (!first || !second || first instanceof Uint8Array || second instanceof Uint8Array) {
      throw new Error('expected parts')
    }
    expect(first.parts[0]).toBe(head)
    expect(second.parts[0]).toBe(head)
    expect(second.parts[1]).not.toBe(first.parts[1])
    expect(compiler.getRetentionStats().checkpointPdfBytes).toBe(head.byteLength)
    compiler.reset()
    expect(compiler.getRetentionStats().checkpointPdfBytes).toBe(0)
    expect((await PDFDocument.load(await first.materialize())).getPage(1).getWidth()).toBe(150)
    expect((await PDFDocument.load(await second.materialize())).getPage(1).getWidth()).toBe(180)
  })

  it('skips label-sensitive preview edits before checkpoint or tail work', async () => {
    const { compiler, engine } = await fixture()
    expect(await compiler.tryIncremental(source('\\label{changed}'), new Map(), true)).toBeNull()
    expect(engine.buildCheckpoint).not.toHaveBeenCalled()
    expect(engine.compileFromCheckpoint).not.toHaveBeenCalled()
  })

  it('falls back after a failed tail and allows the next retry to succeed', async () => {
    const { compiler, engine } = await fixture()
    engine.compileFromCheckpoint.mockRejectedValueOnce(new Error('worker failed'))
    expect(await compiler.tryIncremental(source('edited'), new Map(), true)).toBeNull()
    expect((await compiler.tryIncremental(source('edited'), new Map(), true))?.success).toBe(true)
  })

  it('does not poison a deferred snapshot when materialization fails', async () => {
    const parts = createPdfPreviewParts([new Uint8Array([1]), new Uint8Array([2])])
    await expect(parts.materialize()).rejects.toThrow()
    await expect(parts.materialize()).rejects.toThrow()
    expect(parts.parts[0]).toEqual(new Uint8Array([1]))
  })
})
