import type {
  CachedTexliveFile,
  CompletionSnapshotProfile,
  ResolverEvidenceReport,
  ResolverStage,
  TexliveFileEntry,
  TexliveVersion,
} from '../types'
import { BaseWorkerEngine, resolveTexliveUrl } from './base-worker-engine'
import { type RawResolverEvidence, ResolverEvidenceCollector } from './resolver-evidence'
import { createEngineWorker } from './worker-host'

/** Messages exchanged with a WasmTex engine worker. */
export interface WasmTexWorkerMsg {
  result?: string
  cmd?: string
  status?: number
  log?: string
  pdf?: ArrayBuffer
  data?: string
  file?: string
  errorName?: string
  errorMessage?: string
  errorStack?: string
  errorLog?: string
  inputFiles?: string[]
  inputFilesComplete?: boolean
  /** dumpcache response: fetched files + known-missing entries. */
  files?: CachedTexliveFile[]
  notFound?: TexliveFileEntry[]
  evidence?: RawResolverEvidence
}

/**
 * Shared driver for WasmTex workers (BibTeX, XeTeX, dvipdfmx) that
 * speak the simple `settexliveurl` / `writefile` / `readfile` / `<compile>`
 * protocol — i.e. without the corca-specific commands (bloom, preloadtexlive,
 * dumpcache, …) that `WasmTexPdftexEngine` relies on. Subclasses add their own
 * compile entry point.
 */
/** Rehydrate the structured error a worker posts before dying — the ErrorEvent
 * that follows a WASM trap often carries no message, engine log, or stack. */
function workerErrorFromMsg(data: WasmTexWorkerMsg): Error {
  const log = data.errorLog ? `\nEngine log:\n${data.errorLog}` : ''
  const error = new Error(`${data.errorMessage || 'Worker error'}${log}`)
  if (data.errorName) error.name = data.errorName
  if (data.errorStack) {
    const frames = data.errorStack.split('\n').slice(1).join('\n')
    error.stack = `${error.name}: ${error.message}${frames ? `\n${frames}` : ''}`
  }
  return error
}

export abstract class WasmTexWorker<
  TMsg extends WasmTexWorkerMsg = WasmTexWorkerMsg,
> extends BaseWorkerEngine<TMsg> {
  public onFileDownload?: (filename: string) => void
  protected version: TexliveVersion

  constructor(enginePath: string, texliveUrl: string | null, version: TexliveVersion) {
    super(enginePath, texliveUrl)
    this.version = version
  }

  async init(): Promise<void> {
    if (this.worker) return
    this.status = 'loading'
    await new Promise<void>((resolve, reject) => {
      this.worker = createEngineWorker(this.enginePath)
      this.worker.onmessage = (ev) => {
        const data = ev.data as TMsg
        if (!data.cmd) {
          if (data.result === 'ok') {
            this.status = 'ready'
            resolve()
          } else {
            this.failInit(reject, new Error('engine failed to initialize'))
          }
          return
        }
        if (this.handleProtocolMessage(data)) return
        if (data.cmd === 'downloading' && data.file) {
          this.onFileDownload?.(data.file)
          return
        }
        if (data.cmd === 'workererror') {
          this.failInit(reject, workerErrorFromMsg(data))
          return
        }
        this.deliverResponse(`cmd:${data.cmd}`, data)
      }
      this.worker.onerror = (err) => {
        this.failInit(reject, err)
      }
    })
    this.worker!.postMessage({
      cmd: 'settexliveurl',
      url: resolveTexliveUrl(this.texliveUrl, this.version),
    })
  }

  protected handleProtocolMessage(_data: TMsg): boolean {
    return false
  }

  /** Tear down a worker that failed to initialize and settle any in-flight request. The
   *  worker reference MUST be cleared (only terminate() did this before): otherwise the
   *  `if (this.worker) return` re-entry guard would let a later init() resolve silently
   *  against a dead, errored worker instead of recreating one. */
  private failInit(reject: (err: Error) => void, err: unknown): void {
    this.worker?.terminate()
    this.worker = null
    reject(this.handleWorkerError(err))
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    if (!this.worker) return
    await this.postMessageWithResponse(
      { cmd: 'writefile', url: path, src: content },
      'cmd:writefile',
    )
  }

  mkdir(path: string): void {
    this.worker?.postMessage({ cmd: 'mkdir', url: path })
  }

  setMainFile(path: string): void {
    this.worker?.postMessage({ cmd: 'setmainfile', url: path })
  }

  async readFile(path: string): Promise<string | null> {
    if (!this.worker) return null
    const data = await this.postMessageWithResponse({ cmd: 'readfile', url: path }, 'cmd:readfile')
    return data.result === 'ok' ? (data.data ?? null) : null
  }

  flushCache(): void {
    this.worker?.postMessage({ cmd: 'flushcache' })
  }

  isReady(): boolean {
    return this.status === 'ready'
  }
}

