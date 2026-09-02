/**
 * TikZ/pgfplots figure externalization on top of the upstream `external` library (#82).
 *
 * Nothing here patches the engine or reimplements TikZ. The document's own
 * `\tikzexternalize` is honoured exactly the way `pdflatex -shell-escape` would honour it
 * on a desktop, except that the per-figure jobs run on a pool of sibling compilers instead
 * of being spawned through `system()` (which the WASM engine has no shell for):
 *
 * 1. The **main job** runs in `mode=list and make`. The library writes `<realjob>.figlist`
 *    (every figure name), includes the figures whose PDF already exists, and keeps an
 *    MD5 of each picture's source in `<figure>.md5` (its own up-to-date check).
 * 2. For every figure whose MD5 changed (or that has no PDF yet), a **figure job** compiles
 *    the same document with the same preamble and the library's grab mode selecting just
 *    that picture — the library's `optimize` path skips every other picture. Because the
 *    preamble is identical across figures, a sibling compiler reuses its preamble snapshot
 *    for all of them, so a figure job costs about the picture alone.
 * 3. The figure PDFs are written into the main engine and the main job runs once more.
 *
 * A text-only edit therefore recompiles no picture at all, and a single-picture edit
 * recompiles just that one. Measured on a 15-figure document: 1108 ms → 137 ms warm.
 */

export type TikzExternalizationMode = 'document' | 'auto' | 'off'

export interface TikzExternalizationOptions {
  /** `'document'` (default): externalize only when the document itself calls
   *  `\tikzexternalize` (such documents otherwise fail every figure with a shell-escape
   *  error and fall back to inline typesetting). `'auto'`: additionally externalize
   *  documents that load TikZ/pgfplots but never call `\tikzexternalize`, by activating
   *  the library at the end of the preamble. `'off'`: never. */
  mode?: TikzExternalizationMode
  /** Maximum number of sibling compilers rendering figures concurrently. Each one is a
   *  full engine worker with its own preamble snapshot. Defaults to
   *  `min(3, hardwareConcurrency - 1)`, at least 1. */
  workers?: number
}

/** How externalization is switched on for a given main source. */
export type TikzExternalizationKind = 'document' | 'inject'

/** `\jobname` the figure jobs run under; must differ from the real job's name so the
 *  library enters figure (grab) mode. Never a file the project could own. */
export const FIGURE_JOBNAME = 'wasmtex-figure'

/** Jobname of the pdfLaTeX preamble snapshot: `\tikzexternalize` executed inside the
 *  snapshot records it as the real job, so figure names derive from it. */
export const PREAMBLE_SNAPSHOT_JOBNAME = '_preamble'

const BEGIN_DOCUMENT = '\\begin{document}'

/** Strip `%` comments (respecting `\%`) so detection ignores commented-out commands. */
function stripComments(source: string): string {
  return source.replace(/(^|[^\\])(\\\\)*%.*$/gm, (_m, pre, esc) => `${pre}${esc ?? ''}`)
}

/** Offset of the first uncommented `\begin{document}`, or -1. */
export function findBeginDocument(source: string): number {
  const re = /\\begin\{document\}/g
  for (const m of source.matchAll(re)) {
    const lineStart = source.lastIndexOf('\n', m.index) + 1
    const before = source.slice(lineStart, m.index)
    if (!/(^|[^\\])(\\\\)*%/.test(before)) return m.index
  }
  return -1
}

/** True when the preamble calls `\tikzexternalize` outside a comment. */
export function documentExternalizes(source: string): boolean {
  const at = findBeginDocument(source)
  const preamble = stripComments(at >= 0 ? source.slice(0, at) : source)
  return /\\tikzexternalize\b/.test(preamble)
}

/** True when the preamble loads tikz or pgfplots (directly). */
export function loadsTikz(source: string): boolean {
  const at = findBeginDocument(source)
  const preamble = stripComments(at >= 0 ? source.slice(0, at) : source)
  return /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:tikz|pgfplots)\b[^}]*\}/.test(
    preamble,
  )
}

