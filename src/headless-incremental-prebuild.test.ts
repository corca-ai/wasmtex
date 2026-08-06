import { describe, expect, it, vi } from 'vitest'
import { WasmTexCompiler } from './headless'

type PrebuildForEdit = (
  source: string,
  files: Map<string, string>,
  path: string,
  offset: number,
) => Promise<boolean>

interface CompilerInternals {
  initialized: boolean
  engine: object | null
  incremental: { prebuildForEdit: PrebuildForEdit } | null
  fs: { markSynced(): void }
}

function readyCompiler(prebuildForEdit: PrebuildForEdit) {
  const compiler = new WasmTexCompiler({
    incremental: true,
    files: {
      'main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{chapter}\n\\end{document}',
      'chapter.tex': 'chapter body',
    },
  })
  const internals = compiler as unknown as CompilerInternals
  internals.initialized = true
  internals.engine = {}
  internals.incremental = { prebuildForEdit }
  internals.fs.markSynced()
  return compiler
}

describe('WasmTexCompiler.prepareIncrementalCompile', () => {
  it('forwards an included-file cursor to the shared checkpoint manager', async () => {
    const prebuildForEdit = vi.fn<PrebuildForEdit>(async () => true)
    const compiler = readyCompiler(prebuildForEdit)

    await expect(compiler.prepareIncrementalCompile('chapter.tex', 7)).resolves.toBe(true)
    expect(prebuildForEdit).toHaveBeenCalledOnce()
    expect(prebuildForEdit.mock.calls[0]?.[2]).toBe('chapter.tex')
    expect(prebuildForEdit.mock.calls[0]?.[3]).toBe(7)
  })

  it('does not build against unsynchronized project bytes', async () => {
    const prebuildForEdit = vi.fn<PrebuildForEdit>(async () => true)
    const compiler = readyCompiler(prebuildForEdit)
    compiler.setFile('chapter.tex', 'edited')

    await expect(compiler.prepareIncrementalCompile('chapter.tex', 3)).resolves.toBe(false)
    expect(prebuildForEdit).not.toHaveBeenCalled()
  })

  it('shares one in-flight preparation between callers', async () => {
    let resolve!: (value: boolean) => void
    const pending = new Promise<boolean>((done) => {
      resolve = done
    })
    const prebuildForEdit = vi.fn(() => pending)
    const compiler = readyCompiler(prebuildForEdit)

    const first = compiler.prepareIncrementalCompile()
    const second = compiler.prepareIncrementalCompile()
    resolve(true)

    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(prebuildForEdit).toHaveBeenCalledOnce()
  })
})
