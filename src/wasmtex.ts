import type * as Monaco from 'monaco-editor'
import { binaryFileBlob } from './binary-file'
import { BinaryPreviewController } from './editor/binary-preview'
import {
  installOpenCodeEditorOverride,
  type OverrideHandle,
} from './editor/open-code-editor-override'
import { createEditor, createFileModel, revealLine } from './editor/setup'
import { BibtexEngine } from './engine/bibtex-engine'
import { unavailableEngineResult } from './engine/compile-engine'
import { CompileScheduler } from './engine/compile-scheduler'
import { normalizeProjectDependencyPath } from './engine/dependency-manifest'
import { type EngineDetection, resolveEngine } from './engine/engine-select'
import { IncrementalCompiler, type IncrementalResult } from './engine/incremental'
import { buildDiagnostics, parseTexErrors } from './engine/parse-errors'
import { RerunController, signatureOf } from './engine/rerun-controller'
import { WasmTexPdftexEngine } from './engine/wasmtex-engine'
import { syncAllFilesToEngine } from './fs/engine-sync'
import { saveOutgoingFile } from './fs/save-outgoing'
import { VirtualFS } from './fs/virtual-fs'
import { parseAuxFile } from './lsp/aux-parser'
import { rebuildBibIndex } from './lsp/bib-parser'
import { computeDiagnostics } from './lsp/diagnostic-provider'
import { type LintConfig, lintSource } from './lsp/linter'
import { createDefaultCompletionRegistry } from './lsp/neutral-providers'
import { ProjectIndex } from './lsp/project-index'
import { registerLatexProviders } from './lsp/register-providers'
import { parseTraceFile } from './lsp/trace-parser'
import { initPerfOverlay, perf } from './perf/metrics'
import type { SynctexData } from './synctex/synctex-parser'
import { SynctexParser } from './synctex/synctex-parser'
import './editor-runtime.css'
import type { WasmTexEventMap, WasmTexOptions, WasmTexStatusEvent } from './component-types'
import type { AppStatus, CompileResult, TexError, TexliveVersion } from './types'
import { setDiagnosticMarkers, setErrorMarkers } from './ui/error-markers'
import { PdfViewer } from './viewer/pdf-viewer'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp'])

/** Idle delay before a speculative checkpoint prebuild (#99). Long enough that transient
 *  pauses mid-typing don't trigger a wasted build; short enough to warm before the next edit. */
const PREBUILD_IDLE_MS = 500

function isImageFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(name.substring(dot).toLowerCase())
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type EventHandler<T> = (event: T) => void
type EditorContainerInput = string | HTMLElement
type ListenerMap = Map<keyof WasmTexEventMap, Set<EventHandler<unknown>>>

interface ViteImportMeta {
  env?: {
    BASE_URL?: string
  }
}

interface MonacoOpenCodeEditorInput {
  resource?: { toString(): string }
  options?: {
    selection?: Monaco.IRange
  }
}

interface MonacoCodeEditorService {
  openCodeEditor(
    input: MonacoOpenCodeEditorInput,
    source: unknown,
    sideBySide: unknown,
  ): Promise<unknown> | unknown
}

interface MonacoEditorWithCodeEditorService extends Monaco.editor.IStandaloneCodeEditor {
  _codeEditorService?: MonacoCodeEditorService
}

function resolveContainer(container: EditorContainerInput, name: string): HTMLElement {
  const node = typeof container === 'string' ? document.querySelector(container) : container

  if (!node) {
    throw new Error(`Failed to initialize ${name}.`)
  }

  if (!(node instanceof HTMLElement)) {
    throw new Error(`${name} must be a real HTMLElement.`)
  }

  return node
}

/** Resolves the base URL for assets like WASM and workers. */
function resolveAssetBase(provided?: string): string {
  if (provided) return provided.endsWith('/') ? provided : `${provided}/`

  // 1. Try Vite/build-time base URL
  const envBase = (import.meta as ImportMeta & ViteImportMeta).env?.BASE_URL
  if (envBase) return envBase.endsWith('/') ? envBase : `${envBase}/`

  // 2. Try to derive from current script URL (useful for CDNs/bundled apps)
  try {
    const url = new URL(import.meta.url)
    const path = url.pathname
    if (path.includes('/node_modules/')) return '/'
    const lastSlash = path.lastIndexOf('/')
    return url.origin + path.substring(0, lastSlash + 1)
  } catch {
    return '/'
  }
}

export class WasmTex {
  // --- Options ---

  private mainFile: string

  private opts: WasmTexOptions

  private assetBaseUrl: string

  // --- DOM ---

  private editorContainer: HTMLElement | null = null

  private previewContainer: HTMLElement | null = null

  // --- Components ---

  private engine: WasmTexPdftexEngine

  private fs: VirtualFS

  private synctexParser = new SynctexParser()

  private pdfViewer?: PdfViewer

  private scheduler!: CompileScheduler

  private editor!: Monaco.editor.IStandaloneCodeEditor

  private projectIndex = new ProjectIndex()

  private lspDisposables: { dispose(): void }[] = []

  // --- Models (one per project file, kept alive for cross-file diagnostics) ---

  private models = new Map<string, Monaco.editor.ITextModel>()

  private modelDisposables = new Map<string, Monaco.IDisposable>()

  // --- State ---

  private currentFile: string

  private runtimeScopeAttribute = 'data-wasmtex-runtime'

  private pendingRecompile = false
  private rerunController = new RerunController()

  // Monotonic render token. Each successful compile bumps it; an older render's
  // async .then() compares against it and bails so a superseded compile can't
  // emit a stale 'ready' status (e.g. a stale preambleSnapshot flag).
  private renderSeq = 0

  // Editor subscriptions (model/cursor change, the save action). Tracked so dispose() can
  // detach them — critical when an external editor is supplied, since we never dispose it.
  private interactionDisposables: Array<{ dispose(): void }> = []

  // Stored so dispose() can removeEventListener it (an anonymous handler leaks one global
  // listener — capturing this instance — per WasmTex created).
  private unhandledRejectionHandler: ((e: PromiseRejectionEvent) => void) | null = null
  /** Disposer for the optional ?perf=1 debug overlay (removes the div + unsubscribes). */
  private perfOverlayDispose: (() => void) | undefined

  private forwardSearchTimer: ReturnType<typeof setTimeout> | null = null

  private rerunTimer: ReturnType<typeof setTimeout> | null = null

  private lastForwardLine = -1

  private lastForwardFile = ''

  private switchingModel = false

  private previewEl: HTMLElement | null = null

  // Owns the binary-preview overlay's visibility + model-change-suppression decision.
  private preview: BinaryPreviewController | null = null

  // Restores Monaco's openCodeEditor on dispose (an external host editor outlives us).
  private openCodeEditorOverride: OverrideHandle | null = null

  // Object URL backing the current binary image preview, tracked so it can be
  // revoked on load, error, replacement, hide, and dispose (avoids blob leaks).
  private previewUrl: string | null = null

  private bibtexEngine: BibtexEngine | null = null

  private bibtexDone = false

  private pendingBibtex = false

  private bibtexRunId = 0

