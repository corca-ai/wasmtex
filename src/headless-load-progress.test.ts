import { describe, expect, it } from 'vitest'
import { WasmTexCompiler } from './headless'
import type { LoadProgressEvent } from './types'

interface FakeEngine {
  onProgress?: (percent: number) => void
  onFileDownload?: (file: string) => void
}
interface Internals {
  attachLoadProgress(engine: FakeEngine): void
}

describe('onLoadProgress', () => {
  it('forwards format percentage and each fetched file with a running count', () => {
    const events: LoadProgressEvent[] = []
    const c = new WasmTexCompiler({ onLoadProgress: (e) => events.push(e) })
    const engine: FakeEngine = {}
    ;(c as unknown as Internals).attachLoadProgress(engine)
    engine.onProgress?.(42)
    engine.onFileDownload?.('natbib.sty')
    engine.onFileDownload?.('ptmr7t')
    expect(events).toEqual([
      { phase: 'format', percent: 42 },
      { phase: 'file', file: 'natbib.sty', count: 1 },
      { phase: 'file', file: 'ptmr7t', count: 2 },
    ])
  })

  it('leaves the engine callbacks unset without a listener', () => {
    const c = new WasmTexCompiler({})
    const engine: FakeEngine = {}
    ;(c as unknown as Internals).attachLoadProgress(engine)
    expect(engine.onProgress).toBeUndefined()
    expect(engine.onFileDownload).toBeUndefined()
  })
})
