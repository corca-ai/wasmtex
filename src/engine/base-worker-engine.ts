import type { EngineStatus, TexliveVersion } from '../types'
import type { EngineWorker } from './worker-host'

/** An `AbortError`-named Error, the conventional signal for a cancelled async op
 *  (consumers can branch on `err.name === 'AbortError'`). */
function abortError(message: string): Error {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/** Rebuild an `Error` from an error-shaped object of another realm (e.g. a
 * structured-cloned worker exception that fails `instanceof Error` here). */
function errorFromForeign(value: unknown): Error | null {
  if (typeof value !== 'object' || value === null) return null
  const foreign = value as { message?: unknown; name?: unknown; stack?: unknown }
  const message = nonEmptyString(foreign.message)
  if (!message) return null
  const error = new Error(message)
  const name = nonEmptyString(foreign.name)
  if (name) error.name = name
  const stack = nonEmptyString(foreign.stack)
  if (stack) error.stack = stack
  return error
}

function eventLocation(event: { filename?: unknown; lineno?: unknown; colno?: unknown }): string {
  const source = nonEmptyString(event.filename)
  if (!source) return ''
  const parts = [source]
  if (typeof event.lineno === 'number') {
    parts.push(String(event.lineno))
    if (typeof event.colno === 'number') parts.push(String(event.colno))
  }
  return ` (${parts.join(':')})`
}

/** Preserve the useful fields carried by a browser Worker `ErrorEvent`.
 * `ErrorEvent` is not itself an `Error`, so treating every non-Error as a generic
 * failure hides the only actionable clue (message/source location). */
function normalizeWorkerError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value !== 'object' || value === null) return new Error('Worker error')

  const event = value as {
    error?: unknown
    message?: unknown
    filename?: unknown
    lineno?: unknown
    colno?: unknown
  }
  if (event.error instanceof Error) return event.error
  const foreign = errorFromForeign(event.error)
  if (foreign) return foreign
  const message = nonEmptyString(event.message) ?? 'Worker error'
  return new Error(`${message}${eventLocation(event)}`)
}

/** Shared base for WASM worker engines (pdfTeX, BibTeX). */
export abstract class BaseWorkerEngine<TMsg = unknown> {
  protected worker: EngineWorker | null = null
  protected status: EngineStatus = 'unloaded'
  protected enginePath: string
  protected texliveUrl: string | null
  /**
   * Waiters per response key, oldest first. Legacy cmd-keyed requests
   * (`cmd:writefile`, `cmd:compile`, …) share a non-unique key, so concurrent
   * in-flight requests must queue rather than overwrite one another's resolver.
   */
  protected pendingResponses = new Map<
    string,
    Array<{ resolve: (data: TMsg) => void; reject: (reason: Error) => void }>
  >()

  public onProgress?: (progress: number) => void

  constructor(enginePath: string, texliveUrl: string | null) {
    this.enginePath = enginePath
    this.texliveUrl = texliveUrl
  }

  getStatus(): EngineStatus {
    return this.status
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.status = 'unloaded'
      // Reject (don't silently drop) any in-flight request so awaiters — notably
      // a compile() in progress — settle with an AbortError instead of hanging
      // forever (e.g. when a consumer disposes mid-compile to switch engines).
      this.rejectAllPending('Engine disposed while a request was in flight')
    }
  }

  /** Send a message to the worker and wait for a response keyed by responseKey. */
  protected postMessageWithResponse(
    msg: unknown,
    responseKey: string,
    transferables?: Transferable[],
  ): Promise<TMsg> {
    return new Promise<TMsg>((resolve, reject) => {
      const entry = { resolve, reject }
      const queue = this.pendingResponses.get(responseKey)
      if (queue) {
        queue.push(entry)
      } else {
        this.pendingResponses.set(responseKey, [entry])
      }
      if (transferables?.length) {
        this.worker!.postMessage(msg, transferables)
      } else {
        this.worker!.postMessage(msg)
      }
    })
  }

  /**
   * Deliver a worker response to the oldest waiter registered under `key` (FIFO,
   * matching the single-threaded worker's reply order). Returns true if a waiter
   * was waiting.
   */
  protected deliverResponse(key: string, data: TMsg): boolean {
    const queue = this.pendingResponses.get(key)
    if (!queue || queue.length === 0) return false
    const entry = queue.shift()!
    if (queue.length === 0) this.pendingResponses.delete(key)
    entry.resolve(data)
    return true
  }

  /** Reject every pending request (oldest-first) so awaiters settle instead of hanging.
   *  Pass a string to reject as an AbortError (graceful teardown, e.g. terminate()), or a
   *  concrete Error to surface a real failure (e.g. a worker crash). No-op when idle. */
  protected rejectAllPending(reason: string | Error): void {
    if (this.pendingResponses.size === 0) return
    const err = reason instanceof Error ? reason : abortError(reason)
    for (const queue of this.pendingResponses.values()) {
      for (const entry of queue) entry.reject(err)
    }
    this.pendingResponses.clear()
  }

  /** Handle a spontaneous worker error (WASM OOM / uncaught glue error) that fires AFTER
   *  init: mark the engine errored and settle every in-flight request — notably a pending
   *  `compile()` — with a real error so it rejects instead of hanging forever (which would
   *  wedge the scheduler with `compiling` stuck true). Returns the surfaced Error. */
  protected handleWorkerError(err: unknown): Error {
    const e = normalizeWorkerError(err)
    this.status = 'error'
    this.rejectAllPending(e)
    return e
  }
}

const CLOUDFRONT_BASE = 'https://d1jectpaw0dlvl.cloudfront.net/'

/** Resolve the TexLive server URL from an override, env var, or current origin. */
export function resolveTexliveUrl(
  override: string | null,
  version: TexliveVersion = '2025',
): string {
  if (override) return override.endsWith('/') ? override : `${override}/`

  const envUrl = import.meta.env.VITE_TEXLIVE_URL
  if (envUrl) return envUrl.endsWith('/') ? envUrl : `${envUrl}/`

  // Consistent versioned path: https://.../{version}/
  return `${CLOUDFRONT_BASE}${version}/`
}