  // --- Incremental fast path (#99, opt-in via `incremental`) ---
  // Set when `incremental` is on (pdfLaTeX-only checkpoint fast path). null = always full.
  private incremental: IncrementalCompiler | null = null
  // True between serving a fast (incremental) paint and running its full reconcile. It
  // makes the NEXT scheduled compile a full reconcile (skip the fast path), and tells
  // onCompileResult the current result is a fast paint (keep last-full SyncTeX, don't
  // run bibtex/rerun — the reconcile does that). Reset by every onModelChange.
  private reconcileArmed = false
  // Speculative checkpoint prebuild (option A): armed when the loop goes idle, cancelled
  // by the next edit. `prebuildInFlight` serialises the worker — a compile awaits it.
  private prebuildTimer: ReturnType<typeof setTimeout> | null = null
  private prebuildInFlight: Promise<void> | null = null
  // True while compileActiveEngine drives the worker (fast path or full). buildCheckpoint/
  // compileFromCheckpoint don't flip the engine's ready status, so runPrebuild consults this to
  // avoid starting a speculative build on top of an in-flight fast-path compile.
  private compileInFlight = false
  // Bumped on every edit; compileActiveEngine uses it to detect a fast paint superseded mid-flight.
  private editEpoch = 0
  // SyncTeX splice (#99 P2): the exact spliced SyncTeX for the current fast paint (produced by
  // IncrementalCompiler.tryIncremental). When present, applyFastSynctex sets it on the viewer and
  // SKIPS the reconcile — the fast paint is the final result; null → reuse + reconcile.
  private pendingFastMerge: SynctexData | null = null

  private externalEditor = false

  private disposed = false

  // --- Events ---

  private listeners: ListenerMap = new Map()

  constructor(
    editorContainer: EditorContainerInput,
    previewContainer: EditorContainerInput,
    options: WasmTexOptions = {},
  ) {
    this.opts = options

    this.externalEditor = !!this.opts.editor

    this.mainFile = this.opts.mainFile ?? 'main.tex'

    this.currentFile = this.mainFile

    this.assetBaseUrl = resolveAssetBase(this.opts.assetBaseUrl)

    // Create engine

    const engineOpts: import('./engine/wasmtex-engine').WasmTexEngineOptions = {
      assetBaseUrl: this.assetBaseUrl,
      skipFormatPreload: !!this.opts.skipFormatPreload,
      disablePreambleSnapshot: !!this.opts.disablePreambleSnapshot,
      persistentCache: !!this.opts.persistentCache,
      texliveVersion: this.opts.texliveVersion || '2025',
      ...(this.opts.warmupCache ? { warmupCache: this.opts.warmupCache } : {}),
    }

    if (this.opts.texliveUrl) engineOpts.texliveUrl = this.opts.texliveUrl

    this.engine = new WasmTexPdftexEngine(engineOpts)

    this.engine.onProgress = (progress) => {
      if (this.engine.getStatus() === 'loading') {
        this.setStatus('loading', `${progress}%`)
      }
    }

    this.engine.onFileDownload = (filename) => {
      this.setStatus(this.engine.getStatus() as AppStatus, `fetching ${filename}`)
    }

    // Incremental checkpoints are a pdfLaTeX-only feature (the worker commands live in the
    // pdfTeX worker); XeLaTeX/LuaLaTeX docs are short-circuited earlier in compileActiveEngine
    // (unavailableEngine) and never reach the fast path.
    if (this.opts.incremental) {
      this.incremental = new IncrementalCompiler(this.engine, { mainFile: this.mainFile })
    }

    if (this.opts.files) {
      this.fs = new VirtualFS({ empty: true })

      for (const [path, content] of Object.entries(this.opts.files)) {
        this.fs.writeFile(path, content)
      }
    } else {
      this.fs = new VirtualFS()
    }

    this.editorContainer = resolveContainer(editorContainer, 'editor container')
    this.previewContainer = resolveContainer(previewContainer, 'preview container')

    if (this.editorContainer === null) {
      throw new Error('Failed to initialize editor container.')
    }

    if (this.previewContainer === null) {
      throw new Error('Failed to initialize preview container.')
    }

    this.initComponents()
  }

  private initComponents(): void {
    this.applyContainerBindings()
    this.initViewer()
    this.initScheduler()
    this.initProjectModels()
    this.initEditorState()
    this.initBinaryPreview()
    this.initEditorInteraction()
    this.initRuntimeServices()
  }

  private applyContainerBindings(): void {
    if (!this.editorContainer || !this.previewContainer) return

    this.runtimeScopeAttribute =
      this.opts.runtimeScopeAttribute?.trim() || this.runtimeScopeAttribute

    this.editorContainer.setAttribute(this.runtimeScopeAttribute, '')
    this.previewContainer.setAttribute(this.runtimeScopeAttribute, '')

    if (this.opts.editorContainerClassName) {
      this.editorContainer.classList.add(
        ...this.opts.editorContainerClassName.split(/\s+/).filter(Boolean),
      )
    }

    if (this.opts.previewContainerClassName) {
      this.previewContainer.classList.add(
        ...this.opts.previewContainerClassName.split(/\s+/).filter(Boolean),
      )
    }
  }

  private initViewer(): void {
    if (!this.previewContainer) {
      throw new Error('Preview container is not initialized.')
    }

    this.pdfViewer = new PdfViewer(this.previewContainer)

    this.pdfViewer.setInverseSearchHandler((loc) => {
      this.revealLine(loc.line, loc.file)
    })

    if (this.opts.toolbar === false) {
      this.pdfViewer.setToolbarVisible(false)
    }
  }

  private initScheduler(): void {
    this.scheduler = new CompileScheduler(
      {
        isReady: () => this.engine.isReady(),
        compile: () => this.compileActiveEngine(),
      },
      (result) => this.onCompileResult(result),
      (status, detail) => this.setStatus(status, detail),
      { minDebounceMs: 50, maxDebounceMs: 1000 },
    )
  }

  /** Current main-file content (for engine detection). */
  private mainSource(): string {
    const content = this.fs.readFile(this.mainFile)
    return typeof content === 'string' ? content : ''
  }

  /**
   * The engine a Unicode-only document needs, if that engine is not available in
   * this build (the browser currently ships pdfLaTeX only). Returns null when the
   * document compiles with pdfLaTeX.
   */
  private unavailableEngine(): EngineDetection | null {
    const detection = resolveEngine(this.mainSource(), this.opts.engine)
    return detection.engine === 'pdflatex' ? null : detection
  }

  /**
   * Compile with the active engine, but first short-circuit documents that require
   * a Unicode engine (XeLaTeX/LuaLaTeX) not yet shipped in the browser build —
   * surfacing a clear "requires XeLaTeX" result instead of a cryptic pdfTeX error.
   *
   * With `incremental` on (#99), a servable *final* body edit is served from a checkpoint
   * (fast paint, SyncTeX reused from the last full compile); `reconcileArmed` then makes the
   * next scheduled compile a full reconcile. All other edits — and the reconcile itself — run
   * a full compile. Serialised against a speculative prebuild (they share the one worker).
   */
  private async compileActiveEngine(): Promise<CompileResult> {
    const unavailable = this.unavailableEngine()
    if (unavailable) return unavailableEngineResult(unavailable)

    // A speculative prebuild drives the same worker; never start a compile on top of it.
    if (this.prebuildInFlight) await this.prebuildInFlight
    this.compileInFlight = true // so a prebuild armed mid-compile waits (runPrebuild checks this)
    try {
      const fast = await this.tryFastPaint()
      if (fast) return fast

      // Full compile: a normal edit, an unservable fast path, or the reconcile after a fast paint.
      this.reconcileArmed = false
      const result = await this.engine.compile()
      // Record the full SyncTeX as the head merge-base for the next fast paint's splice (#99 P2).
      this.incremental?.noteFull(this.mainSource(), this.projectStringFiles(), result.synctex)
      return result
    } finally {
      this.compileInFlight = false
    }
  }

