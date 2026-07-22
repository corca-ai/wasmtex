/**
 * XeLaTeX engine: a two-worker orchestration.
 *
 * XeTeX emits XDV (extended DVI), not PDF, so producing a PDF takes two engines:
 *
 *   wasmtex-xetex   (compilelatex) :  main.tex  -> main.xdv
 *   wasmtex-dvipdfm (compilepdf)   :  main.xdv  -> main.pdf   (embeds fonts)
 *
 * {@link WasmTexXetexEngine} owns both workers and presents the standard
 * {@link CompileEngine} surface, so `WasmTexCompiler` drives it exactly like the
 * pdfTeX engine. The shared {@link BaseTexFmtEngine} handles file management,
 * `readFile`, and the build-format-once dance against the primary XeTeX worker;
 * this class adds the second dvipdfmx stage.
 *
 * The XeTeX and dvipdfmx workers are this project's own glue over the GPL engines
 * built from the pinned TeX Live source. Both speak the simple `settexliveurl` / `writefile` /
 * `compile*` protocol via {@link CompileWorkerDriver}.
 */
import type { CompileResult } from '../types'
import { buildDependencyGraph } from './dependency-graph'
import { BaseTexFmtEngine, createCompileWorker, unicodeFormatUrl } from './tex-fmt-engine'
import type { WasmTexEngineOptions } from './wasmtex-engine'
import type { CompileWorkerDriver } from './wasmtex-worker'
import { attachPlacements, parseXdv } from './xdv'

export class WasmTexXetexEngine extends BaseTexFmtEngine {
  private dvipdfm: CompileWorkerDriver

  constructor(options: WasmTexEngineOptions = {}) {
    const version = options.texliveVersion ?? '2025'
    // Preload a prebuilt wasmtex-xetex.fmt (if shipped) so the first compile
    // skips the per-session format build — the dominant cold-start cost. A
    // missing asset → ensureFormat() builds it (unchanged behavior). XeTeX ships
    // no warmup manifest yet (4th arg undefined), but it MUST honor persistentCache
    // (5th arg) so a `persistentCache: true` host rehydrates/persists like LuaTeX/pdfTeX.
    super(
      createCompileWorker('xetex', options),
      'wasmtex-xetex.fmt',
      unicodeFormatUrl('xetex', options),
      undefined,
      options.persistentCache ? { version } : undefined,
    )
    this.dvipdfm = createCompileWorker('dvipdfm', options)
  }

  async init(): Promise<void> {
    this.dvipdfm.onFileDownload = (f) => {
      // Count dvipdfmx font fetches toward the persist watermark; otherwise a compile whose
      // only new downloads came from dvipdfmx would skip persisting entirely.
      this.bumpDownloadCount()
      this.onFileDownload?.(f)
    }
    // Both artifacts must load; if either is absent the worker errors and init
    // rejects, which the caller turns into an actionable "engine unavailable".
    await Promise.all([this.initTex(), this.dvipdfm.init()])
    // Rehydrate dvipdfmx from the durable set AFTER its init (so its preload queue is live),
    // so a return visit serves the embedded fonts from cache instead of re-fetching the CDN.
    this.rehydrateExtraDriver(this.dvipdfm)
  }

  /** dvipdfmx fetches+embeds fonts the primary XeTeX worker never caches — persist them too. */
  protected override extraCacheDrivers(): CompileWorkerDriver[] {
    return [this.dvipdfm]
  }

  /** Project files must exist in BOTH workers: XeTeX only records an image
   *  reference in the XDV; dvipdfmx re-opens the actual file (`\includegraphics`,
   *  `pdfpages` imports) from its own FS when embedding. */
  override async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    await Promise.all([super.writeFile(path, content), this.dvipdfm.writeFile(path, content)])
  }

  override async mkdir(path: string): Promise<void> {
    await super.mkdir(path)
    this.dvipdfm.mkdir(path)
  }

  async compile(): Promise<CompileResult> {
    const start = performance.now()
    // 0. Ensure the XeLaTeX format is built and present in the work dir.
    const fmtLog = await this.ensureFormat()
    // 1. XeTeX: main.tex -> main.xdv (returned in the "out" field).
    const xelatex = await this.tex.run('compilelatex')
    if (!xelatex.success || !xelatex.out) {
      return this.result(false, null, `${fmtLog}\n${xelatex.log}`.trim(), start)
    }
    // 2. dvipdfmx: main.xdv -> main.pdf (fetches + embeds fonts from the CDN).
    const xdvName = `${this.mainBase}.xdv`
    await this.dvipdfm.writeFile(xdvName, xelatex.out)
    this.dvipdfm.setMainFile(xdvName)
    const dvi = await this.dvipdfm.run('compilepdf')
    const log = `${xelatex.log}\n${dvi.log}`
    const result = this.result(dvi.success && !!dvi.out, dvi.out, log, start)
    // Parse the XDV once (xelatex.out is the XeTeX output, before dvipdfmx) — headless,
    // no engine patch — and use it for both products: page/box geometry telemetry
    // (#54 slice 3) and the .notdef overlay positions (#89 L2b).
    const { pages, placements, reliable } = parseXdv(xelatex.out)
    if (result.telemetry) result.telemetry.geometry = { pages, reliable }
    if (result.glyphCoverage) attachPlacements(result.glyphCoverage.gaps, placements, reliable, log)
    // Enrich the dependency graph (#54 slice 4): the XeLaTeX path has no `.fls`, so
    // fill it from the XDV fonts actually used + the main source's declared deps.
    if (result.telemetry) {
      const fonts = [...new Set(pages.flatMap((p) => p.textRuns.map((r) => r.font)))].filter(
        (f): f is string => !!f,
      )
      result.telemetry.dependencies = buildDependencyGraph(log, {
        fonts,
        source: this.mainSource(),
      })
    }
    // After a successful compile that fetched new files, persist the worker's
    // cache to IndexedDB (non-blocking, best-effort) for instant return visits.
    if (result.success) this.maybePersist()
    return result
  }

  async flushCache(): Promise<void> {
    this.tex.flushCache()
    this.dvipdfm.flushCache()
    this.clearInjectedFormat()
  }

  terminate(): void {
    this.tex.terminate()
    this.dvipdfm.terminate()
  }
}
