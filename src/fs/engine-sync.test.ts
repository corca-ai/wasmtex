import { describe, expect, it } from 'vitest'
import { syncAllFilesToEngine } from './engine-sync'
import { VirtualFS } from './virtual-fs'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('syncAllFilesToEngine', () => {
  it('keeps a host edit that lands mid-sync modified (identity markSynced)', async () => {
    const fs = new VirtualFS({ empty: true })
    fs.writeFile('extra.tex', 'B')
    fs.writeFile('main.tex', 'A')

    const writes: string[] = []
    const resolvers: Array<() => void> = []
    const engine = {
      writeFile: (path: string, _content: string | Uint8Array) =>
        new Promise<void>((resolve) => {
          writes.push(path)
          resolvers.push(resolve)
        }),
      setMainFile: () => {},
    }

    const done = syncAllFilesToEngine(fs, engine, async () => {}, 'main.tex')

    // listFiles() sorts → extra.tex is written first; let it suspend there.
    await tick()
    expect(writes).toEqual(['extra.tex'])
    resolvers[0]!() // extra.tex write resolves; loop advances to main.tex
    await tick()

    // A host edit replaces extra.tex AFTER it was captured/written — it must remain
    // modified so the next cycle re-sends it.
    fs.writeFile('extra.tex', 'B2')
    resolvers[1]!() // main.tex write resolves
    await done

    const modified = fs.getModifiedFiles()
    expect(modified.map((f) => f.path)).toEqual(['extra.tex'])
    expect(modified[0]!.content).toBe('B2')
  })

  it('marks all synced files when no edits arrive', async () => {
    const fs = new VirtualFS({ empty: true })
    fs.writeFile('main.tex', 'A')
    const engine = {
      writeFile: () => Promise.resolve(),
      setMainFile: () => {},
    }
    await syncAllFilesToEngine(fs, engine, async () => {}, 'main.tex')
    expect(fs.getModifiedFiles()).toEqual([])
  })
})
