import type { AccessibleExportOptions, DocumentMetadataInjection } from './engine/accessible-export'
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
import { CompilerOperations } from './engine/compiler-operation'
import { CompletionFileDigestCache, createCompletionSnapshot } from './engine/completion-snapshot'
import {
  type AuxiliaryDependencyObservation,
  buildDependencyManifest,
  buildIncrementalDependencyManifest,
  normalizeProjectDependencyPath,
} from './engine/dependency-manifest'
import {
  type EngineDetection,
  type EngineOption,
  resolveEngine,
  type TexEngine,
} from './engine/engine-select'
import type { HeapCheckpointCompiler } from './engine/heap-checkpoints'
import { IncrementalCompiler, type IncrementalResult } from './engine/incremental'
import { detectIndexUse, type IndexStageRequest, runRemoteIndex } from './engine/index-backend'
import { MakeindexEngine } from './engine/makeindex-engine'
import { buildDiagnostics, parseTexErrors } from './engine/parse-errors'
import { RerunController, signatureOf } from './engine/rerun-controller'
import {
  buildTexliveDependencySet,
  mergeTexliveDependencySets,
} from './engine/texlive-dependencies'
import {
  AUTO_MIN_PICTURES,
  type AutoExternalizationBlocker,
  defaultFigureWorkers,
  detectAutoBlocker,
  detectTikzExternalization,
  figureJobSource,
  mainJobSource,
  PREAMBLE_SNAPSHOT_JOBNAME,
  parseFigureList,
  parseFigureMd5,
  type TikzExternalizationKind,
  type TikzExternalizationOptions,
} from './engine/tikz-externalization'
import type { TikzFigurePool } from './engine/tikz-figure-pool'
import { type WasmTexEngineOptions, WasmTexPdftexEngine } from './engine/wasmtex-engine'
import { syncAllFilesToEngine } from './fs/engine-sync'
import { VirtualFS } from './fs/virtual-fs'
import { parseAuxFiles, readAuxFiles } from './lsp/aux-files'
import { parseBibFile, rebuildBibIndex } from './lsp/bib-parser'
import { ProjectIndex } from './lsp/project-index'
import { parseTraceFile } from './lsp/trace-parser'
import type {
  AccessibleExportResult,
  CompileResult,
  CompletionSnapshotProfile,
  CompletionSnapshotState,
  DependencyManifest,
  LoadProgressEvent,
  ResolverEvidenceReport,
  TexError,
  TexliveDependencySet,
  TexliveVersion,
  TikzExternalizationTelemetry,
  WarmupCache,
} from './types'

export type { BackendStageContract, ToolBackend, WasmTexBackendStages } from './backend-api'
// Per-stage backend toolkit (execution-model principle 3), re-exported so a headless
// (server/CI) integrator can wire a server backend for the `backends` option without
// also pulling in the browser-component entry.
export * from './backend-api'
export { BackendRegistry, BIBER_STAGE, BIBTEX_STAGE, INDEX_STAGE } from './backend-api'
export type { AccessibleExportOptions } from './engine/accessible-export'
export {
  COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES,
  COMPLETION_SNAPSHOT_SCHEMA_VERSION,
} from './engine/completion-snapshot'
export type { EngineDetection } from './engine/engine-select'
export type {
  AccessibleExportResult,
  CompilePhaseTimings,
  CompletionSnapshot,
  CompletionSnapshotCollection,
  CompletionSnapshotCommand,
  CompletionSnapshotEngine,
  CompletionSnapshotEvidence,
  CompletionSnapshotFieldName,
  CompletionSnapshotFields,
  CompletionSnapshotIdentity,
  CompletionSnapshotKey,
  CompletionSnapshotKeyFamily,
  CompletionSnapshotProfile,
  CompletionSnapshotResource,
  CompletionSnapshotState,
  CompletionSnapshotValue,
  DependencyManifest,
  DependencyManifestCoverage,
  DependencyManifestIncompleteReason,
  DependencyManifestSource,
  DependencyManifestStage,
} from './types'

/** Picture errors live in the figure logs, so re-surface the cached ones on every compile: a
 *  broken picture stays broken (and reported) until its source changes. */
function cachedPictureErrors(pool: TikzFigurePool, names: string[]): TexError[] {
  const errors: TexError[] = []
  for (const name of names) {
    const log = pool.cache.get(name)?.log
    if (log) errors.push(...pictureErrors(log))
  }
  return errors
}

/** TeX errors from a figure-job log. Cross-reference warnings are dropped: a figure job
 *  typesets the whole body with whatever `.aux` it was handed, so its "undefined reference"
 *  notes say nothing the main job's own log does not say better. */
function pictureErrors(log: string): TexError[] {
  return parseTexErrors(log).filter(
    (e) =>
      !/Reference .* undefined|Citation .* undefined|There were undefined (?:references|citations)|Label\(s\) may have changed|Rerun to get/i.test(
        e.message,
      ),
  )
}

/**
 * One-shot accessible export without an interactive compiler: builds a compiler from
 * `options` (typically the TeX Live 2026 profile, whatever profile the editor uses), compiles
 * the project once with the tagging declaration in the main file, and disposes it. For hosts
 * whose preview profile predates the tagging kernel.
 */
export async function compileAccessiblePdf(
  options: WasmTexCompilerOptions,
  exportOptions: AccessibleExportOptions = {},
): Promise<AccessibleExportResult> {
  const mainFile = options.mainFile ?? 'main.tex'
  const original = options.files?.[mainFile]
  const source = typeof original === 'string' ? original : ''
  const { injectDocumentMetadata, documentClassOf, CLASS_SUPPORT } = await loadAccessibleExport()
  const declaration = injectDocumentMetadata(source, exportOptions)
  const documentClass = documentClassOf(source)
  const classSupport = (documentClass && CLASS_SUPPORT[documentClass]) || 'unknown'
  const notes = exportNotes(documentClass, classSupport, declaration.injected)
  const compiler = new WasmTexCompiler({
    ...options,
    files: { ...options.files, [mainFile]: declaration.source },
    incremental: false,
    tikzExternalization: { mode: 'off' },
  })
  try {
    await compiler.init()
    const result = await compiler.compile()
    return await describeAccessibleExport(result, declaration, documentClass, classSupport, notes)
  } finally {
    compiler.dispose()
  }
}

async function describeAccessibleExport(
  result: CompileResult,
  declaration: DocumentMetadataInjection,
  documentClass: string | null,
  classSupport: AccessibleExportResult['classSupport'],
  notes: string[],
): Promise<AccessibleExportResult> {
  const { kernelLacksTagging, inspectPdfTagging } = await loadAccessibleExport()
  const kernelSupported = !kernelLacksTagging(result.log)
  if (!kernelSupported) {
    notes.push(
      "This engine's LaTeX kernel predates tagging support (TeX Live 2025); use the TeX Live 2026 profile for accessible export.",
    )
  }
  const tagging = result.pdf ? await inspectPdfTagging(result.pdf) : null
  if (tagging) notes.push(...taggingNotes(tagging, kernelSupported))
  return {
    result,
    declaration: {
      lang: declaration.lang,
      standard: declaration.standard,
      injected: declaration.injected,
    },
    documentClass,
    classSupport,
    kernelSupported,
    tagging,
    notes,
  }
}

/** The export module is loaded on first export: most sessions never export, and hosts
 *  keep the headless compiler in their startup bundle. */
function loadAccessibleExport() {
  return import('./engine/accessible-export')
}

