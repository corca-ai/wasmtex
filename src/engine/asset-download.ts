import { readResponseWithProgress } from './fetch-gz'

export type AssetDownloadKind = 'format' | 'package' | 'font' | 'data'
export type AssetDownloadFailure = 'stalled' | 'network' | 'http' | 'invalid'

/** No URL or project filename crosses this diagnostic boundary. */
export interface AssetDownloadEvent {
  requestId: number
  asset: AssetDownloadKind
  phase: 'start' | 'bytes' | 'retry' | 'end'
  receivedBytes: number
  lastByteAgeMs: number | null
  retryCount: number
  failure?: AssetDownloadFailure
  status?: number
}

export class AssetDownloadError extends Error {
  constructor(
    readonly failure: AssetDownloadFailure,
    readonly status?: number,
  ) {
    super(`TeX asset download failed: ${failure}${status ? ` (${status})` : ''}`)
    this.name = 'AssetDownloadError'
  }
}

interface DownloadInput {
  asset: AssetDownloadKind
  signal?: AbortSignal
  onPercent?: (percent: number) => void
  validate?: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>
}

interface DownloadState {
  requestId: number
  asset: AssetDownloadKind
  receivedBytes: number
  lastByteAt: number | null
  retryCount: number
}

// Sessions can overlap while a compiler changes engines. Their events share
// one host observer, so IDs must remain unique across those sessions.
let nextRequestId = 0

/** One recovery budget shared by one compiler attempt's asset requests. */
export class AssetDownloadSession {
  private remainingRetries = 8
  private generation = 0
  private workerRequests = new WeakMap<object, Map<number, number>>()