  /** Attempt an incremental fast paint (#99); returns the spliced result, or null to signal the
   *  caller to run a full compile. On success arms the reconcile/merge (unless a newer edit
   *  superseded this one mid-flight, in which case the scheduler drops the result and the flags
   *  must NOT be set, or they'd force the next edit to a full compile). */
  private async tryFastPaint(): Promise<CompileResult | null> {
    const inc = this.incremental
    // Skip the fast path during an armed cross-reference rerun (`pendingRecompile`): that pass must
    // re-run pdfLaTeX over the whole document to converge \ref/\cite/ToC — a checkpoint fast paint
    // would reuse the stale cached head and abandon the rerun loop.
    if (!inc || this.reconcileArmed || this.pendingRecompile) return null
    const epoch = this.editEpoch
    const source = this.mainSource()
    const files = this.projectStringFiles()
    // canFastServe is a cheap pre-flight: skip the tail compile entirely for edits that must go
    // full (preamble / pre-first-page-break / label edits) so they never regress.
    if (!inc.canFastServe(source, files)) return null
    const fast = await inc.tryIncremental(source, files)
    if (!fast?.pdf || !fast.final) return null
    if (this.editEpoch === epoch) {
      this.reconcileArmed = true // handlePostCompile schedules the full reconcile…
      // …unless the SyncTeX merge produced exact data (applyFastSynctex sets it and skips the
      // reconcile — #99 P2, the throughput win). The merge now happens inside tryIncremental.
      this.pendingFastMerge = fast.synctexData ?? null
    }
    return this.fastCompileResult(fast)
  }

  /** All project files with string content (path → content), for the incremental compiler's
   *  diff/checkpoint bookkeeping. Mirrors the headless compiler's file set. */
  private projectStringFiles(): Map<string, string> {
    const files = new Map<string, string>()
    for (const path of this.fs.listFiles()) {
      const content = this.fs.readFile(path)
      if (typeof content === 'string') files.set(path, content)
    }
    return files
  }

  /** Map an incremental (checkpoint) result to a CompileResult for the fast paint. SyncTeX is
   *  null here — the viewer keeps the last full compile's parsed SyncTeX until the reconcile
   *  refreshes it (handleSuccessfulCompile skips handleSynctex for a fast paint). */
  private fastCompileResult(r: IncrementalResult): CompileResult {
    return {
      success: r.success,
      pdf: r.pdf,
      log: r.log,
      errors: parseTexErrors(r.log),
      compileTime: 0,
      synctex: null,
      telemetry: { diagnostics: buildDiagnostics(r.log) },
    }
  }

  /** Arm a speculative checkpoint prebuild once the loop is idle (#99, option A). The next edit
   *  (onModelChange) cancels it; a concurrent compile waits for any in-flight one, and runPrebuild
   *  won't start one while a compile is in flight. No-op without `incremental`. */
  private armPrebuild(): void {
    if (!this.incremental) return
    this.cancelPrebuild()
    // Skip while a pipeline still owns the worker next — bibtex/rerun/reconcile come first.
    if (this.pendingBibtex || this.pendingRecompile || this.reconcileArmed) return
    this.prebuildTimer = setTimeout(() => {
      this.prebuildTimer = null
      void this.runPrebuild()
    }, PREBUILD_IDLE_MS)
  }

  /** Build the checkpoint for the boundary before the cursor, off the critical path. Sets
   *  {@link prebuildInFlight} so compileActiveEngine serialises against it (one worker). */
  private async runPrebuild(): Promise<void> {
    const inc = this.incremental
    if (!inc || this.prebuildInFlight || this.compileInFlight) return
    // Re-check idle at fire time — an edit or compile may have started during the delay. A
    // fast-path compile keeps the engine status 'ready', so compileInFlight (above) covers it.
    if (this.pendingBibtex || this.pendingRecompile || this.reconcileArmed) return
    if (this.engine.getStatus() !== 'ready') return
    const source = this.mainSource()
    const files = this.projectStringFiles()
    const offset = this.cursorMainOffset()
    this.prebuildInFlight = inc
      .prebuild(source, files, offset)
      .then(() => {})
      .catch(() => {}) // best-effort — a failed prebuild just means the first edit goes full
    try {
      await this.prebuildInFlight
    } finally {
      this.prebuildInFlight = null
    }
  }

  private cancelPrebuild(): void {
    if (this.prebuildTimer) {
      clearTimeout(this.prebuildTimer)
      this.prebuildTimer = null
    }
  }

  /** The cursor's byte offset in the main source, as the prebuild boundary hint. Falls back
   *  to end-of-document when the cursor isn't in the main file (multi-file) or is unavailable
   *  — end maps to the last page break, the common "writing forward" case. */
  private cursorMainOffset(): number {
    const source = this.mainSource()
    if (this.currentFile !== this.mainFile) return source.length
    const model = this.models.get(this.mainFile)
    const pos = this.editor?.getPosition()
    if (!model || !pos) return source.length
    try {
      return model.getOffsetAt(pos)
    } catch {
      return source.length
    }
  }

  private initProjectModels(): void {
    for (const path of this.fs.listFiles()) {
      const file = this.fs.getFile(path)

      if (file && typeof file.content === 'string') {
        this.ensureModel(path, file.content)

        if (path.endsWith('.tex')) {
          this.projectIndex.updateFile(path, file.content)
        }
      }
    }

    this.updateBibIndex()

    if (!this.models.has(this.currentFile)) {
      this.ensureModel(this.currentFile, '')
    }
  }

  private initEditorState(): void {
    const initialModel = this.models.get(this.currentFile)

    if (!initialModel) {
      throw new Error('Initial model is not available.')
    }

    if (this.opts.editor) {
      this.editor = this.opts.editor
      this.switchingModel = true
      this.editor.setModel(initialModel)
      this.switchingModel = false
    } else {
      if (!this.editorContainer) {
        throw new Error('Editor container is not initialized.')
      }
      this.editor = createEditor(this.editorContainer, initialModel)
    }

    const editorService = (this.editor as MonacoEditorWithCodeEditorService)._codeEditorService
    if (!editorService) return

    // Install the cross-file go-to-definition fallback via a seam that hands back a disposable
    // restoring the original on dispose() — an EXTERNAL host editor outlives this instance, so
    // leaving our closure in place would break its navigation (empty models) and leak us.
    this.openCodeEditorOverride = installOpenCodeEditorOverride(
      editorService,
      async (rawInput, source, sideBySide, original) => {
        const input = rawInput as MonacoOpenCodeEditorInput
        const result = await original(input, source, sideBySide)

        if (!result && input.resource) {
          const uri = input.resource.toString()

          for (const [path, model] of this.models.entries()) {
            if (model.uri.toString() === uri) {
              this.onFileSelect(path)

              if (input.options?.selection) {
                const range = input.options.selection

                this.editor.setSelection(range)

                this.editor.revealRangeInCenter(range)
              }

              return true
            }
          }
        }

        return result
      },
    )
  }

  private initBinaryPreview(): void {
    this.previewEl = document.createElement('div')
    this.previewEl.className = 'binary-preview'
    this.previewEl.style.display = 'none'
    this.editorContainer?.appendChild(this.previewEl)
    this.preview = new BinaryPreviewController(this.previewEl)
  }