function exportNotes(
  documentClass: string | null,
  classSupport: AccessibleExportResult['classSupport'],
  injected: boolean,
): string[] {
  const notes: string[] = []
  if (classSupport === 'unsupported') {
    notes.push(
      `Document class '${documentClass}' is known not to work with the LaTeX tagging kernel; the export may fail or come out untagged.`,
    )
  } else if (classSupport === 'partial') {
    notes.push(
      `Document class '${documentClass}' produces a structure tree but logs tagging errors; check the exported PDF.`,
    )
  } else if (classSupport === 'unknown' && documentClass) {
    notes.push(`Document class '${documentClass}' has not been verified with the tagging kernel.`)
  }
  if (!injected) {
    notes.push('The document declares its own \\DocumentMetadata; it was exported as written.')
  }
  return notes
}

function taggingNotes(
  tagging: NonNullable<AccessibleExportResult['tagging']>,
  kernelSupported: boolean,
): string[] {
  const notes: string[] = []
  if (!tagging.tagged && kernelSupported) {
    notes.push('The compile produced no structure tree; the PDF is not tagged.')
  }
  if (tagging.figures > tagging.figuresWithAlt) {
    notes.push(
      `${tagging.figures - tagging.figuresWithAlt} of ${tagging.figures} figures have no text alternative (alt={…}).`,
    )
  }
  return notes
}

function isNodeRuntime(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process
  return typeof proc?.versions?.node === 'string'
}

function withTikzTelemetry(
  result: CompileResult,
  telemetry: TikzExternalizationTelemetry,
): CompileResult {
  result.telemetry ??= { diagnostics: buildDiagnostics(result.log) }
  result.telemetry.tikzExternalization = telemetry
  return result
}

function collectConversionInputs(inputs: Set<string>, result: CompileResult): void {
  for (const input of result.pdfConversionInputs ?? []) inputs.add(input)
}

function attachConversionInputs(result: CompileResult, inputs: Set<string>): void {
  if (inputs.size) result.pdfConversionInputs = [...inputs].sort()
}

/** A picture error does not fail its figure job (TeX keeps going and ships the page), so the
 *  figure logs are the only place those diagnostics exist; merge them into the result. */
function mergePictureErrors(result: CompileResult, errors: TexError[]): number {
  const key = (e: TexError) => `${e.file ?? ''}:${e.line ?? ''}:${e.message}`
  const seen = new Set(result.errors.map(key))
  for (const error of errors) {
    if (seen.has(key(error))) continue
    seen.add(key(error))
    result.errors.push(error)
  }
  return errors.length
}

function emptyTikzTelemetry(mode: 'document' | 'auto'): TikzExternalizationTelemetry {
  return {
    mode,
    figures: 0,
    compiled: 0,
    reused: 0,
    failed: [],
    workers: 0,
    figureTimeMs: 0,
    pictureErrors: 0,
  }
}

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
  /** Persist pdfLaTeX's document-specific preamble format in IndexedDB across
   *  compiler sessions. Requires `completionProfile.mirrorRevision`; otherwise
   *  it fails closed to the normal in-worker snapshot. Defaults to false. */
  persistentPreambleCache?: boolean
  /** Pre-fetched TeX Live files from `warmup()`. */
  warmupCache?: WarmupCache
  /** Called as the engine loads: the format download percentage and every TeX Live
   *  file fetched on demand. Hosts render a progress bar or the current file name
   *  instead of a blank wait. Warmup has its own `onProgress` (files done / total). */
  onLoadProgress?: (event: LoadProgressEvent) => void
  /** Which TeX engine to use. `'auto'` (default) detects the engine from the main
   *  file (a `% !TEX program` comment, or fontspec/unicode-math/CJK/lua packages),
   *  falling back to pdfLaTeX. Set an explicit engine to override detection. */
  engine?: EngineOption
  /** Observe each newly selected engine before initialization, including Auto changes.
   *  Optional host preparation must not mutate compiler inputs. Returned promises are
   *  not awaited; observer failures are reported without failing compilation. */
  onEngineSelected?: (selection: Readonly<EngineDetection>) => void | Promise<void>
  /** Enable incremental compilation via mid-document checkpoints (#55, pdfLaTeX only):
   *  body edits after a page break re-typeset just the tail and splice it onto a cached
   *  head PDF — much faster on long documents. Needs the optional `pdf-lib` peer for
   *  splicing; falls back to a full compile when unavailable or unsafe (preamble or
   *  cross-reference changes). Defaults to false. */
  incremental?: boolean
  /** TikZ/pgfplots figure externalization (#82). By default (`mode: 'document'`) a document
   *  that calls `\tikzexternalize` gets its figures rendered by a pool of sibling compilers
   *  and cached by the library's own MD5, so a text edit recompiles no picture — instead of
   *  today's per-figure shell-escape error and inline fallback. `mode: 'auto'` extends this to
   *  documents that load TikZ but never call `\tikzexternalize`; `mode: 'off'` disables it. */
  tikzExternalization?: TikzExternalizationOptions
  /** Per-stage backend registry (execution-model principle 3). The default for every
   *  stage is client/local, so nothing leaves the device. Register a **server** backend
   *  for a stage — e.g. a remote BibTeX/Biber for the `bibliography` stage — to offload
   *  that stage to an endpoint running the same deterministic engine; the client-first
   *  default stays intact for any stage left unregistered. */
  backends?: BackendRegistry
  /** Stable identity for the compile profile that produced runtime completion evidence.
   *  Bind `mirrorRevision` when the TeX Live endpoint is immutable/catalog-backed. */
  completionProfile?: {
    id: string
    mirrorRevision: string | null
  }
}

type FileContent = string | Uint8Array

function resolveAssetBase(provided?: string): string {
  if (!provided) return '/'
  return provided.endsWith('/') ? provided : `${provided}/`
}

/** Auxiliary files LaTeX probes through kpathsea before opening them in the work
 *  directory; never a mirror object, so never a prefetch entry. */