/** Decide whether (and how) a main source gets externalized under `mode`. */
export function detectTikzExternalization(
  source: string,
  mode: TikzExternalizationMode = 'document',
): TikzExternalizationKind | null {
  if (mode === 'off') return null
  if (findBeginDocument(source) < 0) return null
  if (documentExternalizes(source)) return 'document'
  if (mode === 'auto' && loadsTikz(source)) return 'inject'
  return null
}

/** Main-job source: the document as written, with the library switched to
 *  `list and make` (and, for `'inject'`, activated) on the `\begin{document}` line so
 *  no line number moves. */
export function mainJobSource(source: string, kind: TikzExternalizationKind): string {
  const at = findBeginDocument(source)
  if (at < 0) return source
  const head = source.slice(0, at)
  const tail = source.slice(at + BEGIN_DOCUMENT.length)
  if (kind === 'inject') {
    return `${head}\\usetikzlibrary{external}\\tikzexternalize[mode=list and make]${BEGIN_DOCUMENT}${tail}`
  }
  return `${head}${BEGIN_DOCUMENT}\\tikzset{external/mode=list and make}${tail}`
}

/** Figure-job source for `figure`: the main-job source with the real job name pinned
 *  (so figure names match), `\jobname` redefined so the library enters grab mode
 *  (decided at `\tikzexternalize` time, inside the shared preamble), and the picture to
 *  grab selected right after `\begin{document}` (outside the preamble, so the sibling
 *  compiler's preamble snapshot is reused across figures). No line number moves. */
export function figureJobSource(
  source: string,
  kind: TikzExternalizationKind,
  realJob: string,
  figure: string,
): string {
  const main = mainJobSource(source, kind)
  const at = findBeginDocument(main)
  if (at < 0) return main
  const head = main.slice(0, at)
  const tail = main.slice(at + BEGIN_DOCUMENT.length)
  return (
    `\\def\\tikzexternalrealjob{${realJob}}\\def\\jobname{${FIGURE_JOBNAME}}` +
    `${head}${BEGIN_DOCUMENT}\\def\\pgfactualjobname{${figure}}${tail}`
  )
}

/** Figure names listed in a `.figlist` (one per line, in document order, deduplicated). */
export function parseFigureList(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of text.split('\n')) {
    const name = raw.trim()
    if (!name || seen.has(name) || /[\s\\{}]/.test(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/** The picture hash recorded in a `<figure>.md5` file (`\tikzexternallastkey{…}%`). */
export function parseFigureMd5(text: string | null | undefined): string | null {
  if (!text) return null
  const m = /\\tikzexternallastkey\s*\{([^}]*)\}/.exec(text)
  return m ? m[1]!.trim() || null : null
}

/** Default figure-worker count: leave a core for the main engine, cap at three. */
export function defaultFigureWorkers(hardwareConcurrency: number | undefined): number {
  const cores = Math.max(2, hardwareConcurrency ?? 2)
  return Math.max(1, Math.min(3, cores - 1))
}

/** A figure rendered by a figure job, keyed by the library's own MD5. */
export interface RenderedFigure {
  md5: string | null
  pdf: Uint8Array
  /** `<figure>.dpth` (baseline depth + smuggled aux data) when the library wrote one. */
  dpth: string | null
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

  constructor(
    private readonly factory: () => FigureCompiler,
    private readonly size: number,
    private readonly mainFile: string,
  ) {}

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
        const figure: RenderedFigure = { md5: job.md5, pdf: result.pdf, dpth }
        rendered.set(job.name, figure)
        this.cache.set(job.name, figure)
      }
    }
    await Promise.all(this.workers.slice(0, count).map(run))
    return { rendered, failures, elapsedMs: performance.now() - t0 }
  }

  dispose(): void {
    for (const worker of this.workers) worker.compiler.dispose()
    this.workers.length = 0
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
