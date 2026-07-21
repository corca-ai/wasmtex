import { perf } from '../perf/metrics'
import type { CompileResult } from '../types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class CompileScheduler {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private compiling = false
  private pendingCompile = false
  private generation = 0
  private lastCompileTime = 0
  private minDebounceMs: number
  private maxDebounceMs: number
  /** Poll interval for retrying a compile blocked on engine readiness. */
  private readonly readyRetryMs = 50
  /** Consecutive ready-retries already spent on the current pending compile. */
  private readyRetries = 0
  /** Cap on ready-retries (~2s at 50ms) before giving up and surfacing a failure, so a
   *  permanently-not-ready engine isn't polled forever with the compile silently dropped. */
  private readonly maxReadyRetries = 40

  constructor(
    private engine: { compile(): Promise<CompileResult>; isReady(): boolean },
    private onResult: (result: CompileResult) => void,
    private onStatusChange: (status: import('../types').AppStatus, detail?: string) => void,
    { minDebounceMs = 150, maxDebounceMs = 1000 } = {},
  ) {
    this.minDebounceMs = minDebounceMs
    this.maxDebounceMs = maxDebounceMs
  }

  private get debounceMs(): number {
    if (this.lastCompileTime === 0) return this.minDebounceMs
    return clamp(this.lastCompileTime * 0.5, this.minDebounceMs, this.maxDebounceMs)
  }

  schedule(): void {
    this.generation++
    this.readyRetries = 0 // a fresh edit restarts the ready-retry budget

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      perf.end('debounce')
      perf.mark('compile')
      this.runCompile()
    }, this.debounceMs)
  }

  /** Re-arm the debounce timer to retry a compile once the engine becomes ready. */
  private armReadyRetry(): void {
    if (this.debounceTimer) return
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.runCompile()
    }, this.readyRetryMs)
  }

  private async runCompile(): Promise<void> {
    if (this.compiling) {
      this.pendingCompile = true
      return
    }

    if (!this.engine.isReady()) {
      // Don't drop this compile: the engine is still loading or hot-swapping. Retry on a
      // fixed interval until it's ready (a later edit supersedes via schedule()/cancel()).
      // But give up after maxReadyRetries so a permanently-not-ready engine (e.g. it errored
      // out during the debounce window) isn't polled forever with the compile never reported.
      if (this.readyRetries >= this.maxReadyRetries) {
        this.readyRetries = 0
        this.onStatusChange('error', 'Engine not ready')
        this.onResult({
          success: false,
          pdf: null,
          log: 'Engine not ready',
          errors: [{ line: 0, message: 'Compile aborted: engine not ready', severity: 'error' }],
          compileTime: 0,
          synctex: null,
        })
        return
      }
      this.readyRetries++
      this.armReadyRetry()
      return
    }
    this.readyRetries = 0 // engine became ready → reset for the next not-ready episode

    this.compiling = true
    const compileGeneration = this.generation
    this.onStatusChange('compiling')

    try {
      const result = await this.engine.compile()
      this.lastCompileTime = result.compileTime

      if (compileGeneration === this.generation) {
        this.onResult(result)
      }
    } catch (err) {
      // A cancelled in-flight compile (engine disposed/terminated mid-run) settles
      // as an AbortError — that's expected teardown, not a compile failure, so
      // don't log it or surface a spurious error result.
      if (!(err instanceof Error && err.name === 'AbortError')) {
        console.error('Compilation error:', err)
        if (compileGeneration === this.generation) {
          this.onResult({
            success: false,
            pdf: null,
            log: String(err),
            errors: [{ line: 0, message: String(err), severity: 'error' }],
            compileTime: 0,
            synctex: null,
          })
        }
      }
    } finally {
      this.compiling = false

      if (this.pendingCompile) {
        this.pendingCompile = false
        this.runCompile()
      }
    }
  }

  /** Immediately fire the pending debounce timer (skip remaining wait). */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      perf.end('debounce')
      perf.mark('compile')
      this.runCompile()
    }
  }

  cancel(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingCompile = false
  }

  getDebounceMs(): number {
    return this.debounceMs
  }
}