/** Result of a single {@link CompileWorkerDriver.run} command. */
export interface CompileWorkerResult {
  success: boolean
  log: string
  /** The binary the worker produced (PDF for luatex/dvipdfmx, XDV/fmt for xetex). */
  out: Uint8Array | null
  inputFiles?: string[]
  inputFilesComplete?: boolean
  resolver?: ResolverEvidenceReport
}

/**
 * A WasmTex worker with a single-command compile entry point, shared by
 * the Unicode engines (XeTeX + dvipdfmx, LuaTeX). The worker replies to every
 * `compile*` command under the `cmd:compile` key with `{result,status,log,pdf}`.
 */
export class CompileWorkerDriver extends WasmTexWorker {
  private readonly resolver: ResolverEvidenceCollector

  constructor(
    enginePath: string,
    texliveUrl: string | null,
    version: TexliveVersion,
    stage: ResolverStage = 'pdftex',
    profile: CompletionSnapshotProfile = {
      id: `texlive-${version}`,
      texliveYear: version,
      mirrorRevision: null,
    },
  ) {
    super(enginePath, texliveUrl, version)
    this.resolver = new ResolverEvidenceCollector(stage, profile)
  }

  protected override handleProtocolMessage(data: WasmTexWorkerMsg): boolean {
    if (data.cmd === 'resolverready') {
      this.resolver.markSupported()
      return true
    }
    if (data.cmd === 'resolver' && data.evidence) {
      this.resolver.record(data.evidence)
      return true
    }
    return false
  }

  /** Run `command` (`compilelatex` | `compileformat` | `compilepdf`) and collect
   *  the output. status 0 (ok) and 1 (warnings) both count as success. */
  async run(command: string): Promise<CompileWorkerResult> {
    if (this.status !== 'ready' || !this.worker) {
      return { success: false, log: 'engine not ready', out: null }
    }
    this.status = 'compiling'
    this.resolver.begin()
    const data = await this.postMessageWithResponse({ cmd: command }, 'cmd:compile')
    const resolver = this.resolver.finish()
    this.status = 'ready'
    const success = data.result === 'ok' && (data.status === 0 || data.status === 1)
    const out = data.pdf ? new Uint8Array(data.pdf) : null
    return {
      success,
      log: data.log || '',
      out,
      ...(data.inputFiles ? { inputFiles: data.inputFiles } : {}),
      ...(typeof data.inputFilesComplete === 'boolean'
        ? { inputFilesComplete: data.inputFilesComplete }
        : {}),
      ...(resolver ? { resolver } : {}),
    }
  }

  /** Load the CDN bloom filter so the worker skips sync XHR for definitely-
   *  missing files (fire-and-forget; the worker sends no reply). The buffer is
   *  cloned, NOT transferred — it's tiny (~172 KB) and the engine keeps it to
   *  store in the durable cache; transferring would detach that copy. */
  loadBloom(buf: ArrayBuffer): void {
    this.worker?.postMessage({ cmd: 'loadbloom', data: buf })
  }

  /** Inject a prefetched TeX Live file into the worker cache (warmup). Fire-and-
   *  forget: the worker processes messages FIFO, so all preloads land before the
   *  later `compilelatex`; not awaiting a reply keeps a stale worker (one without
   *  this command) from hanging the compile — it just degrades to on-demand XHR.
   *  Transfers buf. */
  preloadTexlive(
    format: number,
    filename: string,
    buf: ArrayBuffer,
    source: 'warmup-cache' | 'persistent-cache',
  ): void {
    this.worker?.postMessage({ cmd: 'preloadtexlive', format, filename, data: buf, source }, [buf])
  }

  /** Pre-seed known-missing lookups so the worker skips their sync XHR
   *  (fire-and-forget, same rationale as {@link preloadTexlive}). */
  preload404(
    entries: ReadonlyArray<{ format: number; filename: string }>,
    source: 'warmup-negative' | 'durable-negative',
  ): void {
    if (entries.length === 0) return
    this.worker?.postMessage({ cmd: 'preload404', entries, source })
  }

  /** Export every TeX Live file fetched/preloaded this session, plus known-missing
   *  entries, for the durable cache. */
  async dumpCache(): Promise<{ files: CachedTexliveFile[]; notFound: TexliveFileEntry[] }> {
    if (!this.worker) return { files: [], notFound: [] }
    const data = await this.postMessageWithResponse({ cmd: 'dumpcache' }, 'cmd:dumpcache')
    return { files: data.files ?? [], notFound: data.notFound ?? [] }
  }
}