const GENERATED_AUX_EXTENSIONS = [
  'aux',
  'toc',
  'lof',
  'lot',
  'out',
  'bbl',
  'ind',
  'nav',
  'snm',
  'vrb',
  'glo',
  'gls',
  'acn',
  'acr',
  'loa',
  'thm',
  'xdy',
] as const

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
  /** Arbitrary-line checkpoints on the Asyncify engine build (#81); null when the engine
   *  cannot take them, in which case `incremental` (page-break checkpoints, #55) applies. */
  private heap: HeapCheckpointCompiler | null = null
  /** Checkpoint preparation shares the one pdfTeX worker with compile(). */
  private prebuildInFlight: Promise<boolean> | null = null
  private compileInFlight = false
  private readonly operations = new CompilerOperations()
  private initInFlight: Promise<void> | null = null
  private replacingProject = false
  private disposalRevision = 0
  private inputRevision = 0
  private fs: VirtualFS
  private projectIndex = new ProjectIndex()
  private completionDigests = new CompletionFileDigestCache()
  private mainFile: string
  private assetBaseUrl: string
  private opts: WasmTexCompilerOptions
  private initialized = false
  /** Outputs generated by auxiliary stages. They live in the VFS so LaTeX can read
   *  them, but are derived artifacts rather than host-editable project inputs. */
  private generatedFiles = new Set<string>()
  /** Provenance is keyed by generated output so switching main files cannot attach
   *  one root's bibliography/index request to another root's derived artifact. */
  private generatedDependencyObservations = new Map<string, AuxiliaryDependencyObservation>()
  /** Stages attempted in the current compile, including failures with no output. */
  private currentAuxiliaryDependencies = new Map<
    AuxiliaryDependencyObservation['stage'],
    AuxiliaryDependencyObservation
  >()
  /** The last successful full result's manifest seeds only the informational input
   *  list on an incremental result; the incremental manifest remains incomplete. */
  private lastFullDependencyManifest: DependencyManifest | undefined
  /** Union of every compile's resolver evidence since init — a preamble-snapshot compile
   *  resolves only body files, so the per-compile set alone would shrink after the first
   *  compile and a host persisting it would lose the preamble's files. */
  private sessionDependencies: TexliveDependencySet | undefined
  /** Sibling compilers rendering externalized TikZ figures (#82); created on first use. */
  private tikzPool: TikzFigurePool | null = null
  /** `mode: 'auto'` switched itself off for this session after a figure job failed. */
  private tikzAutoDisabled = false
  /** Why `mode: 'auto'` left the current document inline (for telemetry). */
  private tikzAutoBlocker: AutoExternalizationBlocker | null = null
  /** Sibling compiler for accessible (tagged PDF) exports (#84); created on first export so
   *  the interactive engine and its snapshot are never disturbed. */
  private exportCompiler: WasmTexCompiler | null = null
  private exportSynced = new Map<string, string | Uint8Array>()

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
  /** Forward the engine's load callbacks to the host as `LoadProgressEvent`s. */
  private attachLoadProgress(engine: CompileEngine): void {
    const listener = this.opts.onLoadProgress
    if (!listener) return
    let count = 0
    engine.onProgress = (percent) => listener({ phase: 'format', percent })
    engine.onFileDownload = (file) => {
      count += 1
      listener({ phase: 'file', file, count })
    }
  }

  private engineBaseOpts(): WasmTexEngineOptions {
    const opts: WasmTexEngineOptions = {
      assetBaseUrl: this.assetBaseUrl,
      skipFormatPreload: !!this.opts.skipFormatPreload,
      disablePreambleSnapshot: !!this.opts.disablePreambleSnapshot,
      persistentCache: !!this.opts.persistentCache,
      persistentPreambleCache: !!this.opts.persistentPreambleCache,
      preambleCacheIdentity: {
        mirrorRevision: this.opts.completionProfile?.mirrorRevision ?? null,
      },
      resolverProfile: this.completionProfile(),
      texliveVersion: this.opts.texliveVersion ?? '2025',
      // The checkpoint (Asyncify) engine build is a browser-worker asset; Node hosts keep
      // the plain build and the page-break checkpoints.
      heapCheckpoints: !!this.opts.incremental && !isNodeRuntime(),
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
    this.attachLoadProgress(this.engine)
    // The engine options (including warmup inputs) are fixed before notifying hosts.
    // Pass a detached value so a consumer cannot rewrite our selection state.
    if (this.opts.onEngineSelected) {
      const report = (error: unknown) => console.error('Engine selection observer failed', error)
      try {
        void Promise.resolve(this.opts.onEngineSelected({ ...this.detection })).catch(report)
      } catch (error) {
        report(error)
      }
    }
    this.operations.assertCurrent()
    // Incremental checkpoints are a pdfLaTeX-only feature (the worker commands live in
    // the pdfTeX worker); other engines always take the full path.
    this.incremental =
      this.opts.incremental && this.engine instanceof WasmTexPdftexEngine
        ? new IncrementalCompiler(this.engine, { mainFile: this.mainFile })
        : null
    // The heap checkpoint controller only matters once compiles run; load it beside the
    // engine so hosts that never enable incremental compiles never ship it (#81).
    this.heap =
      this.opts.incremental && this.engine instanceof WasmTexPdftexEngine
        ? new ((
            await this.operations.observe(import('./engine/heap-checkpoints'))
          ).resume().HeapCheckpointCompiler)(this.engine, {
            mainFile: this.mainFile,
          })
        : null
    try {
      ;(await this.operations.observe(this.engine.init())).resume()
      this.unavailable = null
      ;(await this.operations.observe(this.syncAllFilesToEngine())).resume()
    } catch (err) {
      this.operations.assertCurrent()
      if (this.detection.engine === 'pdflatex') throw err
      // Unicode engine artifact missing/broken — surface an actionable result.
      this.unavailable = this.detection
    }
  }

  async init(): Promise<void> {
    if (this.initInFlight) return this.initInFlight
    if (this.initialized) return
    this.assertNoProjectReplacement()
    const task = this.operations.run(async () => {
      this.sessionDependencies = undefined
      try {
        await this.ensureEngine()
        this.operations.assertCurrent()
        this.initialized = true
      } catch (error) {
        this.retireEngines()
        throw error
      }
    })
    this.initInFlight = task
    try {
      await task
    } finally {
      if (this.initInFlight === task) this.initInFlight = null
    }
  }

  async compile(): Promise<CompileResult> {
    this.ensureInitialized()
    this.assertNoProjectReplacement()
    if (this.compileInFlight) throw new Error('Compile already in progress')
    this.compileInFlight = true
    const revision = this.inputRevision
    try {
      // Reserve this call before waiting: another compile must not queue behind it.
      if (this.prebuildInFlight) await this.prebuildInFlight
      this.assertRevision(revision)
      const result = await this.operations.run(() => this.compileIdle())
      this.assertRevision(revision)
      return result
    } finally {
      this.compileInFlight = false
    }
  }

  private async compileIdle(): Promise<CompileResult> {
    this.currentAuxiliaryDependencies.clear()
    ;(await this.operations.observe(this.ensureEngine())).resume()
    if (this.unavailable || !this.engine) {
      const unavailable = unavailableEngineResult(this.unavailable ?? this.detection)
      this.attachDependencyManifest(unavailable)
      return unavailable
    }
    const engine = this.engine
    ;(await this.operations.observe(this.syncModifiedFilesToEngine())).resume()

    // `\makeindex` opens the `.idx` write stream in the preamble; a precompiled-preamble
    // snapshot dumps the preamble into a format that can't carry an open stream, so the
    // `.idx` is silently never written and the index comes out empty. Disable the snapshot
    // for index documents (set per-compile, since the engine is reused across edits).
    if (engine.setPreambleSnapshot) {
      const wantSnapshot = !this.opts.disablePreambleSnapshot && !detectIndexUse(this.mainSource())
      engine.setPreambleSnapshot(wantSnapshot)
    }

    const externalization = this.tikzExternalizationKind()
    const fast = (
      await this.operations.observe(this.tryIncrementalFastPath(externalization))
    ).resume()
    if (fast) return fast

    // Heap checkpoints (#81): resume the last run from before the edit when the engine holds
    // a valid checkpoint (a complete compile comes out of it), else a full compile that arms
    // checkpoints for the edited region.
    let result =
      (await this.operations.observe(this.tryHeapResume(externalization))).resume() ??
      (await this.operations.observe(engine.compile(this.heapArms()))).resume()
    // Resolver evidence is per pass; the prefetch manifest is their union (#80).
    const conversionInputs = new Set(result.pdfConversionInputs ?? [])
    const resolverReports = [result.telemetry?.resolver]
    result = (
      await this.operations.observe(
        this.applyTikzExternalization(result, externalization, resolverReports),
      )
    ).resume()
    collectConversionInputs(conversionInputs, result)
    const tikzTelemetry = result.telemetry?.tikzExternalization
    let auxInjected = (await this.operations.observe(this.runAuxStages(result))).resume()

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
      ;(await this.operations.observe(this.syncModifiedFilesToEngine())).resume()
      result = (await this.operations.observe(engine.compile(this.heapArms()))).resume()
      resolverReports.push(result.telemetry?.resolver)
      collectConversionInputs(conversionInputs, result)
      auxInjected = (await this.operations.observe(this.runAuxStages(result))).resume()
    }
    this.heap?.noteFull(this.mainSource(), this.projectTexFiles(), result)
    // Cross-reference reruns replace `result`; the figure telemetry describes this compile.
    if (tikzTelemetry) {
      result.telemetry ??= { diagnostics: buildDiagnostics(result.log) }
      result.telemetry.tikzExternalization = tikzTelemetry
    }
    attachConversionInputs(result, conversionInputs)
    this.attachTexliveDependencies(result, resolverReports)

    // Parse metadata (aux/trace) once on the final, stabilized result — intermediate
    // rerun passes only feed the rerun decision (log signature), not the project index,
    // so reading/parsing the .aux each pass was redundant worker round-trips.
    ;(await this.operations.observe(this.updateMetadata(result))).resume()
    // Record the fully stabilized state (after any cross-reference reruns) as the baseline the
    // next incremental compile diffs against + seeds checkpoints from. The SyncTeX is the head
    // merge-base so the next fast paint can return exact `synctexData` (#99 P2).
    this.attachDependencyManifest(result)
    ;(await this.operations.observe(this.attachCompletionSnapshot(result))).resume()
    this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), result.synctex)
    return result
  }

  /**
   * Build the incremental checkpoint nearest an expected edit while the compiler is idle.
   * Calling this after a successful full compile moves the one-time checkpoint build out of
   * the next interactive compile. `offset` is a UTF-16 offset in `path`; included-file paths
   * warm the checkpoint before their `\include`/`\input` command.
   *
   * Returns false when incremental mode is disabled/ineligible, project writes are pending,
   * a compile owns the worker, or the checkpoint is already warm. A compile started while a
   * preparation is running waits for it before using the worker.
   */
  async prepareIncrementalCompile(path = this.mainFile, offset?: number): Promise<boolean> {
    this.ensureInitialized()
    const incremental = this.incremental
    if (
      !incremental ||
      this.unavailable ||
      !this.engine ||
      this.compileInFlight ||
      this.replacingProject ||
      this.fs.getModifiedFiles().length > 0
    ) {
      return false
    }
    if (this.prebuildInFlight) return this.prebuildInFlight
    const content = this.fs.readFile(path)
    if (typeof content !== 'string' || !path.toLowerCase().endsWith('.tex')) return false
    const source = this.mainSource()
    const files = this.projectTexFiles()
    if (this.operations.busy && !this.prebuildInFlight) return false
    const task = this.operations.run(async () => {
      return (
        await this.operations.observe(
          this.heap?.enabled
            ? this.prepareHeapCheckpoint(source, files, path, offset ?? content.length)
            : incremental.prebuildForEdit(source, files, path, offset ?? content.length),
        )
      ).resume()
    })
    this.prebuildInFlight = task
    try {
      return await task
    } finally {
      if (this.prebuildInFlight === task) this.prebuildInFlight = null
    }
  }

  /** Arm a heap checkpoint before the cursor's paragraph with one idle full compile, unless
   *  one already covers it. Included files map to their `\input` position like #55. */
  private async prepareHeapCheckpoint(
    source: string,
    files: Map<string, string>,
    path: string,
    offset: number,
  ): Promise<boolean> {
    const heap = this.heap
    const engine = this.engine
    if (!heap || !engine || !(engine instanceof WasmTexPdftexEngine)) return false
    let mainOffset = offset
    if (path !== this.mainFile) {
      const at = source.indexOf(`{${path.replace(/\.tex$/, '')}}`)
      if (at < 0) return false
      mainOffset = at
    }
    const arms = heap.armsForFullCompile(source, files, mainOffset)
    if (arms.length === 0) return false
    const result = (await this.operations.observe(engine.compile({ checkpoints: arms }))).resume()
    heap.noteFull(source, files, result)
    return (result.heapCheckpoints?.length ?? 0) > 0
  }

  /** Checkpoint arms for the full compile about to run (none without the heap engine). */
  private heapArms(): { checkpoints?: Array<{ id: string; line: number }> } | undefined {
    if (!this.heap?.enabled) return undefined
    const arms = this.heap.armsForFullCompile(this.mainSource(), this.projectTexFiles())
    return arms.length ? { checkpoints: arms } : undefined
  }

  /** Resume from a heap checkpoint when the edit allows an exact result; null otherwise. */
  private async tryHeapResume(
    externalization: TikzExternalizationKind | null,
  ): Promise<CompileResult | null> {
    if (!this.heap?.enabled || externalization) return null
    const resume = (
      await this.operations.observe(this.heap.tryResume(this.mainSource(), this.projectTexFiles()))
    ).resume()
    if (!resume || !resume.final || !resume.result.pdf) return null
    return resume.result
  }

  /** Map an incremental (checkpoint) result to a CompileResult. The tail log carries this pass's
   *  diagnostics; head errors can't recur (the head is unchanged), and metadata/cross-refs are
   *  unchanged for a `final` result, so the last full compile's project index still holds. The raw
   *  `synctex` is null (the tail compiled in isolation), but `synctexData` carries the tail SyncTeX
   *  spliced onto the last full compile's head — exact for the spliced PDF (#99 P2). */
  private toCompileResult(r: IncrementalResult, compileTime: number): CompileResult {
    const result: CompileResult = {
      success: r.success,
      pdf: r.pdf,
      log: r.log,
      errors: parseTexErrors(r.log),
      compileTime: Math.round(compileTime),
      synctex: null,
      synctexData: r.synctexData ?? null,
      telemetry: { diagnostics: buildDiagnostics(r.log) },
    }
    result.telemetry!.dependencyManifest = buildIncrementalDependencyManifest(
      this.mainFile,
      this.lastFullDependencyManifest,
    )
    return result
  }

  setFile(path: string, content: FileContent): void {
    this.assertNoProjectReplacement()
    this.invalidateOperation()
    this.projectIndex.invalidateCompletionSnapshot()
    this.fs.writeFile(path, content)
    // A host write replaces any same-named generated artifact with a real project file.
    const dependencyPath = normalizeProjectDependencyPath(path) ?? path
    this.generatedFiles.delete(dependencyPath)
    this.generatedDependencyObservations.delete(dependencyPath)
    this.currentAuxiliaryDependencies.clear()
    if (
      (path.endsWith('.tex') || path.endsWith('.bib') || path.endsWith('.bst')) &&
      !path.endsWith('.bbl')
    ) {
      const base = this.mainFile.replace(/\.tex$/, '')
      // Drop generated stage artifacts so an edit re-runs bibtex / makeindex instead of
      // serving a stale `.bbl` / `.ind` (their guards skip when the artifact still exists).
      // `.bst` is included: a custom style is just as much a bibliography input as `.bib`.
      this.dropGeneratedFile(`${base}.bbl`)
      this.dropGeneratedFile(`${base}.ind`)
    }
    if (!path.endsWith('.tex')) {
      // A non-.tex file (image/data asset, .bib, .bst) can be baked into a checkpoint head
      // (e.g. \includegraphics{logo.png} on a title page) yet isn't tracked by the .tex-only
      // incremental diff. Drop checkpoints so the change forces a fresh full compile (which
      // also re-runs the bibtex/makeindex aux stages) rather than splicing a stale head.
      this.incremental?.reset()
      this.heap?.reset()
    }
    this.updateIndexForFile(path, content)
  }

  async loadProject(files: Record<string, FileContent>): Promise<void> {
    this.assertNoProjectReplacement()
    this.replacingProject = true
    const revision = this.disposalRevision
    try {
      await this.invalidateOperation()
      if (revision !== this.disposalRevision)
        throw new DOMException('Compiler disposed', 'AbortError')
      await this.operations.run(() => this.replaceProject(files))
    } finally {
      this.replacingProject = false
    }
  }

  private async replaceProject(files: Record<string, FileContent>): Promise<void> {
    this.fs = new VirtualFS({ empty: true })
    this.projectIndex = new ProjectIndex()
    this.generatedFiles.clear()
    this.generatedDependencyObservations.clear()
    this.currentAuxiliaryDependencies.clear()
    this.lastFullDependencyManifest = undefined
    // New document → the checkpoint manager's diff baseline + cached checkpoints are stale.
    this.incremental?.reset()
    this.heap?.reset()
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
        ;(await this.operations.observe(this.engine.flushCache())).resume()
        ;(await this.operations.observe(this.syncAllFilesToEngine())).resume()
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
    this.assertNoProjectReplacement()
    const changed = path !== this.mainFile
    if (!changed) return
    this.projectIndex.invalidateCompletionSnapshot()
    if (changed) this.invalidateOperation()
    this.mainFile = path
    this.currentAuxiliaryDependencies.clear()
    this.lastFullDependencyManifest = undefined
    if (changed) {
      // Re-point (not just reset) the incremental compiler: its mainFile is wired into the
      // diff baseline / snapshot bookkeeping, so a bare reset() would leave it diffing the
      // wrong file after the active main changes. Hosts that re-assert the same main file
      // before every compile keep their checkpoints: nothing about the head changed.
      this.incremental?.setMainFile(path)
      this.heap?.reset()
    }
    if (this.initialized && this.engine && !this.unavailable) this.engine.setMainFile(path)
  }

  getProjectIndex(): ProjectIndex {
    return this.projectIndex
  }

  getCompletionSnapshotState(): CompletionSnapshotState {
    return this.projectIndex.getCompletionSnapshotState()
  }

  async readOutput(path: string): Promise<string | null> {
    this.ensureInitialized()
    this.assertNoProjectReplacement()
    return this.operations.run(
      async () => (await this.operations.observe(this.engine?.readFile(path))).resume() ?? null,
    )
  }

  async flushCache(): Promise<void> {
    this.ensureInitialized()
    this.assertNoProjectReplacement()
    await this.operations.run(async () => {
      ;(await this.operations.observe(this.engine?.flushCache())).resume()
      this.fs.markAllModified()
      this.incremental?.reset()
      this.heap?.reset()
    })
  }

  /**
   * Clear the built-in persistent TeX Live asset cache (IndexedDB) for the
   * active TeX Live mirror namespace. No-op when the persistent cache is unavailable.
   */
  async clearCache(): Promise<void> {
    this.assertNoProjectReplacement()
    await this.operations.run(async () => {
      ;(await this.operations.observe(this.engine?.clearCache())).resume()
    })
  }

  dispose(): void {
    this.disposalRevision += 1
    this.inputRevision += 1
    void this.operations.cancel()
    this.retireEngines()
    this.projectIndex.invalidateCompletionSnapshot()
    this.initialized = false
  }

  private assertNoProjectReplacement(): void {
    if (this.replacingProject) throw new Error('Project replacement in progress')
  }

  private assertRevision(revision: number): void {
    if (revision !== this.inputRevision)
      throw new DOMException('Compiler input changed', 'AbortError')
  }

  private invalidateOperation(): Promise<void> {
    this.inputRevision += 1
    const busy = this.operations.busy
    const settled = this.operations.cancel()
    if (busy) this.retireEngines()
    return settled
  }

  private retireEngines(): void {
    this.incremental = null
    this.heap = null
    this.engine?.terminate()
    this.engine = null
    this.tikzPool?.dispose()
    this.tikzPool = null
    this.exportCompiler?.dispose()
    this.exportCompiler = null
    this.exportSynced.clear()
    this.bibtexEngine?.terminate()
    this.bibtexEngine = null
    this.makeindexEngine?.terminate()
    this.makeindexEngine = null
    this.lastFullDependencyManifest = undefined
    this.unavailable = null
    for (const path of [...this.generatedFiles]) this.dropGeneratedFile(path)
    this.currentAuxiliaryDependencies.clear()
    this.fs.markAllModified()
  }

  private dropGeneratedFile(path: string): void {
    this.fs.deleteFile(path)
    const dependencyPath = normalizeProjectDependencyPath(path) ?? path
    this.generatedFiles.delete(dependencyPath)
    this.generatedDependencyObservations.delete(dependencyPath)
  }

  private auxiliaryDependencyObservations(result: CompileResult): AuxiliaryDependencyObservation[] {
    const byStage = new Map(this.currentAuxiliaryDependencies)
    for (const input of result.inputFiles ?? []) {
      const path = normalizeProjectDependencyPath(input)
      if (!path) continue
      const observation = this.generatedDependencyObservations.get(path)
      if (observation) byStage.set(observation.stage, observation)
    }
    return [...byStage.values()]
  }

  /** Attach the manifest only here, above every engine and auxiliary backend. The
   * engine layer alone cannot distinguish host project files from generated VFS
   * artifacts or account for server/client stage requests. */
  /** Union the TeX passes' resolver evidence into the exact prefetch manifest a host
   *  can replay through `warmup({ dependencies })` next session (#80). */
  private attachTexliveDependencies(
    result: CompileResult,
    reports: ReadonlyArray<ResolverEvidenceReport | undefined>,
  ): void {
    const excludeNames = new Set<string>()
    for (const path of this.fs.listFiles()) excludeNames.add(path.slice(path.lastIndexOf('/') + 1))
    const mainBase = this.mainFile.replace(/\.tex$/i, '').slice(this.mainFile.lastIndexOf('/') + 1)
    for (const ext of GENERATED_AUX_EXTENSIONS) excludeNames.add(`${mainBase}.${ext}`)
    const set = buildTexliveDependencySet(
      this.opts.texliveVersion ?? '2025',
      this.completionProfile(),
      reports,
      { excludeNames },
    )
    if (!set) return
    this.sessionDependencies = mergeTexliveDependencySets(this.sessionDependencies, set)
    result.telemetry ??= { diagnostics: buildDiagnostics(result.log) }
    result.telemetry.texliveDependencies = this.sessionDependencies
  }

  private attachDependencyManifest(result: CompileResult): void {
    result.telemetry ??= { diagnostics: buildDiagnostics(result.log) }
    const manifest = buildDependencyManifest({
      engine: this.engineKind,
      root: this.mainFile,
      projectFiles: this.fs.listFiles(),
      generatedFiles: this.generatedFiles,
      auxiliaryStages: this.auxiliaryDependencyObservations(result),
      result,
    })
    result.telemetry.dependencyManifest = manifest
    this.lastFullDependencyManifest = result.success && result.pdf ? manifest : undefined
  }

  private completionProfile(): CompletionSnapshotProfile {
    const texliveYear = this.opts.texliveVersion ?? '2025'
    return {
      id:
        this.opts.completionProfile?.id ??
        `wasmtex:${texliveYear}:${this.opts.texliveUrl ?? 'default-mirror'}`,
      texliveYear,
      mirrorRevision: this.opts.completionProfile?.mirrorRevision ?? null,
    }
  }

  private async attachCompletionSnapshot(result: CompileResult): Promise<void> {
    if (!result.success || !this.engine) return
    if (this.fs.getModifiedFiles().length > 0) return
    const engine = this.engine
    const root = this.mainFile
    const projectFiles = (
      await this.operations.observe(
        Promise.all(
          this.fs
            .listFiles()
            .filter((path) => !this.generatedFiles.has(path))
            .flatMap((path) => {
              const file = this.fs.getFile(path)
              return file ? [file] : []
            })
            .map(async (file) => ({
              path: file.path,
              content: file.content,
              digest: (
                await this.operations.observe(this.completionDigests.digest(file, file.content))
              ).resume(),
            })),
        ),
      )
    ).resume()
    const engineObservation = engine.getCompletionObservation?.()
    const snapshot = (
      await this.operations.observe(
        createCompletionSnapshot({
          engine: this.engineKind,
          root,
          profile: this.completionProfile(),
          projectFiles,
          ...(result.engineCommands ? { engineCommands: result.engineCommands } : {}),
          engineCommandsComplete: result.engineCommandsComplete === true,
          ...(result.engineCommandsDropped !== undefined
            ? { engineCommandsDropped: result.engineCommandsDropped }
            : {}),
          ...(engineObservation ? { engineObservation } : {}),
          ...(result.inputFiles ? { inputFiles: result.inputFiles } : {}),
          inputFilesComplete: result.inputFilesComplete === true,
        }),
      )
    ).resume()
    // A concurrent host write remains modified and belongs to a later project revision.
    if (root !== this.mainFile || engine !== this.engine || this.fs.getModifiedFiles().length > 0) {
      return
    }
    result.telemetry ??= { diagnostics: buildDiagnostics(result.log) }
    result.telemetry.completionSnapshot = snapshot
    this.projectIndex.updateCompletionSnapshot(snapshot)
  }

  private async syncAllFilesToEngine(): Promise<void> {
    const engine = this.engine
    if (!engine || this.unavailable)
      return // Shared with the UI host so the two full-sync paths can't drift; it marks only
      // the files actually written as synced (by identity), protecting a host edit that
      // replaces a map entry mid-sync. (Same protection as syncModifiedFilesToEngine.)
    ;(
      await this.operations.observe(
        syncAllFilesToEngine(
          this.fs,
          {
            writeFile: (path, content) => engine.writeFile(path, this.engineContent(path, content)),
            setMainFile: (mainFile) => engine.setMainFile(mainFile),
          },
          (paths) => this.ensureEngineDirectories(paths),
          this.mainFile,
        ),
      )
    ).resume()
  }

  /** Content the engine sees for `path`: the main file may carry the TikZ externalization
   *  switches (same line count as the project source, so SyncTeX and diagnostics line up). */
  private engineContent(path: string, content: string | Uint8Array): string | Uint8Array {
    if (path !== this.mainFile || typeof content !== 'string') return content
    const kind = this.tikzExternalizationKind(content)
    return kind ? mainJobSource(content, kind) : content
  }

  private tikzExternalizationKind(source = this.mainSource()): TikzExternalizationKind | null {
    const kind = detectTikzExternalization(
      source,
      this.opts.tikzExternalization?.mode ?? 'document',
    )
    if (kind !== 'inject') return kind
    // Auto mode: only pictures the library can externalize faithfully, only when there are
    // enough of them to pay for a figure worker, and never again after a figure job failed.
    if (this.tikzAutoDisabled) return null
    this.tikzAutoBlocker = detectAutoBlocker(source, this.projectTexFiles().values())
    return this.tikzAutoBlocker ? null : kind
  }

  /**
   * Incremental fast path (pdfLaTeX): serve a safe body edit from a checkpoint — re-typeset
   * only the tail and splice onto the cached head PDF. Only when the result is `final` (no
   * cross-reference changes); otherwise the caller falls through to a full compile, which also
   * reconciles labels and refreshes metadata. Externalized figures live in the engine FS and
   * are included by the main job; the checkpoint path compiles tails in isolation, so it is
   * skipped for them.
   */
  private async tryIncrementalFastPath(
    externalization: TikzExternalizationKind | null,
  ): Promise<CompileResult | null> {
    if (!this.incremental || externalization) return null
    const t0 = performance.now()
    const fast = (
      await this.operations.observe(
        this.incremental.tryIncremental(this.mainSource(), this.projectTexFiles()),
      )
    ).resume()
    if (fast?.final && fast.pdf) return this.toCompileResult(fast, performance.now() - t0)
    return null
  }

  /** Run figure jobs for `result` and, when any rendered, run the main job again so it
   *  includes them (the figure telemetry carries over to the final result). */
  /** Externalize after the first pass when switched on; otherwise record why auto left the
   *  document inline. */
  private async applyTikzExternalization(
    result: CompileResult,
    kind: TikzExternalizationKind | null,
    resolverReports: Array<ResolverEvidenceReport | undefined>,
  ): Promise<CompileResult> {
    if (kind && (result.success || result.pdf)) {
      return this.externalizeTikzFigures(result, kind, resolverReports)
    }
    if (this.opts.tikzExternalization?.mode === 'auto' && this.tikzAutoBlocker) {
      result.telemetry ??= { diagnostics: buildDiagnostics(result.log) }
      result.telemetry.tikzExternalization = {
        ...emptyTikzTelemetry('auto'),
        blocked: this.tikzAutoBlocker,
      }
    }
    return result
  }

  private async externalizeTikzFigures(
    result: CompileResult,
    kind: TikzExternalizationKind,
    resolverReports: Array<ResolverEvidenceReport | undefined>,
  ): Promise<CompileResult> {
    const engine = this.engine
    if (!engine) return result
    const snapshot = !!engine.setPreambleSnapshot && !this.opts.disablePreambleSnapshot
    const jobs = (
      await this.operations.observe(this.runTikzFigureJobs(result, kind, snapshot))
    ).resume()
    if (!jobs) return result
    const { telemetry, errors, failureLog } = jobs
    // Auto mode promised "no worse than inline": a failed figure job means this document is
    // outside what the library handles (and too few pictures are not worth a worker), so
    // compile it inline now and keep it inline.
    if (kind === 'inject' && (jobs.inline || telemetry.failed.length > 0)) {
      this.tikzAutoDisabled = true
      if (!jobs.inline) telemetry.fallback = true
      ;(await this.operations.observe(engine.writeFile(this.mainFile, this.mainSource()))).resume()
      const inline = (await this.operations.observe(engine.compile())).resume()
      resolverReports.push(inline.telemetry?.resolver)
      return withTikzTelemetry(inline, telemetry)
    }
    const next =
      telemetry.compiled > 0 ? (await this.operations.observe(engine.compile())).resume() : result
    if (next !== result) resolverReports.push(next.telemetry?.resolver)
    telemetry.pictureErrors = mergePictureErrors(next, errors)
    if (failureLog) next.log += failureLog
    return withTikzTelemetry(next, telemetry)
  }

  /**
   * Render the figures the main job listed as missing or stale (#82). Figure jobs are ordinary
   * compiles of the same document on sibling compilers, selected through the `external`
   * library's own grab mode; see `engine/tikz-externalization.ts`. Returns null when the
   * document lists no figures.
   */
  private async runTikzFigureJobs(
    result: CompileResult,
    kind: TikzExternalizationKind,
    snapshot: boolean,
  ): Promise<{
    telemetry: TikzExternalizationTelemetry
    errors: TexError[]
    failureLog: string
    /** Auto mode must redo this compile inline (and stay inline). */
    inline?: boolean
  } | null> {
    const engine = this.engine
    if (!engine) return null
    const mainBase = this.mainFile.replace(/\.tex$/i, '')
    const listed = (
      await this.operations.observe(this.readTikzFigureList(mainBase, snapshot))
    ).resume()
    if (!listed) return null
    const { realJob, names } = listed
    // Auto mode with too few pictures to pay for a figure worker: the static check could not
    // tell (loops), so the first compile's figure list decides. Fall back to inline.
    if (kind === 'inject' && names.length < AUTO_MIN_PICTURES) {
      const telemetry = { ...emptyTikzTelemetry('auto'), figures: names.length }
      telemetry.blocked = 'too-few-pictures'
      result.telemetry ??= { diagnostics: buildDiagnostics(result.log) }
      result.telemetry.tikzExternalization = telemetry
      return { telemetry, errors: [], failureLog: '', inline: true }
    }
    const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined
    const workers =
      this.opts.tikzExternalization?.workers ??
      defaultFigureWorkers(nav?.hardwareConcurrency, nav?.deviceMemory)
    const pool = (await this.operations.observe(this.ensureTikzPool(workers))).resume()
    pool.retain(names)
    const md5s = (
      await this.operations.observe(
        Promise.all(names.map((name) => engine.readFile(`${name}.md5`))),
      )
    ).resume()
    const jobs = names
      .map((name, i) => ({ name, md5: parseFigureMd5(md5s[i]) }))
      .filter((job) => !pool.isCurrent(job.name, job.md5))
    const telemetry: TikzExternalizationTelemetry = {
      ...emptyTikzTelemetry(kind === 'inject' ? 'auto' : 'document'),
      figures: names.length,
      reused: names.length - jobs.length,
      workers: Math.min(workers, Math.max(1, jobs.length)),
    }
    result.telemetry ??= { diagnostics: buildDiagnostics(result.log) }
    result.telemetry.tikzExternalization = telemetry
    if (jobs.length === 0)
      return { telemetry, errors: cachedPictureErrors(pool, names), failureLog: '' }
    const source = this.mainSource()
    // The library resolves `\ref`/`\pageref` inside a picture from the real job's `.aux`
    // (it renames `\jobname` to the real job in figure mode), so hand the main job's aux to
    // the figure workers under that name.
    // `\include`d chapters keep their own `.aux`, which the main aux `\@input`s.
    const auxEntries: Array<[string, string]> = []
    const aux = (await this.operations.observe(engine.readFile(`${mainBase}.aux`))).resume()
    if (aux !== null) auxEntries.push([`${realJob}.aux`, aux])
    for (const path of this.projectTexFiles().keys()) {
      if (path === this.mainFile) continue
      const chapterAux = `${path.replace(/\.tex$/i, '')}.aux`
      const content = (await this.operations.observe(engine.readFile(chapterAux))).resume()
      if (content !== null) auxEntries.push([chapterAux, content])
    }
    const files = (): Iterable<[string, string | Uint8Array]> => [
      ...this.projectFileEntries(),
      ...auxEntries,
    ]
    const run = (
      await this.operations.observe(
        pool.render(jobs, (figure) => figureJobSource(source, kind, realJob, figure), files),
      )
    ).resume()
    telemetry.compiled = run.rendered.size
    telemetry.failed = run.failures.map((f) => f.name)
    telemetry.figureTimeMs = Math.round(run.elapsedMs)
    const errors = cachedPictureErrors(pool, names)
    let failureLog = ''
    for (const failure of run.failures) {
      errors.push(...pictureErrors(failure.log))
      failureLog += `\n[wasmtex] TikZ figure job '${failure.name}' failed:\n${failure.log.slice(-2000)}\n`
    }
    const paths: string[] = []
    for (const name of run.rendered.keys()) paths.push(`${name}.pdf`)
    ;(await this.operations.observe(this.ensureEngineDirectories(paths))).resume()
    ;(
      await this.operations.observe(
        Promise.all(
          [...run.rendered].flatMap(([name, figure]) => [
            engine.writeFile(`${name}.pdf`, figure.pdf),
            ...(figure.dpth !== null ? [engine.writeFile(`${name}.dpth`, figure.dpth)] : []),
          ]),
        ),
      )
    ).resume()
    return { telemetry, errors, failureLog }
  }

  /** The figure pool, loaded on first use (most documents never externalize). */
  private async ensureTikzPool(workers: number): Promise<TikzFigurePool> {
    if (!this.tikzPool) {
      const { TikzFigurePool } = (
        await this.operations.observe(import('./engine/tikz-figure-pool'))
      ).resume()
      this.tikzPool = new TikzFigurePool(() => this.spawnFigureCompiler(), workers, this.mainFile)
    }
    return this.tikzPool
  }

  /** The figure list the main job wrote, under whichever real job name it ran as: the
   *  preamble snapshot's, or the main file's when snapshots are off. */
  private async readTikzFigureList(
    mainBase: string,
    snapshot: boolean,
  ): Promise<{ realJob: string; names: string[] } | null> {
    const engine = this.engine
    if (!engine) return null
    const candidates = snapshot
      ? [PREAMBLE_SNAPSHOT_JOBNAME, mainBase]
      : [mainBase, PREAMBLE_SNAPSHOT_JOBNAME]
    for (const realJob of candidates) {
      const names = parseFigureList(
        (await this.operations.observe(engine.readFile(`${realJob}.figlist`))).resume(),
      )
      if (names.length > 0) return { realJob, names }
    }
    return null
  }

  private *projectFileEntries(): Iterable<[string, string | Uint8Array]> {
    for (const path of this.fs.listFiles()) {
      if (this.generatedFiles.has(path)) continue
      const file = this.fs.getFile(path)
      if (file) yield [path, file.content]
    }
  }

  /**
   * Compile the project as a tagged, PDF/UA-declared PDF (#84) on a sibling compiler: the
   * main file gets `\DocumentMetadata{lang=…, pdfstandard=ua-2, tagging=on}` in front of
   * `\documentclass` (unless it declares its own), everything else is the project as written.
   * The interactive `compile()` path is untouched. Needs the TeX Live 2026 profile (the 2025
   * kernel predates `tagging=on`); the result says so instead of failing silently.
   */
  async exportAccessiblePdf(
    options: AccessibleExportOptions = {},
  ): Promise<AccessibleExportResult> {
    this.ensureInitialized()
    const source = this.mainSource()
    const { injectDocumentMetadata, documentClassOf, CLASS_SUPPORT } = await loadAccessibleExport()
    const declaration = injectDocumentMetadata(source, options)
    const documentClass = documentClassOf(source)
    const classSupport = (documentClass && CLASS_SUPPORT[documentClass]) || 'unknown'
    const notes = exportNotes(documentClass, classSupport, declaration.injected)
    const result = await this.compileForExport(declaration.source)
    return describeAccessibleExport(result, declaration, documentClass, classSupport, notes)
  }

  /** Compile `mainSource` with the project's other files on the export sibling. */
  private async compileForExport(mainSource: string): Promise<CompileResult> {
    if (!this.exportCompiler) this.exportCompiler = this.spawnExportCompiler()
    const compiler = this.exportCompiler
    for (const [path, content] of this.projectFileEntries()) {
      if (path === this.mainFile) continue
      if (this.exportSynced.get(path) === content) continue
      compiler.setFile(path, content)
      this.exportSynced.set(path, content)
    }
    compiler.setFile(this.mainFile, mainSource)
    await compiler.init()
    return compiler.compile()
  }

  /** The export compiler: same profile, plain compile (no checkpoints, no externalization —
   *  the tagging kernel wants the pictures in the document). */
  private spawnExportCompiler(): WasmTexCompiler {
    const { files: _files, ...base } = this.opts
    this.exportSynced.clear()
    return new WasmTexCompiler({
      ...base,
      mainFile: this.mainFile,
      engine: this.engineKind,
      incremental: false,
      tikzExternalization: { mode: 'off' },
    })
  }

  /** A sibling compiler for figure jobs: same profile, no externalization of its own. */
  private spawnFigureCompiler(): WasmTexCompiler {
    const { files: _files, backends: _backends, ...base } = this.opts
    return new WasmTexCompiler({
      ...base,
      mainFile: this.mainFile,
      engine: this.engineKind,
      incremental: false,
      tikzExternalization: { mode: 'off' },
    })
  }

  private async syncModifiedFilesToEngine(): Promise<void> {
    const engine = this.engine
    if (!engine || this.unavailable) return
    const modified = this.fs.getModifiedFiles()
    ;(
      await this.operations.observe(this.ensureEngineDirectories(modified.map((file) => file.path)))
    ).resume()
    ;(
      await this.operations.observe(
        Promise.all(
          modified.map((file) =>
            engine.writeFile(file.path, this.engineContent(file.path, file.content)),
          ),
        ),
      )
    ).resume()
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
      ;(await this.operations.observe(engine.mkdir(dir))).resume()
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
    const engine = this.engine
    const aux = (
      await this.operations.observe(
        readAuxFiles(`${base}.aux`, async (path) =>
          (await this.operations.observe(engine.readFile(path))).resume(),
        ),
      )
    ).resume()
    this.projectIndex.updateAuxData(parseAuxFiles(aux))
    if (result.engineCommands?.length) {
      this.projectIndex.updateEngineCommands(result.engineCommands)
    }
    if (result.semanticTrace) {
      this.projectIndex.updateSemanticTrace(parseTraceFile(result.semanticTrace))
    }
    if (result.inputFiles?.length) {
      for (const path of result.inputFiles) {
        const projectPath = normalizeProjectDependencyPath(path)
        if (!projectPath) continue
        const file = this.fs.getFile(projectPath)
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
    const bib =
      (await this.operations.observe(this.maybeRunBibtex(result))).resume() ||
      (await this.operations.observe(this.maybeRunBiblatex(result))).resume()
    const idx = (await this.operations.observe(this.maybeRunMakeindex(result))).resume()
    return bib || idx
  }

  /** @returns whether a fresh `.bbl` was injected this pass (forces one more LaTeX pass). */
  private async maybeRunBibtex(result: CompileResult): Promise<boolean> {
    const mainEngine = this.engine
    if (!mainEngine) return false
    if (!result.success && !result.pdf) return false
    if (!this.fs.listFiles().some((path) => path.endsWith('.bib'))) return false

    const mainBase = this.mainFile.replace(/\.tex$/, '')
    const auxContent = (
      await this.operations.observe(mainEngine.readFile(`${mainBase}.aux`))
    ).resume()
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
      (
        await this.operations.observe(runRemoteBibliography(this.opts.backends, request))
      ).resume() ??
      (await this.operations.observe(this.runClientBibtex(mainBase, auxContent, bibFiles))).resume()
    const observation: AuxiliaryDependencyObservation = {
      stage: 'bibliography',
      projectInputs: [...Object.keys(bibFiles), ...Object.keys(request.bstFiles ?? {})],
      complete: !!bbl,
    }
    this.currentAuxiliaryDependencies.set('bibliography', observation)
    if (!bbl) return false

    const outputPath = `${mainBase}.bbl`
    const dependencyPath = normalizeProjectDependencyPath(outputPath) ?? outputPath
    this.fs.writeFile(outputPath, bbl)
    this.generatedFiles.add(dependencyPath)
    this.generatedDependencyObservations.set(dependencyPath, observation)
    ;(await this.operations.observe(mainEngine.writeFile(outputPath, bbl))).resume()
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
    const bcf = (await this.operations.observe(mainEngine.readFile(`${mainBase}.bcf`))).resume()
    if (!bcf?.trim()) return false

    const bibFiles = this.collectBibFiles()
    // Server Biber (full fidelity) when wired for `backend=biber`; else bundled biblatex-lite.
    const bbl =
      (detectBiblatexBackend(source) === 'biber'
        ? (
            await this.operations.observe(runRemoteBiber(this.opts.backends, { bcf, bibFiles }))
          ).resume()
        : null) ?? this.runClientBiblatexLite(source, bcf, bibFiles)
    const observation: AuxiliaryDependencyObservation = {
      stage: 'bibliography',
      projectInputs: Object.keys(bibFiles),
      complete: !!bbl,
    }
    this.currentAuxiliaryDependencies.set('bibliography', observation)
    if (!bbl) return false

    const outputPath = `${mainBase}.bbl`
    const dependencyPath = normalizeProjectDependencyPath(outputPath) ?? outputPath
    this.fs.writeFile(outputPath, bbl)
    this.generatedFiles.add(dependencyPath)
    this.generatedDependencyObservations.set(dependencyPath, observation)
    ;(await this.operations.observe(mainEngine.writeFile(outputPath, bbl))).resume()
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
    const idx = (await this.operations.observe(mainEngine.readFile(`${mainBase}.idx`))).resume()
    if (!idx?.trim()) return false

    const request: IndexStageRequest = { idx }
    const ind =
      (await this.operations.observe(runRemoteIndex(this.opts.backends, request))).resume() ??
      (await this.operations.observe(this.runClientMakeindex(mainBase, idx))).resume()
    const observation: AuxiliaryDependencyObservation = {
      stage: 'index',
      projectInputs: [],
      complete: !!ind,
    }
    this.currentAuxiliaryDependencies.set('index', observation)
    if (!ind) return false

    const outputPath = `${mainBase}.ind`
    const dependencyPath = normalizeProjectDependencyPath(outputPath) ?? outputPath
    this.fs.writeFile(outputPath, ind)
    this.generatedFiles.add(dependencyPath)
    this.generatedDependencyObservations.set(dependencyPath, observation)
    ;(await this.operations.observe(mainEngine.writeFile(outputPath, ind))).resume()
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
    const engine = (await this.operations.observe(this.ensureAuxEngine('bibtexEngine'))).resume()
    ;(await this.operations.observe(engine.writeFile(`${mainBase}.aux`, auxContent))).resume()
    for (const [path, content] of Object.entries(bibFiles)) {
      ;(await this.operations.observe(engine.writeFile(path, content))).resume()
    }
    // A `\bibliographystyle{mycustom}` referencing a project-local `mycustom.bst` must be
    // written into the BibTeX engine FS — kpathsea only finds bundled styles otherwise, so a
    // custom style silently yields no `.bbl` (mirrors the UI path's sendFilesToBibtex).
    const bst = this.resolveProjectBst(auxContent)
    if (bst) (await this.operations.observe(engine.writeFile(bst.path, bst.content))).resume()
    ;(await this.operations.observe(engine.compile(mainBase))).resume()
    return (await this.operations.observe(engine.readFile(`${mainBase}.bbl`))).resume() ?? null
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

  /** Run the bundled client makeindex (WASM) engine for the index stage → `.ind`, or null
   *  if it produced none. The default when no server backend is registered for `index`. */
  private async runClientMakeindex(mainBase: string, idx: string): Promise<string | null> {
    const engine = (await this.operations.observe(this.ensureAuxEngine('makeindexEngine'))).resume()
    ;(await this.operations.observe(engine.writeFile(`${mainBase}.idx`, idx))).resume()
    ;(await this.operations.observe(engine.compile(mainBase))).resume()
    return (await this.operations.observe(engine.readFile(`${mainBase}.ind`))).resume() ?? null
  }

  private async ensureAuxEngine(
    key: 'bibtexEngine' | 'makeindexEngine',
  ): Promise<BibtexEngine | MakeindexEngine> {
    const existing = this[key]
    if (existing) return existing
    const engine =
      key === 'bibtexEngine'
        ? new BibtexEngine(this.auxEngineOpts())
        : new MakeindexEngine(this.auxEngineOpts())
    // Own it during initialization so cancellation can terminate its worker.
    this[key] = engine
    try {
      ;(await this.operations.observe(engine.init())).resume()
      return engine
    } catch (error) {
      // Cancellation may already have retired it; never clear a newer instance.
      if (this[key] === engine) {
        this[key] = null
        engine.terminate()
      }
      throw error
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('WasmTexCompiler is not initialized. Call init() first.')
    }
  }
}
