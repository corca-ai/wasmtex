import { describe, expect, it } from 'vitest'
import { BackendRegistry, BIBER_STAGE } from './backend-registry'
import { runBiberBackend, runRemoteBiber } from './biber-backend'
import { CompilerOperations } from './compiler-operation'
import { MemoryCacheStore, withCache } from './content-cache'

const request = { bcf: 'control', bibFiles: { 'refs/library.bib': 'bibliography' } }
describe('explicit local Biber execution', () => {
  it('uses the selected local backend and keeps the legacy remote-only helper unchanged', async () => {
    const registry = new BackendRegistry()
    registry.register(BIBER_STAGE, {
      id: 'local-biber',
      stage: BIBER_STAGE,
      location: 'client',
      async run(input) {
        expect(input).toEqual(request)
        return 'FULL BBL'
      },
    })
    expect(await runBiberBackend(registry, request)).toBe('FULL BBL')
    expect(await runRemoteBiber(registry, request)).toBeNull()
    expect(await runBiberBackend(undefined, request)).toBeNull()
  })
  it('does not substitute the limited implementation for a selected backend failure', async () => {
    const registry = new BackendRegistry()
    registry.register(BIBER_STAGE, {
      id: 'local-biber',
      stage: BIBER_STAGE,
      location: 'client',
      async run() {
        throw new Error('bibliography error')
      },
    })
    await expect(runBiberBackend(registry, request)).rejects.toThrow('bibliography error')
  })
  it('passes compiler cancellation through a cached executor and does not retain its cancelled result', async () => {
    const operations = new CompilerOperations()
    const registry = new BackendRegistry()
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    let seen: AbortSignal | undefined
    let calls = 0
    registry.register(
      BIBER_STAGE,
      withCache(
        {
          id: 'local-biber',
          stage: BIBER_STAGE,
          location: 'client',
          version: 'test',
          async run(_input, context) {
            calls++
            seen = context?.signal
            entered()
            if (calls === 1)
              await new Promise<void>((resolve) =>
                seen?.addEventListener('abort', () => resolve(), { once: true }),
              )
            return 'BBL'
          },
        },
        new MemoryCacheStore(),
      ),
    )
    const pending = operations.run(() =>
      runBiberBackend(registry, request, { signal: operations.signal }),
    )
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await started
    await operations.cancel()
    await rejected
    expect(seen?.aborted).toBe(true)
    expect(
      await operations.run(() => runBiberBackend(registry, request, { signal: operations.signal })),
    ).toBe('BBL')
    expect(calls).toBe(2)
  })
})