  private initEditorInteraction(): void {
    this.interactionDisposables.push(
      this.editor.onDidChangeModel(() => {
        const model = this.editor.getModel()

        if (this.switchingModel || !model) return

        for (const [path, m] of this.models.entries()) {
          if (m !== model) continue

          if (this.currentFile !== path) {
            this.currentFile = path

            this.emit('fileOpen', { path })

            this.emitOutline()

            this.runDiagnostics()
          }

          break
        }
      }),
    )

    this.interactionDisposables.push(
      this.editor.onDidChangeCursorPosition(() => {
        if (this.switchingModel) return

        const pos = this.editor.getPosition()

        if (!pos) return

        this.emit('cursorChange', {
          path: this.currentFile,
          line: pos.lineNumber,
          column: pos.column,
        })

        if (pos.lineNumber === this.lastForwardLine && this.currentFile === this.lastForwardFile)
          return

        this.lastForwardLine = pos.lineNumber

        this.lastForwardFile = this.currentFile

        if (this.forwardSearchTimer) clearTimeout(this.forwardSearchTimer)

        this.forwardSearchTimer = setTimeout(() => {
          this.pdfViewer?.forwardSearch(this.currentFile, pos.lineNumber)
        }, 100)

        // Follow the cursor with a speculative checkpoint prebuild (#99): when the loop is
        // idle, warm the checkpoint for the boundary before wherever the user settles, so
        // their first edit there is fast. Re-armed (debounced) on each move; a no-op when the
        // checkpoint is already cached or a compile owns the worker.
        this.armPrebuild()
      }),
    )

    this.interactionDisposables.push(
      this.editor.addAction({
        id: 'latex.save-compile',

        label: 'Save & Compile',

        keybindings: [2048 /* CtrlCmd */ | 49 /* KeyS */],

        run: () => {
          // See compile(): flush after the async sync schedules, not before.
          void this.syncAndCompile().then(() => this.scheduler.flush())
        },
      }),
    )
    this.pdfViewer?.setDownloadHandler(() => this.downloadPdf())
  }

  private initRuntimeServices(): void {
    this.lspDisposables = registerLatexProviders(
      this.projectIndex,
      this.fs,
      (info) => this.emit('workspaceEdit', info),
      'latex',
      createDefaultCompletionRegistry(
        this.opts.resourceCatalog ? { resourceCatalog: this.opts.resourceCatalog } : {},
      ),
    )

    this.perfOverlayDispose = initPerfOverlay()

    this.unhandledRejectionHandler = (e) => {
      if (e.reason?.message === 'Canceled' || e.reason === 'You cannot rename this element.') {
        e.preventDefault()
      }
    }
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler)

