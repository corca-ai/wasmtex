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

/** One recovery budget shared by one compiler attempt's asset requests. */
export class AssetDownloadSession {
  private remainingRetries = 8
  private sequence = 0

  constructor(
    private readonly onEvent?: (event: AssetDownloadEvent) => void,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async read(url: string, input: DownloadInput): Promise<Uint8Array | null> {
    const state: DownloadState = {
      requestId: ++this.sequence,
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
          if (!this.retryable(failure) || state.retryCount >= 3 || !this.remainingRetries) {
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
