import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CachedTexliveFile, WarmupCache } from '../types'
import { MemoryBinaryStore } from './persistent-cache'
import { mergeWarmupCaches, WasmTexPdftexEngine } from './wasmtex-engine'
import type { EngineWorker } from './worker-host'

// The constructor is side-effect-free (no Worker is spawned until init()),
// so we can assert the option → internal-state mapping directly.
describe('WasmTexPdftexEngine preamble snapshot opt-out', () => {
  it('enables preamble snapshots by default', () => {
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/' })
    expect(engine.isPreambleSnapshotEnabled()).toBe(true)
  })

  it('disables preamble snapshots when disablePreambleSnapshot is set', () => {
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/', disablePreambleSnapshot: true })
    expect(engine.isPreambleSnapshotEnabled()).toBe(false)
  })

  it('treats disablePreambleSnapshot: false as enabled', () => {
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/', disablePreambleSnapshot: false })
    expect(engine.isPreambleSnapshotEnabled()).toBe(true)
  })

  it('throws if toggled before initialization', () => {
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/' })
    expect(() => engine.setPreambleSnapshot(false)).toThrow(/not initialized/)
  })
})

describe('WasmTexPdftexEngine persistent cache', () => {
  it('starts with a zero download count', () => {
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/', persistentCache: true })
    expect(engine.getDownloadCount()).toBe(0)
  })

  it('clearCache() is a graceful no-op when IndexedDB is unavailable', async () => {
    // In Node there is no global indexedDB, so the durable cache is disabled.
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/', persistentCache: true })
    await expect(engine.clearCache()).resolves.toBeUndefined()
  })
})

type WorkerReply = {
  cmd?: string
  result?: string
  status?: number
  pdf?: ArrayBuffer
  synctex?: ArrayBuffer
  log?: string
  engineCommands?: unknown[]
  engineCommandsComplete?: boolean
  engineCommandsDropped?: number
  inputFiles?: unknown[]
  inputFilesComplete?: boolean
  completionObservations?: unknown[]
  phaseTimings?: unknown
  preambleFormat?: ArrayBuffer
  preambleHash?: string
  preambleInputFiles?: string[]
  preambleRebuilt?: boolean
  preambleSnapshot?: boolean
  evidence?: unknown
}

/** Drives the engine without a real Worker by exposing the protected seams. */
class TestableEngine extends WasmTexPdftexEngine {
  markReady(): void {
    this.status = 'ready'
  }

  /** Install a stub worker; each postMessage delivers `reply()` (if any) via the real dispatch. */
  installWorker(reply?: () => WorkerReply): void {
    this.worker = {
      postMessage: () => {
        if (reply) this.dispatchWorkerMessage(reply() as never, noop, noop)
      },
    } as unknown as EngineWorker
  }

  /** Simulate a worker → main message through the real dispatch path. */
  deliver(reply: WorkerReply): void {
    this.dispatchWorkerMessage(reply as never, noop, noop)
  }

  installResolverWorker(evidence: unknown): void {
    this.worker = {
      postMessage: () => {
        this.dispatchWorkerMessage({ cmd: 'resolverready' } as never, noop, noop)
        this.dispatchWorkerMessage({ cmd: 'resolver', evidence } as never, noop, noop)
        this.dispatchWorkerMessage({ cmd: 'compile', result: 'ok', status: 0, log: '' }, noop, noop)
      },
    } as unknown as EngineWorker
  }
}

function noop(): void {
  /* init callbacks are unused for cmd-keyed replies */
}