  constructor(
    private readonly onEvent?: (event: AssetDownloadEvent) => void,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  /** Start another explicit compile attempt after the host has serialized prior work.
   * Late completions from the previous attempt cannot refill or spend its allowance. */
  beginAttempt(): void {
    this.generation++
    this.remainingRetries = 8
  }

  /** Worker-local IDs are translated into the same host-wide request namespace. */
  recordWorkerEvent(owner: object, event: AssetDownloadEvent): void {
    let requests = this.workerRequests.get(owner)
    if (!requests) {
      requests = new Map()
      this.workerRequests.set(owner, requests)
    }
    let requestId = requests.get(event.requestId)
    if (requestId === undefined) {
      if (event.phase !== 'start') return
      requestId = ++nextRequestId
      requests.set(event.requestId, requestId)
    }
    if (event.phase === 'end') requests.delete(event.requestId)
    const { asset, phase, receivedBytes, lastByteAgeMs, retryCount, failure, status } = event
    try {
      this.onEvent?.({
        requestId,
        asset,
        phase,
        receivedBytes,
        lastByteAgeMs,
        retryCount,
        ...(failure === undefined ? {} : { failure }),
        ...(status === undefined ? {} : { status }),
      })
    } catch {
      /* Diagnostics cannot fail transport. */
    }
  }

  /** Reserve retries before a synchronous Worker operation; concurrent fetches
   * cannot spend the same allowance. Legacy Workers return no budget field. */
  reserveRetries() {
    const generation = this.generation
    const limit = this.remainingRetries
    this.remainingRetries = 0
    let settled = false
    return {
      limit,
      settle: (remaining?: unknown) => {
        if (settled || generation !== this.generation) return
        settled = true
        if (remaining === undefined) this.remainingRetries += limit
        else if (
          typeof remaining === 'number' &&
          Number.isInteger(remaining) &&
          remaining >= 0 &&
          remaining <= limit
        )
          this.remainingRetries += remaining
      },
    }
  }

  async read(url: string, input: DownloadInput): Promise<Uint8Array | null> {
    const generation = this.generation
    const state: DownloadState = {
      requestId: ++nextRequestId,
      asset: input.asset,
      receivedBytes: 0,
      lastByteAt: null,
      retryCount: 0,
    }
    try {
      for (;;) {
        input.signal?.throwIfAborted()
        try {
          return await this.transfer(url, input, state)
        } catch (error) {
          input.signal?.throwIfAborted()
          const failure =
            error instanceof AssetDownloadError ? error : new AssetDownloadError('network')
          if (
            generation !== this.generation ||
            !this.retryable(failure) ||
            state.retryCount >= 3 ||
            !this.remainingRetries
          ) {
            this.emit(state, 'end', failure)
            throw failure
          }
          this.remainingRetries--
          state.retryCount++
          this.emit(state, 'retry', failure)
          // A temporarily offline page retries on a bounded schedule. online is
          // deliberately not treated as proof that this origin is reachable.
          await delay([2_000, 8_000, 20_000][state.retryCount - 1] ?? 20_000, input.signal)
        }
      }
    } catch (error) {
      if (input.signal?.aborted) this.emit(state, 'end')
      throw error
    }
  }

  private retryable(error: AssetDownloadError) {
    return (
      error.failure === 'network' ||
      error.failure === 'stalled' ||
      (error.failure === 'http' &&
        (error.status === 408 ||
          error.status === 429 ||
          (error.status !== undefined && error.status >= 500)))
    )
  }

  private emit(
    state: DownloadState,
    phase: AssetDownloadEvent['phase'],
    error?: AssetDownloadError,
  ) {
    const { lastByteAt, ...rest } = state
    try {
      this.onEvent?.({
        ...rest,
        phase,
        lastByteAgeMs: lastByteAt === null ? null : Math.max(0, Date.now() - lastByteAt),
        ...(error ? { failure: error.failure } : {}),
        ...(error?.status === undefined ? {} : { status: error.status }),
      })
    } catch {
      /* Observability cannot fail a transfer. */
    }
  }

  private async validate(bytes: Uint8Array, input: DownloadInput, signal: AbortSignal) {
    try {
      const result = input.validate ? await input.validate(bytes) : bytes
      signal.throwIfAborted()
      return result
    } catch {
      signal.throwIfAborted()
      throw new AssetDownloadError('invalid')
    }
  }

  private async transfer(url: string, input: DownloadInput, state: DownloadState) {
    const controller = new AbortController()
    const signal = input.signal
      ? AbortSignal.any([input.signal, controller.signal])
      : controller.signal
    const stall = () => controller.abort(new AssetDownloadError('stalled'))
    let timer = setTimeout(stall, 30_000)
    state.receivedBytes = 0
    state.lastByteAt = null
    this.emit(state, 'start')
    try {
      const response = await this.fetchImpl(url, {
        signal,
        cache: state.retryCount ? 'reload' : 'default',
      })
      if (response.status === 404) {
        await response.body?.cancel()
        this.emit(state, 'end', new AssetDownloadError('http', 404))
        return null
      }
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
        await response.body?.cancel()
        throw new AssetDownloadError(response.ok ? 'invalid' : 'http', response.status)
      }
      const bytes = await readResponseWithProgress(
        response,
        input.onPercent,
        (received) => {
          state.receivedBytes = received
          state.lastByteAt = Date.now()
          clearTimeout(timer)
          timer = setTimeout(stall, 30_000)
          this.emit(state, 'bytes')
        },
        signal,
      )
      clearTimeout(timer)
      const validated = await this.validate(bytes, input, signal)
      this.emit(state, 'end')
      return validated
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

/** Closed worker protocol: ignore malformed counters and unrecognized classifications. */
export function isAssetDownloadEvent(value: unknown): value is AssetDownloadEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Partial<AssetDownloadEvent>
  return (
    typeof event.requestId === 'number' &&
    Number.isSafeInteger(event.requestId) &&
    event.requestId > 0 &&
    ['format', 'package', 'font', 'data'].includes(event.asset ?? '') &&
    ['start', 'bytes', 'retry', 'end'].includes(event.phase ?? '') &&
    typeof event.receivedBytes === 'number' &&
    Number.isSafeInteger(event.receivedBytes) &&
    event.receivedBytes >= 0 &&
    (event.lastByteAgeMs === null ||
      (typeof event.lastByteAgeMs === 'number' &&
        Number.isFinite(event.lastByteAgeMs) &&
        event.lastByteAgeMs >= 0)) &&
    typeof event.retryCount === 'number' &&
    Number.isInteger(event.retryCount) &&
    event.retryCount >= 0 &&
    event.retryCount <= 3 &&
    (event.failure === undefined ||
      ['stalled', 'network', 'http', 'invalid'].includes(event.failure)) &&
    (event.status === undefined ||
      (Number.isInteger(event.status) && event.status >= 100 && event.status <= 599))
  )
}
