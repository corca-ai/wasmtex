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

// Stopping inside the document environment ends inside a group; that report
// belongs to the preview stop, not to the author's source.
const PREVIEW_STOP_LOG = /^\(\\end occurred (inside a group at level \d+|when .* incomplete)\)$/gm

export class WasmTexLuatexEngine extends BaseTexFmtEngine {
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
    if (result.success) {
      this.recordFullPass(lua.inputFiles)
      // After a successful compile that fetched new files, persist the worker's
      // cache to IndexedDB (non-blocking, best-effort) for instant return visits.
      this.maybePersist()
    }
    return result
  }

  /** Typeset only pages 1..`pageLimit` of the current main source as a separate job
   *  (see {@link runPreviewJob}); null means run {@link compile} instead. */
  async compilePagePreview(pageLimit: number): Promise<CompileResult | null> {
    this.tex.mkdir(LUATEX_PREVIEW_OUTPUT_DIR)
    const preview = await this.runPreviewJob(luatexPreviewHook(pageLimit))
    if (!preview) return null
    const lua = preview.run
    const log = `${preview.fmtLog}\n${lua.log.replace(PREVIEW_STOP_LOG, '')}`.trim()
    const result = this.result(
      lua.success && !!lua.out,
      lua.out,
      log,
      preview.start,
      undefined,
      undefined,
      [lua.resolver],
    )
    return this.attributePreviewErrors(result, preview.main)
  }

  async flushCache(): Promise<void> {
    this.tex.flushCache()
    this.clearInjectedFormat()
  }

  terminate(): void {
    this.tex.terminate()
  }
}