describe('WasmTexPdftexEngine persistent preamble cache', () => {
  class PreambleTestEngine extends WasmTexPdftexEngine {
    loadCalls = 0

    markReady(): void {
      this.status = 'ready'
      ;(this as unknown as { engineBuildId: string }).engineBuildId = 'a'.repeat(64)
    }

    installProtocol(compileReply: WorkerReply): void {
      this.worker = {
        postMessage: (message: unknown) => {
          const command = (message as { cmd?: string }).cmd
          if (!command) return
          if (command === 'loadpreamblesnapshot') this.loadCalls++
          const reply: WorkerReply =
            command === 'compilelatex' ? compileReply : { cmd: command, result: 'ok' }
          this.dispatchWorkerMessage(reply as never, noop, noop)
        },
      } as unknown as EngineWorker
    }

    async waitForPreamblePersist(): Promise<void> {
      await (this as unknown as { preamblePersistInFlight: Promise<void> | null })
        .preamblePersistInFlight
    }
  }

  const options = (store: MemoryBinaryStore) => ({
    assetBaseUrl: '/',
    persistentPreambleCache: true,
    preambleCacheIdentity: { mirrorRevision: '2025-0123456789abcdef' },
    preambleCacheStore: store,
  })
  const source = '\\documentclass{article}\n\\usepackage{local}\n\\begin{document}Hi\\end{document}'

  async function writeProject(engine: PreambleTestEngine, style: string): Promise<void> {
    await Promise.all([engine.writeFile('main.tex', source), engine.writeFile('local.sty', style)])
    engine.setMainFile('main.tex')
  }

  it('restores a snapshot in a new engine only when project dependencies match', async () => {
    const store = new MemoryBinaryStore()
    const first = new PreambleTestEngine(options(store))
    first.markReady()
    first.installProtocol({
      cmd: 'compile',
      result: 'ok',
      status: 0,
      preambleRebuilt: true,
      preambleFormat: Uint8Array.of(1, 2, 3).buffer,
      preambleHash: 'worker-hash',
      preambleInputFiles: ['/work/local.sty', '/tex/article.cls'],
    })
    await writeProject(first, 'STYLE-A')
    await first.compile()
    await first.waitForPreamblePersist()

    const matching = new PreambleTestEngine(options(store))
    matching.markReady()
    matching.installProtocol({
      cmd: 'compile',
      result: 'ok',
      status: 0,
      preambleSnapshot: true,
    })
    await writeProject(matching, 'STYLE-A')
    await matching.compile()
    expect(matching.loadCalls).toBe(1)
    matching.setMainFile('main.tex')
    await matching.compile()
    expect(matching.loadCalls).toBe(1)

    const changed = new PreambleTestEngine(options(store))
    changed.markReady()
    changed.installProtocol({ cmd: 'compile', result: 'ok', status: 0 })
    await writeProject(changed, 'STYLE-B')
    await changed.compile()
    expect(changed.loadCalls).toBe(0)
  })
})

describe('WasmTexPdftexEngine worker crash after init', () => {
  /** Ready engine + a worker that never replies, so a started compile stays pending. */
  class CrashTestableEngine extends WasmTexPdftexEngine {
    markReady(): void {
      this.status = 'ready'
    }
    installSilentWorker(): void {
      this.worker = { postMessage: () => {}, terminate: () => {} } as unknown as EngineWorker
    }
    crash(err: Error): void {
      this.handleWorkerError(err)
    }
    get pendingSize(): number {
      return this.pendingResponses.size
    }
  }

  it('rejects an in-flight compile when the worker errors after init (no permanent hang)', async () => {
    const engine = new CrashTestableEngine({ assetBaseUrl: '/' })
    engine.markReady()
    engine.installSilentWorker()

    const p = engine.compile() // registers a 'cmd:compile' waiter; would hang forever
    expect(engine.pendingSize).toBe(1)

    engine.crash(new Error('wasm oom')) // spontaneous post-init worker error

    await expect(p).rejects.toThrow(/wasm oom/)
    expect(engine.pendingSize).toBe(0) // in-flight waiter settled, not leaked
    expect(engine.getStatus()).toBe('error')
  })
})

describe('WasmTexPdftexEngine format extraction', () => {
  it('returns the binary produced by compileformat', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const engine = new TestableEngine({ assetBaseUrl: '/' })
    engine.markReady()
    engine.installWorker(() => ({
      cmd: 'compile',
      result: 'ok',
      status: 0,
      pdf: bytes.buffer,
    }))

    await expect(engine.buildFormat()).resolves.toEqual(bytes)
    expect(engine.getStatus()).toBe('ready')
  })

  it('surfaces the engine log when format generation fails', async () => {
    const engine = new TestableEngine({ assetBaseUrl: '/' })
    engine.markReady()
    engine.installWorker(() => ({
      cmd: 'compile',
      result: 'failed',
      status: 1,
      log: 'format exploded',
    }))

    await expect(engine.buildFormat()).rejects.toThrow(/format exploded/)
  })
})

