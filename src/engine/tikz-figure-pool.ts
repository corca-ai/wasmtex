/**
 * Sibling-compiler pool that renders TikZ figure jobs (#82). Kept in its own module so the
 * headless compiler can load it on first use only — most documents never externalize.
 */

/** A figure rendered by a figure job, keyed by the library's own MD5. */
export interface RenderedFigure {
  md5: string | null
  pdf: Uint8Array
  /** `<figure>.dpth` (baseline depth + smuggled aux data) when the library wrote one. */
  dpth: string | null
  /** The figure job's log: a picture error does not fail the job (TeX keeps going and
   *  still ships the page), so its diagnostics live only here. */
  log: string
}

export interface FigureJobRequest {
  name: string
  md5: string | null
}

export interface FigureJobFailure {
  name: string
  log: string
}

/** Minimal sibling-compiler surface the pool drives (satisfied by `WasmTexCompiler`). */
export interface FigureCompiler {
  init(): Promise<void>
  setFile(path: string, content: string | Uint8Array): void
  compile(): Promise<{ success: boolean; pdf: Uint8Array | null; log: string }>
  readOutput(path: string): Promise<string | null>
  dispose(): void
}

export interface FigurePoolRun {
  rendered: Map<string, RenderedFigure>
  failures: FigureJobFailure[]
  /** Wall-clock milliseconds spent rendering (all workers, overlapped). */
  elapsedMs: number
}

interface FigureWorker {
  compiler: FigureCompiler
  ready: Promise<void>
  /** Content last written per project path, so unchanged files aren't re-sent. */
  synced: Map<string, string | Uint8Array>
}

/**
 * Lazily created pool of sibling compilers that render figure jobs concurrently and keep
 * the rendered figures (by name + MD5) so unchanged pictures never recompile.
 */
export class TikzFigurePool {
  private readonly workers: FigureWorker[] = []
  readonly cache = new Map<string, RenderedFigure>()

  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly factory: () => FigureCompiler,
    private readonly size: number,
    private readonly mainFile: string,
    /** Release the engine workers (not the rendered figures) after this much idle time. */
    private readonly idleMs = 5 * 60_000,
  ) {}

  /** Number of live engine workers (for tests and telemetry). */
  get liveWorkers(): number {
    return this.workers.length
  }

  /** Terminate idle engine workers; rendered figures stay cached. */
  releaseWorkers(): void {
    for (const worker of this.workers) worker.compiler.dispose()
    this.workers.length = 0
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private scheduleRelease(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.releaseWorkers(), this.idleMs)
  }

  /** Figures whose cached render is still current for the listed MD5. */
  isCurrent(name: string, md5: string | null): boolean {
    const cached = this.cache.get(name)
    return !!cached && md5 !== null && cached.md5 === md5
  }

  /** Drop cached figures the document no longer lists. */
  retain(names: Iterable<string>): void {
    const keep = new Set(names)
    for (const name of this.cache.keys()) if (!keep.has(name)) this.cache.delete(name)
  }

  async render(
    jobs: FigureJobRequest[],
    sourceFor: (figure: string) => string,
    projectFiles: () => Iterable<[string, string | Uint8Array]>,
  ): Promise<FigurePoolRun> {
    const t0 = performance.now()
    const rendered = new Map<string, RenderedFigure>()
    const failures: FigureJobFailure[] = []
    if (jobs.length === 0) return { rendered, failures, elapsedMs: 0 }
    if (this.idleTimer) clearTimeout(this.idleTimer)
    const count = Math.max(1, Math.min(this.size, jobs.length))
    while (this.workers.length < count) this.workers.push(this.spawn())
    let next = 0
    const run = async (worker: FigureWorker): Promise<void> => {
      await worker.ready
      while (next < jobs.length) {
        const job = jobs[next++]!
        this.syncProject(worker, projectFiles())
        worker.compiler.setFile(this.mainFile, sourceFor(job.name))
        worker.synced.delete(this.mainFile)
        const result = await worker.compiler.compile()
        if (!result.success || !result.pdf) {
          failures.push({ name: job.name, log: result.log })
          continue
        }
        const dpth = await worker.compiler.readOutput(`${job.name}.dpth`)
        const figure: RenderedFigure = { md5: job.md5, pdf: result.pdf, dpth, log: result.log }
        rendered.set(job.name, figure)
        this.cache.set(job.name, figure)
      }
    }
    await Promise.all(this.workers.slice(0, count).map(run))
    this.scheduleRelease()
    return { rendered, failures, elapsedMs: performance.now() - t0 }
  }

  dispose(): void {
    this.releaseWorkers()
    this.cache.clear()
  }

  private spawn(): FigureWorker {
    const compiler = this.factory()
    return { compiler, ready: compiler.init(), synced: new Map() }
  }

  private syncProject(worker: FigureWorker, files: Iterable<[string, string | Uint8Array]>): void {
    for (const [path, content] of files) {
      if (path === this.mainFile) continue
      if (worker.synced.get(path) === content) continue
      worker.compiler.setFile(path, content)
      worker.synced.set(path, content)
    }
  }
}