    if (this.opts.serviceWorker !== false && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(`${this.assetBaseUrl}sw.js`).catch((err) => {
        console.warn('SW registration failed:', err)
      })
    }
  }

  // ------------------------------------------------------------------

  // Public API

  // ------------------------------------------------------------------

  async init(): Promise<void> {
    this.setStatus('loading')

    try {
      await this.engine.init()

      // Create directories and write all FS files to engine. The shared helper
      // marks only the files it actually wrote as synced (by identity), so a host
      // edit landing during the awaits stays modified for the next cycle — a bare
      // markSynced() would clear it and silently drop the edit.
      await syncAllFilesToEngine(
        this.fs,
        this.engine,
        (paths) => this.ensureEngineDirectories(paths),
        this.mainFile,
      )

      this.setStatus('compiling')

      const result = await this.compileActiveEngine()

      this.onCompileResult(result)
    } catch (err) {
      console.error('Engine initialization failed:', err)

      this.setStatus('error', String(err))
    }
  }

  // --- File management ---

  /** Load a complete project state. */

  loadProject(files: Record<string, string | Uint8Array>): void {
    const oldPaths = new Set(this.models.keys())

    const newPaths = new Set(Object.keys(files))

    // Clear existing files and index

    for (const path of this.fs.listFiles()) {
      this.fs.deleteFile(path)

      this.projectIndex.removeFile(path)
    }

    this.engine.flushCache()

    this.bibtexEngine?.terminate()

    this.bibtexEngine = null
    this.pendingBibtex = false
    this.pendingRecompile = false
    this.reconcileArmed = false
    this.pendingFastMerge = null
    this.cancelPendingRerun() // a queued rerun targets the old project — drop it
    this.cancelPrebuild()
    this.incremental?.reset() // fresh project — drop checkpoints + diff baseline
    this.bibtexRunId++
    this.rerunController.reset() // fresh project — restart rerun budget & no-progress baseline

    this.updateModels(files, oldPaths, newPaths)

    this.updateBibIndex()

    this.bibtexDone = false

    // Switch editor to main file. Dismiss any binary-preview overlay left up from a previous
    // file first (mirrors onFileSelect's text path) — otherwise the stale overlay covers the
    // editor and its shouldSuppressModelChange guard silently drops edits to the main file.
    this.hideBinaryPreview()

    this.currentFile = this.mainFile

    this.emit('fileOpen', { path: this.currentFile })

    this.lastForwardLine = -1

    this.lastForwardFile = ''

    const model = this.models.get(this.currentFile)

    if (model && this.editor) {
      this.switchingModel = true

      this.editor.setModel(model)

      this.switchingModel = false
    }

    this.emit('filesUpdate', { files: this.fs.listFiles() })

    this.emitOutline()

    // Sync and compile

    this.syncAndCompile()
  }

  private updateModels(
    files: Record<string, string | Uint8Array>,

    oldPaths: Set<string>,

    newPaths: Set<string>,
  ): void {
    // Load new files, reuse or create models

    for (const [path, content] of Object.entries(files)) {
      this.fs.writeFile(path, content)

      if (typeof content === 'string') {
        if (path.endsWith('.tex')) {
          this.projectIndex.updateFile(path, content)
        }

        const existing = this.models.get(path)

        if (!existing) {
          this.ensureModel(path, content)
        } else if (!this.opts.collaboration) {
          existing.setValue(content)
        }
      }
    }

    // Dispose models for removed files

    for (const path of oldPaths) {
      if (!newPaths.has(path)) {
        this.disposeModel(path)
      }
    }
  }

  /** Export all project files. */

  saveProject(): Record<string, string | Uint8Array> {
    // Save current editor content

    if (this.editor) {
      this.fs.writeFile(this.currentFile, this.editor.getValue())
    }

    const result: Record<string, string | Uint8Array> = {}

    for (const path of this.fs.listFiles()) {
      const file = this.fs.getFile(path)

      if (file) result[path] = file.content
    }

    return result
  }

  /** Open a specific file in the editor. */

  openFile(path: string): void {
    this.onFileSelect(path)
  }

  /** Update or create a single file. */

  setFile(path: string, content: string | Uint8Array): void {
    const isNew = !this.fs.getFile(path)

    this.fs.writeFile(path, content)

    // A non-.tex file (image/data/.bib) can be baked into a checkpoint head yet isn't tracked
    // by the .tex-only incremental diff — drop checkpoints so the change forces a full compile.
    if (!path.endsWith('.tex')) this.incremental?.reset()

    if (typeof content === 'string') {
      if (path.endsWith('.tex')) {
        this.projectIndex.updateFile(path, content)
      }

      if (path.endsWith('.bib')) {
        this.updateBibIndex()
      }

      const model = this.models.get(path)

      if (model) {
        if (!this.opts.collaboration) model.setValue(content)
      } else {
        this.ensureModel(path, content)
      }
    }

    this.emit('filechange', { path, content })

    if (isNew) {
      this.emit('filesUpdate', { files: this.fs.listFiles() })
    }

    if (path === this.currentFile) {
      this.emitOutline()
    }
  }

  /** Read file content. */

  getFile(path: string): string | Uint8Array | null {
    return this.fs.readFile(path)
  }

  /** Delete a file. */

  deleteFile(path: string): boolean {
    this.disposeModel(path)

    this.projectIndex.removeFile(path)

    const deleted = this.fs.deleteFile(path)

    if (deleted) {
      // A deletion changes the project structure the incremental checkpoints/diff baseline
      // were built against — drop them so the next compile is a clean full one, and clear the
      // fast-path state (mirrors loadProject) so no stale merge base / armed reconcile survives.
      this.incremental?.reset()
      this.reconcileArmed = false
      this.pendingFastMerge = null
      this.cancelPrebuild()

      // projectIndex.removeFile only purges .tex-derived symbols; bibliography entries live in
      // a separate index rebuilt from the .bib files in the VFS. Without this, a deleted .bib's
      // entries linger — stale citation completions/diagnostics. Mirrors setFile/loadProject.
      if (path.endsWith('.bib')) this.updateBibIndex()

      // The engine keeps written files in its WORKROOT across compiles and has no
      // per-file delete, so a deleted file would still satisfy \input on the next
      // compile (stale content rendered). Flush the engine's filesystem and
      // re-mark surviving files so the next sync rebuilds a clean WORKROOT without
      // the deleted file. (Same mechanism loadProject uses.)
      void this.engine.flushCache()
      this.fs.markAllModified()

      this.emit('filesUpdate', { files: this.fs.listFiles() })

      if (this.currentFile === path) {
        this.openFile(this.mainFile)
      }

      // Recompile so the deletion is reflected in the preview (the flushed engine
      // is re-populated from the now-all-modified surviving files), rather than
      // leaving the prior PDF — which still shows the deleted file — on screen.
      this.syncAndCompile()
    }

    return deleted
  }

  /** Create a folder (represented by a .gitkeep file). */

  createFolder(path: string): void {
    const folderPath = path.replace(/\/+$/, '')

    this.setFile(`${folderPath}/.gitkeep`, '')
  }

  /** List all files in the project. */

  listFiles(): string[] {
    return this.fs.listFiles()
  }

  /**
   * Clear the built-in persistent TeX Live asset cache (IndexedDB) for the
   * active TeX Live version. No-op when the persistent cache is unavailable.
   */
  async clearCache(): Promise<void> {
    await this.engine.clearCache()
  }

  // --- Compilation ---

  /** Trigger an immediate compilation. */

  compile(): void {
    // flush() must run AFTER syncAndCompile() has scheduled — syncAndCompile is async and
    // only calls scheduler.schedule() past its awaits, so a synchronous flush() here would
    // see no pending timer and do nothing, losing the immediate compile.
    void this.syncAndCompile().then(() => this.scheduler.flush())
  }

  /** Get the last rendered PDF as bytes. */

  getPdf(): Uint8Array | null {
    return this.pdfViewer?.getLastPdf() ?? null
  }

  // --- Events ---

  on<K extends keyof WasmTexEventMap>(
    event: K,

    handler: EventHandler<WasmTexEventMap[K]>,
  ): void {
    let handlers = this.listeners.get(event)
    if (!handlers) {
      handlers = new Set()
      this.listeners.set(event, handlers)
    }

    handlers.add(handler as EventHandler<unknown>)
  }

  off<K extends keyof WasmTexEventMap>(
    event: K,

    handler: EventHandler<WasmTexEventMap[K]>,
  ): void {
    this.listeners.get(event)?.delete(handler as EventHandler<unknown>)
  }

  // --- Escape hatches ---

  /** Get the raw Monaco editor instance. */

  getMonacoEditor(): Monaco.editor.IStandaloneCodeEditor {
    return this.editor
  }

  /** Get the Monaco model for a project file.
   *  Useful for attaching external bindings (e.g. y-monaco). */

  getModel(path: string): Monaco.editor.ITextModel | undefined {
    return this.models.get(path)
  }

  /** Get the built-in PDF viewer instance. */

  getViewer(): PdfViewer | undefined {
    return this.pdfViewer
  }

  /** Get the path of the file currently open in the editor. */

  getActiveFile(): string {
    return this.currentFile
  }

  /** Jump the editor to a specific line. */

  revealLine(line: number, file?: string): void {
    if (file && file !== this.currentFile) {
      this.openFile(file)

      requestAnimationFrame(() => revealLine(this.editor, line))
    } else {
      revealLine(this.editor, line)
    }
  }

  /** Cancel a pending debounced forward search (cursor-move → PDF jump). */
  private cancelForwardSearch(): void {
    if (this.forwardSearchTimer) {
      clearTimeout(this.forwardSearchTimer)
      this.forwardSearchTimer = null
    }
  }

  // --- Cleanup ---

  dispose(): void {
    if (this.disposed) return

    this.disposed = true

    this.scheduler.cancel()

    this.cancelForwardSearch()
    this.revokePreviewUrl()
    this.cancelPendingRerun()
    this.cancelPrebuild()

    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler)
      this.unhandledRejectionHandler = null
    }

    for (const d of this.lspDisposables) d.dispose()

    this.lspDisposables = []

    for (const d of this.interactionDisposables) d.dispose()

    this.interactionDisposables = []

    // Restore Monaco's original openCodeEditor before tearing down models. For an external
    // (host-owned) editor we deliberately don't dispose it below, so our closure would
    // otherwise linger — navigating against an empty models map and leaking this instance.
    this.openCodeEditorOverride?.dispose()
    this.openCodeEditorOverride = null

    if (!this.externalEditor) {
      this.editor?.dispose()
    }

    for (const d of this.modelDisposables.values()) d.dispose()

    this.modelDisposables.clear()

    for (const model of this.models.values()) model.dispose()

    this.models.clear()

    // Remove the perf overlay + unsubscribe its listener so it doesn't outlive this instance
    // on the shared `perf` singleton (and a re-created instance can re-attach it).
    this.perfOverlayDispose?.()
    this.perfOverlayDispose = undefined

    // Tear down the viewer: disconnect its IntersectionObserver and destroy the
    // last PDFDocumentProxy so they don't leak for the lifetime of the host page.
    this.pdfViewer?.destroy()

    this.engine.terminate()

    this.bibtexEngine?.terminate()

    this.listeners.clear()
  }

  // ------------------------------------------------------------------

  // Private: Model management

  // ------------------------------------------------------------------

  private ensureModel(path: string, content: string): Monaco.editor.ITextModel {
    let model = this.models.get(path)

    if (!model) {
      // Don't overwrite a reused global model's content under collaboration —
      // the external CRDT binding is authoritative (we never call setValue).
      model = createFileModel(content, path, !this.opts.collaboration)

      this.models.set(path, model)

      const d = model.onDidChangeContent(() => {
        this.onModelChange(path, model!.getValue())
      })

      this.modelDisposables.set(path, d)

      this.emit('modelCreate', { path, model })
    }

    return model
  }

  private disposeModel(path: string): void {
    const model = this.models.get(path)

    if (model) {
      this.emit('modelDispose', { path })

      this.modelDisposables.get(path)?.dispose()

      this.modelDisposables.delete(path)

      model.dispose()

      this.models.delete(path)
    }
  }

  // ------------------------------------------------------------------

  // Private: DOM

  // ------------------------------------------------------------------

  // ------------------------------------------------------------------

  // Private: Core logic

  // ------------------------------------------------------------------

  private setStatus(
    status: AppStatus,
    detail?: string,
    flags?: Pick<WasmTexStatusEvent, 'preambleSnapshot' | 'incremental'>,
  ): void {
    if (this.pdfViewer) {
      const labels: Record<AppStatus, string> = {
        unloaded: 'Initializing...',

        loading: 'Loading engine...',

        ready: 'Ready',

        compiling: 'Compiling...',

        error: 'Error',

        rendering: 'Rendering PDF...',
      }

      const label = detail ? `${labels[status]} ${detail}` : labels[status]

      this.pdfViewer.setLoadingStatus(label)
    }

    const payload: WasmTexStatusEvent = { status }

    if (detail !== undefined) payload.message = detail
    if (flags?.preambleSnapshot) payload.preambleSnapshot = true
    if (flags?.incremental) payload.incremental = true

    this.emit('status', payload)
  }

  private async syncAndCompile(): Promise<void> {
    const status = this.engine.getStatus()

    if (status === 'unloaded' || status === 'loading' || status === 'error') return

    const modified = this.fs.getModifiedFiles()

    await this.ensureEngineDirectories(modified.map((f) => f.path))

    for (const file of modified) {
      await this.engine.writeFile(file.path, file.content)
    }

    // Clear only what we actually synced; an edit that arrived during the awaits
    // above replaced the map entry and must stay modified for the next cycle.
    this.fs.markSynced(modified)

    this.engine.setMainFile(this.mainFile)

    this.scheduler.schedule()
  }

  private async ensureEngineDirectories(paths: string[]): Promise<void> {
    const dirs = new Set<string>()

    for (const p of paths) {
      const parts = p.split('/')

      let dir = ''

      for (let i = 0; i < parts.length - 1; i++) {
        dir = dir ? `${dir}/${parts[i]!}` : parts[i]!

        dirs.add(dir)
      }
    }

    for (const dir of Array.from(dirs).sort()) {
      await this.engine.mkdir(dir)
    }
  }

  private onModelChange(path: string, content: string): void {
    if (this.preview?.shouldSuppressModelChange(path, this.currentFile)) return

    perf.mark('total')

    perf.mark('debounce')

    this.bibtexDone = false
    this.bibtexRunId++
    this.pendingBibtex = false
    this.pendingRecompile = false
    this.editEpoch++ // supersede any in-flight fast paint (compileActiveEngine checks this)
    this.reconcileArmed = false // a fresh edit isn't a reconcile; the next compile decides anew
    this.pendingFastMerge = null
    this.cancelPendingRerun() // a queued rerun targets the pre-edit document — drop it
    this.cancelPrebuild() // the speculative build targets the pre-edit document — drop it
    this.rerunController.reset() // fresh document state — restart rerun budget

    // A .bib (or other non-.tex) edit changes the bibliography/assets the incremental diff
    // doesn't track — force a full compile (which re-runs bibtex) by dropping checkpoints.
    if (!path.endsWith('.tex')) this.incremental?.reset()

    this.fs.writeFile(path, content)

    if (path.endsWith('.tex')) {
      this.projectIndex.updateFile(path, content)
    }

    if (path.endsWith('.bib')) {
      this.updateBibIndex()
    }

    if (path === this.currentFile) {
      this.emitOutline()
    }

    this.runDiagnostics()

    this.emit('filechange', { path, content })

    this.syncAndCompile()
  }

  private onFileSelect(path: string): void {
    // Ignore files that don't exist in VFS (e.g. main.bbl from SyncTeX inverse search)

    const target = this.fs.getFile(path)

    if (!target) return

    // Save current editor content if we were editing text (not previewing binary)

    const wasPreviewingBinary = this.preview?.isVisible() ?? false

    if (this.editor && !wasPreviewingBinary) {
      const value = this.editor.getValue()

      // Only persist the outgoing buffer if its file still exists — saving a path that was
      // just deleted (deleting the currently-open file opens mainFile while currentFile is
      // still the deleted path) would resurrect it in the VFS with stale content.
      if (saveOutgoingFile(this.fs, this.currentFile, value)) {
        if (this.currentFile.endsWith('.tex')) {
          this.projectIndex.updateFile(this.currentFile, value)
        }
      }
    }

    this.currentFile = path

    this.emit('fileOpen', { path })

    this.lastForwardLine = -1

    this.lastForwardFile = ''

    // A forward search debounced for the previous file must not fire against the
    // newly opened one (stale line number, wrong file).
    this.cancelForwardSearch()

    if (target.content instanceof Uint8Array) {
      // Binary file — show preview instead of Monaco

      this.showBinaryPreview(path, target.content)
      return
    }

    // Text file — hide preview, restore editor

    this.hideBinaryPreview()

    // Ensure model exists (file may have been added externally)

    if (typeof target.content === 'string' && !this.models.has(path)) {
      this.ensureModel(path, target.content)
    }

    const model = this.models.get(path)

    if (model && this.editor) {
      // Suppress cursor-change events during model switch to avoid

      // spurious forward searches and Monaco Delayer "Canceled" rejections

      this.switchingModel = true

      this.editor.setModel(model)

      this.switchingModel = false
    }

    this.emitOutline()

    this.runDiagnostics()
  }

  /** Revoke the object URL backing the current binary preview, if any. */
  private revokePreviewUrl(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl)
      this.previewUrl = null
    }
  }

  private showBinaryPreview(path: string, data: Uint8Array): void {
    if (!this.previewEl) return

    // Revoke any prior preview URL before replacing the DOM (a pending load that
    // never fires onload would otherwise leak the blob).
    this.revokePreviewUrl()

    this.previewEl.innerHTML = ''

    if (isImageFile(path)) {
      const blob = binaryFileBlob(data)

      const url = URL.createObjectURL(blob)
      this.previewUrl = url

      const img = document.createElement('img')

      img.src = url

      img.className = 'binary-preview-img'

      // Revoke on BOTH success and failure (a non-decodable image fires error,
      // never load), and clear the field only if it still points at this url.
      const done = () => {
        URL.revokeObjectURL(url)
        if (this.previewUrl === url) this.previewUrl = null
      }
      img.onload = done
      img.onerror = done

      this.previewEl.appendChild(img)
    } else {
      const info = document.createElement('div')

      info.className = 'binary-preview-info'

      const ext = path.substring(path.lastIndexOf('.'))

      info.textContent = `${ext.toUpperCase()} file \u2014 ${formatBytes(data.length)}`

      this.previewEl.appendChild(info)
    }

    this.preview?.show()
  }

  private hideBinaryPreview(): void {
    this.revokePreviewUrl()
    this.preview?.hide()
  }

  private updateEngineMetadata(result: CompileResult): void {
    if (result.engineCommands?.length) {
      this.projectIndex.updateEngineCommands(result.engineCommands)
    }

    if (result.semanticTrace) {
      this.projectIndex.updateSemanticTrace(parseTraceFile(result.semanticTrace))
    } else {
      this.projectIndex.updateSemanticTrace({ labels: new Set(), refs: new Set() })
    }

    if (result.inputFiles?.length) this.updateRecordedInputMetadata(result.inputFiles)
  }

  private updateRecordedInputMetadata(inputFiles: string[]): void {
    for (const rawPath of inputFiles) {
      const path = normalizeProjectDependencyPath(rawPath)
      if (!path || this.projectIndex.getFileSymbols(path)) continue
      const file = this.fs.getFile(path)
      if (!file || typeof file.content !== 'string') continue
      this.projectIndex.updateFile(path, file.content)
      this.ensureModel(path, file.content)
    }
  }

  private onCompileResult(result: CompileResult): void {
    perf.end('compile')

    // A fast (incremental) paint: reconcileArmed was set by compileActiveEngine when it
    // served the checkpoint result. It changes post-processing — keep the last full compile's
    // SyncTeX, and schedule the full reconcile instead of running bibtex/rerun now.
    const isFastPaint = this.reconcileArmed

    // Supersede any older compile's async render/synctex .then() — incl. when THIS
    // compile failed, so a slow prior render can't overwrite the new error status.
    const seq = ++this.renderSeq

    const statusFlags: Pick<WasmTexStatusEvent, 'preambleSnapshot' | 'incremental'> = {
      preambleSnapshot: !!result.preambleSnapshot,
    }

    this.updateEngineMetadata(result)

    if (result.format) {
      this.downloadFormat(result.format)
    }

    if (result.success && result.pdf) {
      this.handleSuccessfulCompile(result, statusFlags, seq, isFastPaint)
    } else {
      perf.end('total')
      console.error('[engine] compilation failed. memlog:', result.log)
      this.setStatus(result.errors.length > 0 ? 'error' : 'ready', undefined, statusFlags)
    }

    this.handlePostCompile(result, isFastPaint)
  }

  private handleSuccessfulCompile(
    result: CompileResult,
    statusFlags: Pick<WasmTexStatusEvent, 'preambleSnapshot' | 'incremental'>,
    seq: number,
    isFastPaint = false,
  ): void {
    if (isFastPaint) statusFlags = { ...statusFlags, incremental: true }
    const sources: Array<[string, string]> = []
    for (const path of this.fs.listFiles()) {
      const file = this.fs.getFile(path)

      if (file && typeof file.content === 'string') {
        sources.push([path, file.content])
      }
    }
    // Replace the whole set so files removed since the last compile drop out.
    this.pdfViewer?.setSources(sources)

    // `seq` (from onCompileResult) tokens this compile; a superseded render/synctex
    // .then() bails so it can't emit a stale 'ready' status or overwrite newer data.
    // A fast paint carries no SyncTeX (result.synctex is null) — keep the last full
    // compile's parsed data; the debounced reconcile refreshes it for the edited tail. (#99)
    if (!isFastPaint) this.handleSynctex(result, seq)

    if (this.pdfViewer) {
      this.setStatus('rendering')

      perf.mark('render')

      this.pdfViewer
        .render(result.pdf!)
        .then(() => {
          perf.end('render')

          perf.end('total')

          if (seq !== this.renderSeq) return

          this.setStatus('ready', undefined, statusFlags)
        })
        .catch((err) => {
          // A rejected render (e.g. corrupt/empty PDF bytes) must not leave the UI
          // stuck on 'rendering' with an unhandled rejection.
          perf.end('render')

          perf.end('total')

          if (seq !== this.renderSeq) return

          console.error('PDF render failed:', err)

          this.setStatus('error', 'Failed to display PDF')
        })
    } else {
      perf.end('total')

      this.setStatus('ready', undefined, statusFlags)
    }
  }

  private handlePostCompile(result: CompileResult, isFastPaint = false): void {
    if (isFastPaint) {
      // A fast paint is a preview. Its `errors` come from the isolated `tail` compile — tail-
      // relative lines attributed to `tail.tex`, no model — so DON'T `setErrorMarkers` (it would
      // just clear the last full compile's markers on the real files); keep those, which are still
      // valid for the unchanged head. Try to splice exact SyncTeX (#99 P2); applyFastSynctex either
      // sets the merged data and SKIPS the reconcile (the fast paint is the final result), or, when
      // the tail can't be merged, arms the full reconcile (Phase 1) which refreshes markers.
      const merged = this.pendingFastMerge
      this.pendingFastMerge = null
      this.emitOutline()
      this.runDiagnostics()
      this.emit('compile', { result })
      this.applyFastSynctex(merged)
      return
    }

    setErrorMarkers(result.errors, this.models.values())

    this.updateAuxIndex()

    this.emitOutline()

    this.runDiagnostics()

    // BibTeX takes priority over cross-ref recompile

    if (!this.pendingBibtex) {
      this.maybeRunBibtex(result)
    }

    if (!this.pendingBibtex) {
      this.maybeRecompile(result)
    }

    this.emit('compile', { result })

    // The loop just settled on a full compile — speculatively warm the next checkpoint so
    // the first tail edit is fast too (#99, option A). No-op unless `incremental` is on.
    this.armPrebuild()
  }

  /** Apply a fast paint's SyncTeX (#99 P2). `merged` is the tail spliced onto the last full
   *  compile's head (produced inside IncrementalCompiler.tryIncremental) — exact for the spliced
   *  PDF. When present, set it and SKIP the reconcile: the fast paint IS the final result (head
   *  unchanged, cross-references stable for a `final` edit). When null (head changed since the last
   *  full compile / no last-full SyncTeX), keep the last full compile's data and arm the reconcile. */
  private applyFastSynctex(merged: SynctexData | null): void {
    if (merged) {
      this.pdfViewer?.setSynctexData(merged)
      this.reconcileArmed = false // exact + final → no reconcile owed
    } else {
      this.scheduler.schedule() // couldn't splice → reconcile refreshes SyncTeX
    }
  }

  private handleSynctex(result: CompileResult, seq: number): void {
    if (result.synctex) {
      perf.mark('synctex-parse')

      this.synctexParser

        .parse(result.synctex)

        .then((synctexData) => {
          perf.end('synctex-parse')

          if (seq !== this.renderSeq) return

          this.pdfViewer?.setSynctexData(synctexData)
        })

        .catch((err) => {
          perf.end('synctex-parse')

          console.warn('SyncTeX parse failed, using text-mapper fallback:', err)

          if (seq !== this.renderSeq) return

          this.pdfViewer?.setSynctexData(null)
        })
    } else {
      this.pdfViewer?.setSynctexData(null)
    }
  }

  /** Cancel a queued cross-reference rerun (armed by {@link maybeRecompile}). A state
   *  reset — a fresh edit, a new project, or dispose — must cancel it, or the stale
   *  timer fires ~100ms later and runs a redundant, scheduler-bypassing compile of the
   *  now-superseded document (status flicker + wasted work). */
  private cancelPendingRerun(): void {
    if (this.rerunTimer) {
      clearTimeout(this.rerunTimer)
      this.rerunTimer = null
    }
  }

  private maybeRecompile(result: CompileResult): void {
    if (this.pendingRecompile || !(result.success || result.pdf)) {
      this.pendingRecompile = false
      return
    }

    // Decide whether to auto-rerun for cross-references. The controller caps the
    // number of reruns and detects oscillation/non-convergence (via a hash of
    // the cross-reference state) so a pathological document can't thrash forever.
    const signature = signatureOf(result.semanticTrace ?? result.log)
    const decision = this.rerunController.decide(result.log || '', signature)

    if (decision.rerun) {
      console.log('[main] Log indicates references changed. Triggering automated rerun...')
      this.pendingRecompile = true
      // Small delay to ensure UI updates and VFS is stable
      this.rerunTimer = setTimeout(() => {
        this.compileActiveEngine()
          .then((r) => {
            // Reset before onCompileResult so the chain can decide on a further rerun.
            this.pendingRecompile = false
            this.onCompileResult(r)
            this.syncAndCompile()
          })
          .catch((err) => {
            // A rejected rerun (e.g. worker crash) must not leave pendingRecompile stuck
            // true — that would wedge every future rerun and BibTeX run permanently.
            this.pendingRecompile = false
            if (!(err instanceof Error && err.name === 'AbortError')) {
              console.error('[main] Automated rerun failed:', err)
            }
          })
      }, 100)
      return
    }

    this.pendingRecompile = false
    if (decision.stopped === 'limit') {
      console.warn('[main] Rerun limit reached; cross-references may be stale.')
      this.setStatus('ready', 'cross-references may be stale (rerun limit reached)')
    } else if (decision.stopped === 'no-progress') {
      console.warn('[main] Reruns did not converge; stopping.')
      this.setStatus('ready', 'cross-references did not converge')
    }
  }

  private maybeRunBibtex(result: CompileResult): void {
    if (this.pendingRecompile || this.pendingBibtex || this.bibtexDone) return
    if (!result.success && !result.pdf) return // Must at least have produced something

    const hasBibFiles = this.fs.listFiles().some((f) => f.endsWith('.bib'))
    if (!hasBibFiles) return

    console.log('[main] Triggering BibTeX run...')
    this.pendingBibtex = true
    const runId = ++this.bibtexRunId

    this.runBibtexChain(runId)

      .catch((err) => {
        console.warn('BibTeX chain error:', err)
      })

      .finally(() => {
        if (this.bibtexRunId === runId) {
          this.pendingBibtex = false
        }
      })
  }

  private isCurrentBibtexRun(runId: number): boolean {
    return this.bibtexRunId === runId
  }

  private async runBibtexChain(runId: number): Promise<void> {
    const mainBase = this.mainFile.replace(/\.tex$/, '')

    const auxContent = await this.engine.readFile(`${mainBase}.aux`)
    if (!this.isCurrentBibtexRun(runId)) return

    if (!auxContent) return

    if (!auxContent.includes('\\citation{') || !auxContent.includes('\\bibdata{')) return

    this.setStatus('compiling', 'Running BibTeX...')

    const engine = await this.ensureBibtexEngine()
    if (!this.isCurrentBibtexRun(runId)) return

    if (!engine) return

    await this.sendFilesToBibtex(engine, mainBase, auxContent)
    if (!this.isCurrentBibtexRun(runId)) return

    await engine.compile(mainBase)
    if (!this.isCurrentBibtexRun(runId)) return

    // Try to read .bbl even if BibTeX had errors (status 2)
    const bbl = await engine.readFile(`${mainBase}.bbl`)
    if (!this.isCurrentBibtexRun(runId)) return

    if (!bbl) {
      console.warn('[main] BibTeX finished but no .bbl was produced.')
      this.setStatus('error', 'BibTeX did not produce a .bbl file.')
      return
    }

    this.bibtexDone = true

    console.log(`[main] BibTeX produced .bbl (${bbl.length} bytes). Writing back to engine...`)
    await this.engine.writeFile(`${mainBase}.bbl`, bbl)
    if (!this.isCurrentBibtexRun(runId)) return

    // Ensure the file is also in our VFS so the user can see it
    this.fs.writeFile(`${mainBase}.bbl`, bbl)
    this.emit('filesUpdate', { files: this.fs.listFiles() })

    this.pendingRecompile = true
    // Clear on EVERY outcome of this final compile — success, the supersession return
    // below, or a rejection (worker crash/abort, which propagates to maybeRunBibtex's
    // .catch and would otherwise skip the clear). A stale or crashed run must not leave
    // pendingRecompile stuck true: maybeRunBibtex (~1469) and maybeRecompile (~1423) both
    // early-return on it, suppressing the next rerun/BibTeX cycle. Every bibtexRunId bumper
    // (loadProject/onModelChange) resets the flag too, so today the stale path is masked —
    // this closes the gap defensively (incl. the crash path the sibling rerun already
    // guards at ~1447). Cleared *before* onCompileResult so its maybeRecompile can re-arm a
    // rerun. (#161)
    const r = await this.engine.compile().finally(() => {
      this.pendingRecompile = false
    })
    if (!this.isCurrentBibtexRun(runId)) return

    // Crucial: calling onCompileResult here will trigger ANOTHER maybeRecompile
    // if the references are still not settled (which is normal after first .bbl write)
    this.onCompileResult(r)

    await this.syncAndCompile()
  }

  private async ensureBibtexEngine(): Promise<BibtexEngine | null> {
    if (this.bibtexEngine) return this.bibtexEngine

    const opts: { assetBaseUrl?: string; texliveUrl?: string; texliveVersion?: TexliveVersion } = {
      assetBaseUrl: this.assetBaseUrl,
      texliveVersion: this.opts.texliveVersion || '2025',
    }

    if (this.opts.texliveUrl) opts.texliveUrl = this.opts.texliveUrl

    this.bibtexEngine = new BibtexEngine(opts)
    this.bibtexEngine.onFileDownload = (filename) => {
      this.setStatus('compiling', `fetching ${filename}`)
    }

    try {
      await this.bibtexEngine.init()

      return this.bibtexEngine
    } catch (err) {
      console.warn('BibTeX engine init failed:', err)

      this.bibtexEngine = null

      return null
    }
  }

  private async sendFilesToBibtex(
    engine: BibtexEngine,
    mainBase: string,
    auxContent: string,
  ): Promise<void> {
    await engine.writeFile(`${mainBase}.aux`, auxContent)

    const bibFiles = this.fs.listFiles().filter((f) => f.endsWith('.bib'))

    for (const bibPath of bibFiles) {
      const content = this.fs.readFile(bibPath)

      if (content != null) {
        await engine.writeFile(bibPath, content)
      }
    }

    const bstMatch = auxContent.match(/\\bibstyle\{([^}]+)\}/)

    if (!bstMatch) return

    const bstName = bstMatch[1]!

    const bstPath = bstName.endsWith('.bst') ? bstName : `${bstName}.bst`

    const bstContent = this.fs.readFile(bstPath)

    if (bstContent != null) {
      engine.writeFile(bstPath, bstContent)
    }
  }

  private updateBibIndex(): void {
    // Delegate to the shared seam (also used by the headless core / language service) so the
    // "re-derive the bib index from the current .bib files" wiring lives in exactly one place.
    rebuildBibIndex(this.fs, this.projectIndex)
  }

  private updateAuxIndex(): void {
    const mainBase = this.mainFile.replace(/\.tex$/, '')

    this.engine

      .readFile(`${mainBase}.aux`)

      .then((auxContent) => {
        if (!auxContent) return

        const auxData = parseAuxFile(auxContent)

        const pending = auxData.includes.map((inc) =>
          this.engine.readFile(inc).then((sub) => (sub ? parseAuxFile(sub) : null)),
        )

        Promise.all(pending).then((subResults) => {
          for (const sub of subResults) {
            if (!sub) continue

            for (const [k, v] of sub.labels) auxData.labels.set(k, v)

            for (const c of sub.citations) auxData.citations.add(c)
          }

          this.projectIndex.updateAuxData(auxData)

          this.runDiagnostics()
        })
      })

      .catch(() => {})
  }

  private runDiagnostics(): void {
    const diagnostics = computeDiagnostics(this.projectIndex)

    const lint = this.opts.lint ?? true
    if (lint !== false) {
      const lintConfig = lint === true ? undefined : (lint as Partial<LintConfig>)
      for (const path of this.fs.listFiles()) {
        if (!path.endsWith('.tex')) continue
        const file = this.fs.getFile(path)
        if (file && typeof file.content === 'string') {
          diagnostics.push(...lintSource(file.content, path, lintConfig))
        }
      }
    }

    setDiagnosticMarkers(diagnostics, this.models.values())

    this.emit('diagnostics', { diagnostics: diagnostics as TexError[] })
  }

  private downloadPdf(): void {
    const data = this.pdfViewer?.getLastPdf()

    if (!data) return

    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/pdf' })

    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')

    a.href = url

    a.download = 'output.pdf'

    a.click()

    URL.revokeObjectURL(url)
  }

  private downloadFormat(data: Uint8Array): void {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wasmtex-pdftex.fmt'
    a.click()
    URL.revokeObjectURL(url)
  }

  private emitOutline(): void {
    const symbols = this.projectIndex.getFileSymbols(this.currentFile)

    this.emit('outlineUpdate', { sections: symbols?.sections ?? [] })
  }

  // ------------------------------------------------------------------

  // Private: Event emitter

  // ------------------------------------------------------------------

  private emit<K extends keyof WasmTexEventMap>(event: K, data: WasmTexEventMap[K]): void {
    const handlers = this.listeners.get(event)

    if (handlers) {
      for (const fn of handlers) fn(data)
    }
  }
}