describe('mergeWarmupCaches reconciles cross-list collisions', () => {
  const file = (filename: string): CachedTexliveFile => ({
    format: 1,
    filename,
    data: new Uint8Array([1, 2, 3]).buffer,
  })
  const keysOf = (entries: { format: number; filename: string }[]) =>
    entries.map((e) => `${e.format}/${e.filename}`)

  it('lets an override file supersede a base 404 (and removes it from notFound)', () => {
    const base: WarmupCache = { files: [], notFound: [{ format: 1, filename: 'X.sty' }] }
    const override: WarmupCache = { files: [file('X.sty')], notFound: [] }
    const merged = mergeWarmupCaches(base, override)
    expect(keysOf(merged.files)).toContain('1/X.sty')
    expect(keysOf(merged.notFound)).not.toContain('1/X.sty')
  })

  it('lets an override 404 supersede a base file (and removes it from files)', () => {
    const base: WarmupCache = { files: [file('X.sty')], notFound: [] }
    const override: WarmupCache = { files: [], notFound: [{ format: 1, filename: 'X.sty' }] }
    const merged = mergeWarmupCaches(base, override)
    expect(keysOf(merged.notFound)).toContain('1/X.sty')
    expect(keysOf(merged.files)).not.toContain('1/X.sty')
  })

  it('never lists a key in both files and notFound', () => {
    const base: WarmupCache = {
      files: [file('A.sty')],
      notFound: [{ format: 1, filename: 'B.sty' }],
    }
    const override: WarmupCache = {
      files: [file('B.sty')],
      notFound: [{ format: 1, filename: 'A.sty' }],
    }
    const merged = mergeWarmupCaches(base, override)
    const fileKeys = new Set(keysOf(merged.files))
    expect(keysOf(merged.notFound).some((k) => fileKeys.has(k))).toBe(false)
  })
})

