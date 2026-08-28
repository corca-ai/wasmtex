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
      options.persistentCache ? { version } : undefined,
      options.resolverProfile ?? {
        id: `texlive-${version}`,
        texliveYear: version,
        mirrorRevision: null,
      },
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
    // After a successful compile that fetched new files, persist the worker's
    // cache to IndexedDB (non-blocking, best-effort) for instant return visits.
    if (result.success) this.maybePersist()
    return result
  }

  async flushCache(): Promise<void> {
    this.tex.flushCache()
    this.clearInjectedFormat()
  }

  terminate(): void {
    this.tex.terminate()
  }
}
