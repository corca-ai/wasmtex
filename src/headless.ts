import type { BackendRegistry } from './engine/backend-registry'
import { runRemoteBiber } from './engine/biber-backend'
import {
  type BibliographyStageRequest,
  detectBiblatexBackend,
  detectBiblatexSort,
  detectBibliographyMode,
  generateBiblatexBbl,
  parseBcfCitedKeys,
  resolveBstFile,
  runRemoteBibliography,
} from './engine/bibliography-backend'
import { BibtexEngine } from './engine/bibtex-engine'
import {
  type CompileEngine,
  createCompileEngine,
  unavailableEngineResult,
} from './engine/compile-engine'
import {
  type EngineDetection,
  type EngineOption,
  resolveEngine,
  type TexEngine,
} from './engine/engine-select'
import { IncrementalCompiler, type IncrementalResult } from './engine/incremental'
import { detectIndexUse, type IndexStageRequest, runRemoteIndex } from './engine/index-backend'
import { MakeindexEngine } from './engine/makeindex-engine'
import { buildDiagnostics, parseTexErrors } from './engine/parse-errors'
import { RerunController, signatureOf } from './engine/rerun-controller'
import { type WasmTexEngineOptions, WasmTexPdftexEngine } from './engine/wasmtex-engine'
import { syncAllFilesToEngine } from './fs/engine-sync'
import { VirtualFS } from './fs/virtual-fs'
import { parseAuxFile } from './lsp/aux-parser'
import { parseBibFile, rebuildBibIndex } from './lsp/bib-parser'
import { ProjectIndex } from './lsp/project-index'
import { parseTraceFile } from './lsp/trace-parser'
import type { CompileResult, TexliveVersion, WarmupCache } from './types'

export type { BackendStageContract, ToolBackend, WasmTexBackendStages } from './backend-api'
// Per-stage backend toolkit (execution-model principle 3), re-exported so a headless
// (server/CI) integrator can wire a server backend for the `backends` option without
// also pulling in the browser-component entry.
export * from './backend-api'
export { BackendRegistry, BIBER_STAGE, BIBTEX_STAGE, INDEX_STAGE } from './backend-api'

export interface WasmTexCompilerOptions {
  /** TeX Live version to use. Defaults to '2025'. */
  texliveVersion?: TexliveVersion
  /** TexLive server endpoint. Defaults to the public CDN. */
  texliveUrl?: string
  /** Base URL for WASM/static assets. */
  assetBaseUrl?: string
  /** Main TeX file name. Defaults to 'main.tex'. */
  mainFile?: string
  /** Initial project files. Keys are file paths, values are content. */
  files?: Record<string, string | Uint8Array>
  /** If true, do not attempt to preload the base .fmt file from the server. */
  skipFormatPreload?: boolean
  /** If true, disable precompiled preamble snapshots and always run a full
   *  compile. An escape hatch for documents incompatible with preamble
   *  precompilation. Defaults to false (snapshots enabled). */
  disablePreambleSnapshot?: boolean
  /** Enable the built-in persistent (IndexedDB) cache of fetched TeX Live assets.
   *  Silently no-ops where IndexedDB is unavailable. Defaults to false. */
  persistentCache?: boolean
  /** Pre-fetched TeX Live files from `warmup()`. */
  warmupCache?: WarmupCache
  /** Which TeX engine to use. `'auto'` (default) detects the engine from the main
   *  file (a `% !TEX program` comment, or fontspec/unicode-math/CJK/lua packages),
   *  falling back to pdfLaTeX. Set an explicit engine to override detection. */
  engine?: EngineOption
  /** Enable incremental compilation via mid-document checkpoints (#55, pdfLaTeX only):
   *  body edits after a page break re-typeset just the tail and splice it onto a cached
   *  head PDF — much faster on long documents. Needs the optional `pdf-lib` peer for
   *  splicing; falls back to a full compile when unavailable or unsafe (preamble or
   *  cross-reference changes). Defaults to false. */
  incremental?: boolean
  /** Per-stage backend registry (execution-model principle 3). The default for every
   *  stage is client/local, so nothing leaves the device. Register a **server** backend
   *  for a stage — e.g. a remote BibTeX/Biber for the `bibliography` stage — to offload
   *  that stage to an endpoint running the same deterministic engine; the client-first
   *  default stays intact for any stage left unregistered. */
  backends?: BackendRegistry
}