describe('WasmTexPdftexEngine persist watermark', () => {
  /** Drives compile() with a stub worker and a persist step that fails once. */
  class PersistTestableEngine extends WasmTexPdftexEngine {
    saveCalls = 0
    private failNext = true

    markReady(): void {
      this.status = 'ready'
    }

    enableDurable(): void {
      // maybePersistCache only runs when a durable cache exists; the persist step
      // itself is overridden below, so an empty stand-in is enough.
      ;(this as unknown as { durableCache: unknown }).durableCache = {}
    }

    installCompileWorker(): void {
      this.worker = {
        postMessage: () => {
          this.dispatchWorkerMessage(
            { cmd: 'compile', result: 'ok', status: 0, log: '' },
            noop,
            noop,
          )
        },
      } as unknown as EngineWorker
    }

    bumpDownload(): void {
      this.dispatchWorkerMessage({ cmd: 'downloading', file: 'x.sty' }, noop, noop)
    }

    // Stand in for the real dump + IndexedDB save; reject once to simulate a
    // transient quota/IndexedDB failure, succeed thereafter.
    override async persistTexliveCache(): Promise<void> {
      this.saveCalls++
      if (this.failNext) {
        this.failNext = false
        throw new Error('transient save failure')
      }
    }
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('retries the persist after a failed save instead of stranding fetched files', async () => {
    const engine = new PersistTestableEngine({ assetBaseUrl: '/', persistentCache: true })
    engine.markReady()
    engine.enableDurable()
    engine.installCompileWorker()

    engine.bumpDownload() // one new file fetched this session
    await engine.compile() // persist fires, save() rejects
    await flush()
    expect(engine.saveCalls).toBe(1)

    // No further downloads: a fixed watermark would short-circuit and never retry.
    await engine.compile()
    await flush()
    expect(engine.saveCalls).toBe(2) // retried because the first save did not commit
  })
})

describe('WasmTexPdftexEngine compile() result mapping', () => {
  const validPhaseTimings = {
    workerTotalMs: 20,
    heapRestoreMs: 7,
    heapSnapshotMs: 3,
    heapSnapshotBytes: 64 * 1024 * 1024,
    heapSizeBytes: 64 * 1024 * 1024,
    preambleBuildMs: 0,
    formatInstallMs: 2,
    preambleExportMs: 0,
    postProcessMs: 1,
    texRunMs: 10,
  }

  it('attaches profile-bound resolver evidence from the pdfTeX worker', async () => {
    const profile = {
      id: '2026-latest@rev',
      texliveYear: '2026' as const,
      mirrorRevision: 'rev',
    }
    const engine = new TestableEngine({
      assetBaseUrl: '/',
      texliveVersion: '2026',
      resolverProfile: profile,
    })
    engine.markReady()
    engine.installResolverWorker({
      requestedName: 'article.cls',
      format: 26,
      outcome: 'resolved',
      attempts: [{ source: 'warmup-cache', outcome: 'hit' }],
    })

    expect((await engine.compile()).telemetry?.resolver).toMatchObject({
      profile,
      entries: [{ stage: 'pdftex', requestedName: 'article.cls', outcome: 'resolved' }],
    })
  })

  it('maps valid worker phase timings and rejects malformed telemetry', async () => {
    const valid = new TestableEngine({ assetBaseUrl: '/' })
    valid.markReady()
    valid.installWorker(() => ({
      cmd: 'compile',
      result: 'ok',
      status: 0,
      phaseTimings: validPhaseTimings,
    }))
    await expect(valid.compile()).resolves.toMatchObject({
      phaseTimings: validPhaseTimings,
    })

    const malformed = new TestableEngine({ assetBaseUrl: '/' })
    malformed.markReady()
    malformed.installWorker(() => ({
      cmd: 'compile',
      result: 'ok',
      status: 0,
      phaseTimings: { workerTotalMs: -1 },
    }))
    expect((await malformed.compile()).phaseTimings).toBeUndefined()
  })

  it('maps bounded worker observations without changing compile output', async () => {
    const engine = new TestableEngine({ assetBaseUrl: '/' })
    const pdf = Uint8Array.of(37, 80, 68, 70).buffer
    engine.markReady()
    engine.installWorker(() => ({
      cmd: 'compile',
      result: 'ok',
      status: 0,
      pdf,
      log: 'stable engine log',
      engineCommands: ['runtimecmd\t111\t1'],
      engineCommandsComplete: true,
      engineCommandsDropped: 0,
      inputFiles: ['/work/main.tex', '/tex/xcolor.sty'],
      inputFilesComplete: true,
      completionObservations: [
        'counter\truntimecounter',
        'color\truntimecolor',
        'key\tlayout\truntimekey',
        'meta\tcounter\t0',
        'meta\tcolor\t0',
        'meta\tkey\t0',
      ],
    }))

    const result = await engine.compile()

    expect(result).toMatchObject({
      success: true,
      log: 'stable engine log',
      engineCommands: ['runtimecmd\t111\t1'],
      engineCommandsComplete: true,
      engineCommandsDropped: 0,
      inputFiles: ['/work/main.tex', '/tex/xcolor.sty'],
      inputFilesComplete: true,
    })
    expect(result.pdf).toEqual(Uint8Array.of(37, 80, 68, 70))
    expect(engine.getCompletionObservation()).toEqual({
      counters: ['runtimecounter'],
      colors: ['runtimecolor'],
      keyFamilies: [{ name: 'layout', keys: ['runtimekey'] }],
      complete: true,
      fieldCompleteness: { counters: true, colors: true, keyFamilies: true },
      dropped: { counters: 0, colors: 0, keyFamilies: 0 },
    })

    const observation = engine.getCompletionObservation()
    observation?.colors.push('mutated-by-consumer')
    expect(engine.getCompletionObservation()?.colors).toEqual(['runtimecolor'])
  })

  it('bounds malformed worker observations and marks their coverage incomplete', async () => {
    const engine = new TestableEngine({ assetBaseUrl: '/' })
    engine.markReady()
    engine.installWorker(() => ({
      cmd: 'compile',
      result: 'ok',
      status: 0,
      pdf: Uint8Array.of(37, 80, 68, 70).buffer,
      engineCommands: ['kept\t111\t0', { forged: 'command' }],
      engineCommandsComplete: true,
      engineCommandsDropped: 0,
      inputFiles: ['/work/main.tex', { forged: 'path' }],
      inputFilesComplete: true,
      completionObservations: [
        'meta\tcounter\t0',
        'meta\tcolor\t0',
        'meta\tkey\t0',
        { forged: 'observation' },
      ],
    }))

    const result = await engine.compile()

    expect(result.engineCommands).toEqual(['kept\t111\t0'])
    expect(result.engineCommandsComplete).toBe(false)
    expect(result.engineCommandsDropped).toBe(1)
    expect(result.inputFiles).toEqual(['/work/main.tex'])
    expect(result.inputFilesComplete).toBe(false)
    expect(engine.getCompletionObservation()?.fieldCompleteness).toEqual({
      counters: false,
      colors: false,
      keyFamilies: false,
    })
  })

  it('returns null synctex when the worker omits the synctex field on a successful compile', async () => {
    const engine = new TestableEngine({ assetBaseUrl: '/' })
    const pdf = new Uint8Array([1, 2, 3]).buffer
    engine.markReady()
    // A successful compile that produced no .synctex file: the worker omits `synctex`.
    engine.installWorker(() => ({ cmd: 'compile', result: 'ok', status: 0, pdf, log: '' }))

    const result = await engine.compile()

    expect(result.success).toBe(true)
    expect(result.pdf).not.toBeNull()
    // synctex must be null (not an empty Uint8Array) so the viewer clears stale state.
    expect(result.synctex).toBeNull()
  })

  it('maps a success reply with no pdf to null, not a zero-length buffer', async () => {
    const engine = new TestableEngine({ assetBaseUrl: '/' })
    engine.markReady()
    // result:'ok' but the worker shipped no PDF (e.g. a document that produced no pages).
    // `new Uint8Array(undefined)` would yield a 0-byte buffer that downstream
    // `if (result.pdf)` checks treat as a renderable PDF — pdf must be null instead.
    engine.installWorker(() => ({ cmd: 'compile', result: 'ok', status: 0, log: '' }))

    const result = await engine.compile()

    expect(result.pdf).toBeNull()
  })
})

/** Exposes injectWarmupCache + a pendingResponses size probe, with a fake worker
 *  whose postMessage may or may not reply (simulating new vs. old worker glue). */
class WarmupTestableEngine extends WasmTexPdftexEngine {
  /** Install a worker that records sent commands and optionally auto-replies. */
  installWorker(replyToPreload404: boolean): void {
    this.status = 'ready'
    this.worker = {
      postMessage: (msg: unknown) => {
        const m = msg as { cmd?: string; msgId?: string }
        if (!replyToPreload404) return // old worker: ignores preload404, never replies
        if (m.cmd === 'preload404' && m.msgId) {
          this.dispatchWorkerMessage(
            { result: 'ok', cmd: 'preload404', msgId: m.msgId },
            noop,
            noop,
          )
        }
      },
    } as unknown as EngineWorker
  }

  runInjectWarmup(cache: WarmupCache): Promise<void> {
    return this.injectWarmupCache(cache)
  }

  get pendingSize(): number {
    return this.pendingResponses.size
  }
}

describe('WasmTexPdftexEngine preload404 timeout cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const cache: WarmupCache = { files: [], notFound: [{ format: 1, filename: 'missing.sty' }] }

  it('discards the orphaned preload404 waiter when an old worker never replies', async () => {
    const engine = new WarmupTestableEngine({ assetBaseUrl: '/' })
    engine.installWorker(false) // old worker: no preload404 reply

    const p = engine.runInjectWarmup(cache)
    expect(engine.pendingSize).toBe(1) // waiter registered

    await vi.advanceTimersByTimeAsync(2000)
    await p // resolves via the timeout, does not hang

    // The orphaned waiter must be cleaned up — not left to leak for the engine lifetime.
    expect(engine.pendingSize).toBe(0)
  })

  it('resolves and clears normally when a current worker replies before the timeout', async () => {
    const engine = new WarmupTestableEngine({ assetBaseUrl: '/' })
    engine.installWorker(true) // current worker replies to preload404

    await engine.runInjectWarmup(cache)
    expect(engine.pendingSize).toBe(0)
  })
})

describe('WasmTexPdftexEngine concurrent response routing', () => {
  it('resolves every concurrent cmd-keyed request (no resolver overwrite)', async () => {
    const engine = new TestableEngine({ assetBaseUrl: '/' })
    engine.markReady()
    engine.installWorker() // replies are delivered manually below

    let aResolved = false
    let bResolved = false
    const pA = engine.writeFile('a.tex', 'A').then(() => {
      aResolved = true
    })
    const pB = engine.writeFile('b.tex', 'B').then(() => {
      bResolved = true
    })

    // A single-threaded worker emits one writefile reply per command, in order.
    engine.deliver({ cmd: 'writefile', result: 'ok' })
    engine.deliver({ cmd: 'writefile', result: 'ok' })

    await Promise.race([Promise.all([pA, pB]), new Promise((resolve) => setTimeout(resolve, 200))])

    expect(aResolved).toBe(true)
    expect(bResolved).toBe(true)
  })
})
