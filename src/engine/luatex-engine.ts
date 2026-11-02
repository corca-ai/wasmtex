/**
 * LuaLaTeX engine: a single-worker orchestration.
 *
 * Unlike XeTeX (which emits XDV and needs a second dvipdfmx stage), LuaTeX writes
 * PDF directly, so one worker is the whole pipeline:
 *
 *   wasmtex-luatex (compilelatex) :  main.tex  -> main.pdf
 *
 * {@link WasmTexLuatexEngine} therefore is the shared {@link BaseTexFmtEngine}
 * (prebuilt-format preload + built-in warmup) plus a `compile()` that ensures the
 * format and runs a single pass. It loads the authored
 * `wasmtex-luatex.worker.js` controller, which in turn loads the generated
 * `wasmtex-luatex.js` core and its `.wasm` binary.
 */
import type { CompileResult } from '../types'
import { resolveTexliveUrl } from './base-worker-engine'
import { LUATEX_KNOWN_404, LUATEX_PRELOAD } from './luatex-manifest'
import { BaseTexFmtEngine, createCompileWorker, unicodeFormatUrl } from './tex-fmt-engine'
import type { WasmTexEngineOptions } from './wasmtex-engine'

/** Suffix of the separate job a page preview runs as. */
export const LUATEX_PREVIEW_JOB_SUFFIX = '-wasmtex-preview'
/** Directory receiving every `\\openout` file a preview writes. */
export const LUATEX_PREVIEW_OUTPUT_DIR = 'wasmtex-preview-out'

/**
 * Stop after `pageLimit` shipped pages. LuaTeX's `tex.finish()` runs the normal
 * final cleanup, closes files and finalizes the PDF, so the prefix is a complete
 * standalone document. Every `\\openout` stream is redirected into
 * {@link LUATEX_PREVIEW_OUTPUT_DIR}, so a stopped prefix cannot truncate a file
 * the next full pass reads. The hook precedes the author's first line on that
 * same line, so diagnostics keep their source line numbers.
 */
export function luatexPreviewHook(pageLimit: number): string {
  return (
    `\\directlua{wasmtexPreviewShipped=0 ` +
    `luatexbase.add_to_callback("find_write_file",function(_,name) ` +
    `return "${LUATEX_PREVIEW_OUTPUT_DIR}/"..name:gsub("/","__") end,"wasmtex-preview")}` +
    `\\AddToHook{shipout/after}{\\directlua{wasmtexPreviewShipped=wasmtexPreviewShipped+1 ` +
    `if wasmtexPreviewShipped>=${pageLimit} then tex.finish() end}}`
  )
}

/** Job-named inputs a full pass read, e.g. `./main.aux` -> `aux`. */
export function luatexJobInputExtensions(
  inputFiles: readonly string[] | undefined,
  job: string,
): string[] {
  const prefix = `./${job}.`
  const extensions = new Set<string>()
  for (const file of inputFiles ?? []) {
    if (!file.startsWith(prefix)) continue
    const extension = file.slice(prefix.length)
    if (extension && extension !== 'tex' && !extension.includes('/')) extensions.add(extension)
  }
  return [...extensions]
}

// Stopping inside the document environment ends inside a group; that report
// belongs to the preview stop, not to the author's source.
const PREVIEW_STOP_LOG = /^\(\\end occurred (inside a group at level \d+|when .* incomplete)\)$/gm

export class WasmTexLuatexEngine extends BaseTexFmtEngine {
  /** Extensions of job-named inputs (`.aux`, `.toc`, `.bbl`, …) the last full pass read. */
  private jobInputs: string[] = []

  constructor(options: WasmTexEngineOptions = {}) {
    const version = options.texliveVersion ?? '2025'
    super(
      createCompileWorker('luatex', options),
      'wasmtex-luatex.fmt',
      unicodeFormatUrl('luatex', options),
      {
        texliveUrl: resolveTexliveUrl(options.texliveUrl ?? null, version),
        preload: LUATEX_PRELOAD,
        notFound: LUATEX_KNOWN_404,
      },
      options.persistentCache
        ? { version, texliveUrl: resolveTexliveUrl(options.texliveUrl ?? null, version) }
        : undefined,
      options.resolverProfile ?? {
        id: `texlive-${version}`,
        texliveYear: version,
        mirrorRevision: null,
      },
      options.warmupCache,
    )
  }

  async init(): Promise<void> {
    await this.initTex()
  }

  async compile(): Promise<CompileResult> {
    const start = performance.now()
    // 0. Ensure the LuaLaTeX format is built and present in the work dir.
    const fmtLog = await this.ensureFormat()
    // 1. LuaTeX: main.tex -> main.pdf (single pass; PDF returned in "out").
    const lua = await this.tex.run('compilelatex')
    const log = `${fmtLog}\n${lua.log}`.trim()
    const result = this.result(
      lua.success && !!lua.out,
      lua.out,
      log,
      start,
      lua.inputFiles,
      lua.inputFilesComplete,
      [lua.resolver],
    )
    this.jobInputs = luatexJobInputExtensions(lua.inputFiles, this.jobName())
    // After a successful compile that fetched new files, persist the worker's
    // cache to IndexedDB (non-blocking, best-effort) for instant return visits.
    if (result.success) this.maybePersist()
    return result
  }

  /**
   * Typeset only pages 1..`pageLimit` of the current main source. The prefix runs
   * as a separate job that starts from copies of the last full pass's job-named
   * inputs, so its references match that pass while the full pass's own
   * auxiliary files stay untouched for the next canonical compile. Null means no
   * main source is known: run {@link compile} instead.
   */
  async compilePagePreview(pageLimit: number): Promise<CompileResult | null> {
    const source = this.mainSource()
    if (source === undefined) return null
    const start = performance.now()
    const fmtLog = await this.ensureFormat()
    const job = this.jobName()
    const previewJob = `${job}${LUATEX_PREVIEW_JOB_SUFFIX}`
    for (const extension of this.jobInputs) {
      const content = await this.tex.readFile(`${job}.${extension}`)
      if (content !== null) await this.tex.writeFile(`${previewJob}.${extension}`, content)
    }
    const directory = this.mainBase.slice(0, this.mainBase.length - job.length)
    const previewMain = `${directory}${previewJob}.tex`
    this.tex.mkdir(LUATEX_PREVIEW_OUTPUT_DIR)
    await this.tex.writeFile(previewMain, luatexPreviewHook(pageLimit) + source)
    this.tex.setMainFile(previewMain)
    let lua: Awaited<ReturnType<typeof this.tex.run>>
    try {
      lua = await this.tex.run('compilelatex')
    } finally {
      this.tex.setMainFile(`${this.mainBase}.tex`)
    }
    const log = `${fmtLog}\n${lua.log.replace(PREVIEW_STOP_LOG, '')}`.trim()
    return this.result(lua.success && !!lua.out, lua.out, log, start, undefined, undefined, [
      lua.resolver,
    ])
  }

  async flushCache(): Promise<void> {
    this.tex.flushCache()
    this.clearInjectedFormat()
    this.jobInputs = []
  }

  terminate(): void {
    this.tex.terminate()
  }

  private jobName(): string {
    return this.mainBase.slice(this.mainBase.lastIndexOf('/') + 1)
  }
}