type FileContent = string | Uint8Array

function resolveAssetBase(provided?: string): string {
  if (!provided) return '/'
  return provided.endsWith('/') ? provided : `${provided}/`
}

function normalizeTexPath(path: string): string {
  return path.endsWith('.tex') ? path : `${path}.tex`
}

export class WasmTexCompiler {
  private engine: CompileEngine | null = null
  private engineKind: TexEngine = 'pdflatex'
  private detection: EngineDetection = {
    engine: 'pdflatex',
    reason: 'default',
    forced: false,
  }
  /** Set when the document needs an engine whose artifact is not available. */
  private unavailable: EngineDetection | null = null
  private bibtexEngine: BibtexEngine | null = null
  private makeindexEngine: MakeindexEngine | null = null
  /** Incremental (checkpoint) compiler, set when `incremental` is on and the active
   *  engine is pdfLaTeX. Null otherwise (XeLaTeX/LuaLaTeX always do a full compile). */
  private incremental: IncrementalCompiler | null = null
  private fs: VirtualFS
  private projectIndex = new ProjectIndex()
  private mainFile: string
  private assetBaseUrl: string
  private opts: WasmTexCompilerOptions
  private initialized = false

  constructor(options: WasmTexCompilerOptions = {}) {
    this.opts = options
    this.mainFile = options.mainFile ?? 'main.tex'
    this.assetBaseUrl = resolveAssetBase(options.assetBaseUrl)
    this.fs = new VirtualFS({ empty: true })

    for (const [path, content] of Object.entries(options.files ?? {})) {
      this.fs.writeFile(path, content)
      this.updateIndexForFile(path, content)
    }
    // The engine is created lazily by ensureEngine(), once the main source (and
    // therefore the required engine) is known.
  }

  /** Engine options shared by every engine kind (binary-specific bits are set
   *  by the factory). */
  private engineBaseOpts(): WasmTexEngineOptions {
    const opts: WasmTexEngineOptions = {
      assetBaseUrl: this.assetBaseUrl,
      skipFormatPreload: !!this.opts.skipFormatPreload,
      disablePreambleSnapshot: !!this.opts.disablePreambleSnapshot,
      persistentCache: !!this.opts.persistentCache,
      texliveVersion: this.opts.texliveVersion ?? '2025',
      ...(this.opts.warmupCache ? { warmupCache: this.opts.warmupCache } : {}),
    }
    if (this.opts.texliveUrl) opts.texliveUrl = this.opts.texliveUrl
    return opts
  }

  /** Current main-file content as a string (for engine detection). */
  private mainSource(): string {
    const content = this.fs.readFile(this.mainFile)
    return typeof content === 'string' ? content : ''
  }

  /** All project `.tex` sources (path → content), for multi-file incremental compile. */
  private projectTexFiles(): Map<string, string> {
    const files = new Map<string, string>()
    for (const path of this.fs.listFiles()) {
      if (!path.endsWith('.tex')) continue
      const content = this.fs.readFile(path)
      if (typeof content === 'string') files.set(path, content)
    }
    return files
  }

