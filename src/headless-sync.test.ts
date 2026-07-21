import { describe, expect, it } from 'vitest'
import { WasmTexCompiler } from './headless'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}
function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// Structural view of the private internals we drive directly. The sync methods are
// private and the engine is created lazily, so we inject a fake engine and call the
// method without standing up a real WASM compile.
interface CompilerInternals {
  engine: unknown
  syncAllFilesToEngine(): Promise<void>
  syncModifiedFilesToEngine(): Promise<void>
  fs: { getModifiedFiles(): Array<{ path: string; content: unknown }> }
}

const tick = () => Promise.resolve()

/** A fake engine whose writeFile returns a gate-controllable deferred per call. */
function fakeEngineWithGates(): { engine: object; gates: Deferred[] } {
  const gates: Deferred[] = []
  const engine = {
    writeFile: () => {
      const d = deferred()
      gates.push(d)
      return d.promise
    },
    mkdir: () => Promise.resolve(),
    setMainFile: () => {},
  }
  return { engine, gates }
}

/**
 * Drive `method` to completion while landing a host `setFile('extra.tex','X2')`
 * edit mid-sync (after the first per-file writeFile is in flight, before the
 * post-loop markSynced). The mid-sync edit replaces extra.tex's captured map
 * entry and was never sent to the engine, so it MUST stay modified for the next
 * cycle — the identity-capture contract both sync methods must honor.
 */
async function assertMidSyncEditSurvives(
  method: 'syncAllFilesToEngine' | 'syncModifiedFilesToEngine',
): Promise<void> {
  const c = new WasmTexCompiler({ files: { 'main.tex': 'A', 'extra.tex': 'X' } })
  const { engine, gates } = fakeEngineWithGates()
  const internals = c as unknown as CompilerInternals
  internals.engine = engine

  const p = internals[method]()

  while (gates.length < 1) await tick()
  gates[0]!.resolve() // first file written
  await tick()

  c.setFile('extra.tex', 'X2') // host edit lands during the sync

  while (gates.length < 2) await tick()
  gates[1]!.resolve()
  await p

  const modified = internals.fs.getModifiedFiles().map((f) => [f.path, f.content])
  expect(modified).toContainEqual(['extra.tex', 'X2'])
  expect(modified).not.toContainEqual(['main.tex', 'A'])
}

describe('WasmTexCompiler sync — mid-sync edits survive', () => {
  it('syncAllFilesToEngine (full sync, e.g. init/loadProject)', async () => {
    await assertMidSyncEditSurvives('syncAllFilesToEngine')
  })

  it('syncModifiedFilesToEngine (hot path, runs on every edit)', async () => {
    await assertMidSyncEditSurvives('syncModifiedFilesToEngine')
  })
})