  /**
   * Ensure `this.engine` matches the engine the current main source requires.
   * On a kind change (or first call) it (re)creates and initializes the engine and
   * does a full resync. If a Unicode engine's artifact is unavailable, it records
   * `this.unavailable` instead of throwing (pdfLaTeX failures still throw).
   */
  private async ensureEngine(): Promise<void> {
    this.detection = resolveEngine(this.mainSource(), this.opts.engine)
    if (this.engine && this.detection.engine === this.engineKind) return

    this.engine?.terminate()
    this.engineKind = this.detection.engine
    this.engine = createCompileEngine(this.detection.engine, this.engineBaseOpts())
    // Incremental checkpoints are a pdfLaTeX-only feature (the worker commands live in
    // the pdfTeX worker); other engines always take the full path.
    this.incremental =
      this.opts.incremental && this.engine instanceof WasmTexPdftexEngine
        ? new IncrementalCompiler(this.engine, { mainFile: this.mainFile })
        : null
    try {
      await this.engine.init()
      this.unavailable = null
      await this.syncAllFilesToEngine()
    } catch (err) {
      if (this.detection.engine === 'pdflatex') throw err
      // Unicode engine artifact missing/broken — surface an actionable result.
      this.unavailable = this.detection
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return
    await this.ensureEngine()
    this.initialized = true
  }

  async compile(): Promise<CompileResult> {
    this.ensureInitialized()
    await this.ensureEngine()
    if (this.unavailable || !this.engine) {
      return unavailableEngineResult(this.unavailable ?? this.detection)
    }
    const engine = this.engine
    await this.syncModifiedFilesToEngine()

    // `\makeindex` opens the `.idx` write stream in the preamble; a precompiled-preamble
    // snapshot dumps the preamble into a format that can't carry an open stream, so the
    // `.idx` is silently never written and the index comes out empty. Disable the snapshot
    // for index documents (set per-compile, since the engine is reused across edits).
    if (engine.setPreambleSnapshot) {
      const wantSnapshot = !this.opts.disablePreambleSnapshot && !detectIndexUse(this.mainSource())
      engine.setPreambleSnapshot(wantSnapshot)
    }

    // Incremental fast path (pdfLaTeX): serve a safe body edit from a checkpoint —
    // re-typeset only the tail and splice onto the cached head PDF. Only when the
    // result is `final` (no cross-reference changes); otherwise fall through to a
    // full compile, which also reconciles labels and refreshes metadata.
    if (this.incremental) {
      const t0 = performance.now()
      const fast = await this.incremental.tryIncremental(this.mainSource(), this.projectTexFiles())
      if (fast?.final && fast.pdf) return this.toCompileResult(fast, performance.now() - t0)
    }

    let result = await engine.compile()
    let auxInjected = await this.runAuxStages(result)

    // Auto-rerun for cross-references, guaranteed to terminate: the controller
    // caps reruns and stops once the cross-reference state stops changing. An aux
    // stage that just produced a new `.bbl`/`.ind` also forces one more pass so the
    // engine reads it — a `\printindex`-only document emits no rerun marker (unlike
    // `\cite`), and the injection guards make that force one-shot, so it still terminates.
    const controller = new RerunController()
    while (result.success || result.pdf) {
      const decision = controller.decide(
        result.log,
        signatureOf(result.semanticTrace ?? result.log),
      )
      if (!decision.rerun && !auxInjected) break
      await this.syncModifiedFilesToEngine()
      result = await engine.compile()
      auxInjected = await this.runAuxStages(result)
    }

    // Parse metadata (aux/trace) once on the final, stabilized result — intermediate
    // rerun passes only feed the rerun decision (log signature), not the project index,
    // so reading/parsing the .aux each pass was redundant worker round-trips.
    await this.updateMetadata(result)
    // Record the fully stabilized state (after any cross-reference reruns) as the baseline the
    // next incremental compile diffs against + seeds checkpoints from. The SyncTeX is the head
    // merge-base so the next fast paint can return exact `synctexData` (#99 P2).
    this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), result.synctex)
    return result
  }

  /** Map an incremental (checkpoint) result to a CompileResult. The tail log carries this pass's
   *  diagnostics; head errors can't recur (the head is unchanged), and metadata/cross-refs are
   *  unchanged for a `final` result, so the last full compile's project index still holds. The raw
   *  `synctex` is null (the tail compiled in isolation), but `synctexData` carries the tail SyncTeX
   *  spliced onto the last full compile's head — exact for the spliced PDF (#99 P2). */
  private toCompileResult(r: IncrementalResult, compileTime: number): CompileResult {
    return {
      success: r.success,
      pdf: r.pdf,
      log: r.log,
      errors: parseTexErrors(r.log),
      compileTime: Math.round(compileTime),
      synctex: null,
      synctexData: r.synctexData ?? null,
      telemetry: { diagnostics: buildDiagnostics(r.log) },
    }
  }

  setFile(path: string, content: FileContent): void {
    this.fs.writeFile(path, content)
    if ((path.endsWith('.tex') || path.endsWith('.bib')) && !path.endsWith('.bbl')) {
      const base = this.mainFile.replace(/\.tex$/, '')
      // Drop generated stage artifacts so an edit re-runs bibtex / makeindex instead of
      // serving a stale `.bbl` / `.ind` (their guards skip when the artifact still exists).
      this.fs.deleteFile(`${base}.bbl`)
      this.fs.deleteFile(`${base}.ind`)
    }
    if (!path.endsWith('.tex')) {
      // A non-.tex file (image/data asset, .bib, .bst) can be baked into a checkpoint head
      // (e.g. \includegraphics{logo.png} on a title page) yet isn't tracked by the .tex-only
      // incremental diff. Drop checkpoints so the change forces a fresh full compile (which
      // also re-runs the bibtex/makeindex aux stages) rather than splicing a stale head.
      this.incremental?.reset()
    }
    this.updateIndexForFile(path, content)
  }

  async loadProject(files: Record<string, FileContent>): Promise<void> {
    this.fs = new VirtualFS({ empty: true })
    this.projectIndex = new ProjectIndex()
    // New document → the checkpoint manager's diff baseline + cached checkpoints are stale.
    this.incremental?.reset()
    for (const [path, content] of Object.entries(files)) {
      this.fs.writeFile(path, content)
      this.updateIndexForFile(path, content)
    }
    if (this.initialized) {
      this.bibtexEngine?.terminate()
      this.bibtexEngine = null
      this.makeindexEngine?.terminate()
      this.makeindexEngine = null
      if (this.engine && !this.unavailable) {
        // Reuse the warm engine when its kind still fits (keeps the TeX Live
        // package cache hot); compile()'s ensureEngine() will swap kinds if the
        // new main source needs a different engine.
        await this.engine.flushCache()
        await this.syncAllFilesToEngine()
      } else {
        // No usable engine yet — force ensureEngine() to rebuild on next compile.
        this.engine?.terminate()
        this.engine = null
      }
    }
  }

  getFile(path: string): FileContent | null {
    return this.fs.readFile(path)
  }

  listFiles(): string[] {
    return this.fs.listFiles()
  }

  getMainFile(): string {
    return this.mainFile
  }

  setMainFile(path: string): void {
    this.mainFile = path
    // Re-point (not just reset) the incremental compiler: its mainFile is wired into the
    // diff baseline / snapshot bookkeeping, so a bare reset() would leave it diffing the
    // wrong file after the active main changes.
    this.incremental?.setMainFile(path)
    if (this.initialized && this.engine && !this.unavailable) this.engine.setMainFile(path)
  }

  getProjectIndex(): ProjectIndex {
    return this.projectIndex
  }

  async readOutput(path: string): Promise<string | null> {
    this.ensureInitialized()
    return (await this.engine?.readFile(path)) ?? null
  }

  async flushCache(): Promise<void> {
    this.ensureInitialized()
    await this.engine?.flushCache()
  }

  /**
   * Clear the built-in persistent TeX Live asset cache (IndexedDB) for the
   * active TeX Live version. No-op when the persistent cache is unavailable.
   */
  async clearCache(): Promise<void> {
    await this.engine?.clearCache()
  }

  dispose(): void {
    this.engine?.terminate()
    this.engine = null
    this.bibtexEngine?.terminate()
    this.bibtexEngine = null
    this.makeindexEngine?.terminate()
    this.makeindexEngine = null
    this.initialized = false
  }

  private async syncAllFilesToEngine(): Promise<void> {
    const engine = this.engine
    if (!engine || this.unavailable) return
    // Shared with the UI host so the two full-sync paths can't drift; it marks only
    // the files actually written as synced (by identity), protecting a host edit that
    // replaces a map entry mid-sync. (Same protection as syncModifiedFilesToEngine.)
    await syncAllFilesToEngine(
      this.fs,
      engine,
      (paths) => this.ensureEngineDirectories(paths),
      this.mainFile,
    )
  }

  private async syncModifiedFilesToEngine(): Promise<void> {
    const engine = this.engine
    if (!engine || this.unavailable) return
    const modified = this.fs.getModifiedFiles()
    await this.ensureEngineDirectories(modified.map((file) => file.path))
    for (const file of modified) {
      await engine.writeFile(file.path, file.content)
    }
    // Only clear the files we synced; edits that landed during the awaits above
    // replaced their map entries and must remain modified for the next cycle.
    this.fs.markSynced(modified)
    engine.setMainFile(this.mainFile)
  }

  private async ensureEngineDirectories(paths: string[]): Promise<void> {
    const engine = this.engine
    if (!engine) return
    const dirs = new Set<string>()
    for (const path of paths) {
      const parts = path.split('/')
      let dir = ''
      for (let i = 0; i < parts.length - 1; i++) {
        dir = dir ? `${dir}/${parts[i]!}` : parts[i]!
        dirs.add(dir)
      }
    }
    for (const dir of Array.from(dirs).sort()) {
      await engine.mkdir(dir)
    }
  }

  private updateIndexForFile(path: string, content: FileContent): void {
    if (typeof content !== 'string') return
    if (path.endsWith('.tex')) this.projectIndex.updateFile(path, content)
    if (path.endsWith('.bib')) this.updateBibIndex()
  }

  private updateBibIndex(): void {
    rebuildBibIndex(this.fs, this.projectIndex)
  }

  private async updateMetadata(result: CompileResult): Promise<void> {
    if (!this.engine) return
    const base = this.mainFile.replace(/\.tex$/, '')
    const aux = await this.engine.readFile(`${base}.aux`)
    if (aux) this.projectIndex.updateAuxData(parseAuxFile(aux))
    if (result.engineCommands?.length) {
      this.projectIndex.updateEngineCommands(result.engineCommands)
    }
    if (result.semanticTrace) {
      this.projectIndex.updateSemanticTrace(parseTraceFile(result.semanticTrace))
    }
    if (result.inputFiles?.length) {
      for (const path of result.inputFiles) {
        const file = this.fs.getFile(normalizeTexPath(path))
        if (file && typeof file.content === 'string') {
          this.projectIndex.updateFile(file.path, file.content)
        }
      }
    }
  }

  /** Run the auto aux stages (bibliography, then index) after a LaTeX pass. Returns whether
   *  any stage injected a new artifact this pass — if so the caller runs another LaTeX pass
   *  so the engine reads it (a `\printindex`-only document emits no rerun marker). A document
   *  is classic-BibTeX *or* biblatex (never both), so the two bibliography paths gate on
   *  mutually exclusive triggers and at most one fires. */
  private async runAuxStages(result: CompileResult): Promise<boolean> {
    const bib = (await this.maybeRunBibtex(result)) || (await this.maybeRunBiblatex(result))
    const idx = await this.maybeRunMakeindex(result)
    return bib || idx
  }

  /** @returns whether a fresh `.bbl` was injected this pass (forces one more LaTeX pass). */
  private async maybeRunBibtex(result: CompileResult): Promise<boolean> {
    const mainEngine = this.engine
    if (!mainEngine) return false
    if (!result.success && !result.pdf) return false
    if (!this.fs.listFiles().some((path) => path.endsWith('.bib'))) return false

    const mainBase = this.mainFile.replace(/\.tex$/, '')
    const auxContent = await mainEngine.readFile(`${mainBase}.aux`)
    if (!auxContent?.includes('\\citation{') || !auxContent.includes('\\bibdata{')) return false
    if (this.fs.readFile(`${mainBase}.bbl`)) return false

    // Pluggable bibliography stage: if the integrator routed it to a server backend, use
    // that `.bbl` and skip the client BibTeX engine entirely. Default = client BibTeX.
    const bibFiles = this.collectBibFiles()
    const request: BibliographyStageRequest = { aux: auxContent, bibFiles }
    // Forward a project-local custom `.bst` so a server backend can resolve it too (the
    // client path writes it directly in runClientBibtex).
    const bst = this.resolveProjectBst(auxContent)
    if (bst) request.bstFiles = { [bst.path]: bst.content }
    const bbl =
      (await runRemoteBibliography(this.opts.backends, request)) ??
      (await this.runClientBibtex(mainBase, auxContent, bibFiles))
    if (!bbl) return false

    this.fs.writeFile(`${mainBase}.bbl`, bbl)
    await mainEngine.writeFile(`${mainBase}.bbl`, bbl)
    return true
  }

  /**
   * The biblatex counterpart of {@link maybeRunBibtex}. A biblatex document does **not** write
   * the classic `\bibdata{}`/`\citation{}` markers to the `.aux` (it uses `\abx@aux@cite` and a
   * `.bcf` control file), so {@link maybeRunBibtex}'s gate never fires for it. Here we route the
   * `.bcf` the first LaTeX pass emitted: when `backend=biber` and a **server** Biber backend is
   * registered, run it on `{ bcf, bibFiles }` (full fidelity); otherwise fall back to the bundled
   * biblatex-lite (cite keys parsed from the `.bcf`, entries from the project `.bib`s). Inject the
   * `.bbl` so the next pass resolves `\cite`s.
   * @returns whether a fresh `.bbl` was injected this pass (forces one more LaTeX pass).
   */
  private async maybeRunBiblatex(result: CompileResult): Promise<boolean> {
    const mainEngine = this.engine
    if (!mainEngine) return false
    if (!result.success && !result.pdf) return false
    const source = this.mainSource()
    if (detectBibliographyMode(source) !== 'biblatex') return false

    const mainBase = this.mainFile.replace(/\.tex$/, '')
    if (this.fs.readFile(`${mainBase}.bbl`)) return false
    // biblatex emits the `.bcf` only once `\usepackage{biblatex}` ran; bail until it exists so
    // a stale/absent control file can't drive an empty bibliography.
    const bcf = await mainEngine.readFile(`${mainBase}.bcf`)
    if (!bcf?.trim()) return false

    const bibFiles = this.collectBibFiles()
    // Server Biber (full fidelity) when wired for `backend=biber`; else bundled biblatex-lite.
    const bbl =
      (detectBiblatexBackend(source) === 'biber'
        ? await runRemoteBiber(this.opts.backends, { bcf, bibFiles })
        : null) ?? this.runClientBiblatexLite(source, bcf, bibFiles)
    if (!bbl) return false

    this.fs.writeFile(`${mainBase}.bbl`, bbl)
    await mainEngine.writeFile(`${mainBase}.bbl`, bbl)
    return true
  }

  /** Bundled biblatex-lite for the bibliography stage → `.bbl`: parse the cited keys from the
   *  `.bcf` and the entries from the project `.bib`s, then generate the documented-subset `.bbl`.
   *  The client default when no server Biber backend is registered (so a biblatex document still
   *  gets a bibliography fully on-device). */
  private runClientBiblatexLite(
    source: string,
    bcf: string,
    bibFiles: Record<string, string>,
  ): string {
    const entries = Object.entries(bibFiles).flatMap(([path, content]) =>
      parseBibFile(content, path),
    )
    const citedKeys = parseBcfCitedKeys(bcf)
    // `\nocite{*}` records a `*` key in the .bcf — expand it to every entry, in .bib order.
    const keys = citedKeys.includes('*') ? entries.map((e) => e.key) : citedKeys
    return generateBiblatexBbl({ entries, citedKeys: keys, sort: detectBiblatexSort(source) })
  }

  /**
   * Auto-run the index stage for `\printindex` (analogous to {@link maybeRunBibtex}): when
   * the LaTeX pass emitted a non-empty `.idx` and no `.ind` exists yet, turn it into `.ind`
   * — via a registered **server** backend for the `index` stage (makeindex/xindy), else the
   * bundled makeindex WASM (client-first, fully on-device) — and inject it so `\printindex`
   * resolves on the next pass. Gated on the source actually using `\makeindex`+`\printindex`
   * so a stale `.idx` in a reused engine can't add a phantom index.
   * @returns whether a fresh `.ind` was injected this pass (forces one more LaTeX pass).
   */
  private async maybeRunMakeindex(result: CompileResult): Promise<boolean> {
    const mainEngine = this.engine
    if (!mainEngine) return false
    if (!result.success && !result.pdf) return false
    if (!detectIndexUse(this.mainSource())) return false

    const mainBase = this.mainFile.replace(/\.tex$/, '')
    if (this.fs.readFile(`${mainBase}.ind`)) return false
    const idx = await mainEngine.readFile(`${mainBase}.idx`)
    if (!idx?.trim()) return false

    const request: IndexStageRequest = { idx }
    const ind =
      (await runRemoteIndex(this.opts.backends, request)) ??
      (await this.runClientMakeindex(mainBase, idx))
    if (!ind) return false

    this.fs.writeFile(`${mainBase}.ind`, ind)
    await mainEngine.writeFile(`${mainBase}.ind`, ind)
    return true
  }

  /** Resolve the project-local custom `.bst` named by `\bibliographystyle` (read from the
   *  VFS), or null when the style is bundled / absent. Shared by the client + server paths. */
  private resolveProjectBst(auxContent: string): { path: string; content: string } | null {
    return resolveBstFile(auxContent, (p) => {
      const c = this.fs.readFile(p)
      return typeof c === 'string' ? c : null
    })
  }

  /** Gather the project's `.bib` databases (path → content) for the bibliography stage. */
  private collectBibFiles(): Record<string, string> {
    const bibFiles: Record<string, string> = {}
    for (const path of this.fs.listFiles()) {
      if (!path.endsWith('.bib')) continue
      const content = this.fs.readFile(path)
      if (typeof content === 'string') bibFiles[path] = content
    }
    return bibFiles
  }

  /** Run the bundled client BibTeX (WASM) engine for the bibliography stage → `.bbl`, or
   *  null if it produced none. The default when no server backend is registered. */
  private async runClientBibtex(
    mainBase: string,
    auxContent: string,
    bibFiles: Record<string, string>,
  ): Promise<string | null> {
    const engine = await this.ensureBibtexEngine()
    await engine.writeFile(`${mainBase}.aux`, auxContent)
    for (const [path, content] of Object.entries(bibFiles)) {
      await engine.writeFile(path, content)
    }
    // A `\bibliographystyle{mycustom}` referencing a project-local `mycustom.bst` must be
    // written into the BibTeX engine FS — kpathsea only finds bundled styles otherwise, so a
    // custom style silently yields no `.bbl` (mirrors the UI path's sendFilesToBibtex).
    const bst = this.resolveProjectBst(auxContent)
    if (bst) await engine.writeFile(bst.path, bst.content)
    await engine.compile(mainBase)
    return (await engine.readFile(`${mainBase}.bbl`)) ?? null
  }

  /** Shared constructor options for the bundled aux-stage engines (BibTeX, makeindex):
   *  same asset base / TeX Live version / endpoint as the main engine. */
  private auxEngineOpts(): {
    assetBaseUrl?: string
    texliveUrl?: string
    texliveVersion?: TexliveVersion
  } {
    const opts: { assetBaseUrl?: string; texliveUrl?: string; texliveVersion?: TexliveVersion } = {
      assetBaseUrl: this.assetBaseUrl,
      texliveVersion: this.opts.texliveVersion ?? '2025',
    }
    if (this.opts.texliveUrl) opts.texliveUrl = this.opts.texliveUrl
    return opts
  }

  private async ensureBibtexEngine(): Promise<BibtexEngine> {
    if (this.bibtexEngine) return this.bibtexEngine
    const engine = new BibtexEngine(this.auxEngineOpts())
    await engine.init()
    this.bibtexEngine = engine
    return engine
  }

  /** Run the bundled client makeindex (WASM) engine for the index stage → `.ind`, or null
   *  if it produced none. The default when no server backend is registered for `index`. */
  private async runClientMakeindex(mainBase: string, idx: string): Promise<string | null> {
    const engine = await this.ensureMakeindexEngine()
    await engine.writeFile(`${mainBase}.idx`, idx)
    await engine.compile(mainBase)
    return (await engine.readFile(`${mainBase}.ind`)) ?? null
  }

  private async ensureMakeindexEngine(): Promise<MakeindexEngine> {
    if (this.makeindexEngine) return this.makeindexEngine
    const engine = new MakeindexEngine(this.auxEngineOpts())
    await engine.init()
    this.makeindexEngine = engine
    return engine
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('WasmTexCompiler is not initialized. Call init() first.')
    }
  }
}
