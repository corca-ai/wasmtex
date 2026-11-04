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
import type { CompileResult, HeapCheckpointArm } from '../types'
import { resolveTexliveUrl } from './base-worker-engine'
import { LUATEX_KNOWN_404, LUATEX_PRELOAD } from './luatex-manifest'
import {
  BaseTexFmtEngine,
  type ChapterPreviewResult,
  chapterPreviewHook,
  createCompileWorker,
  firstChapterEntry,
  unicodeFormatUrl,
} from './tex-fmt-engine'
import { applyHeapCheckpoints, type WasmTexEngineOptions } from './wasmtex-engine'
import type { CompileWorkerResult } from './wasmtex-worker'

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
export function luatexPreviewHook(
  pageLimit: number,
  chapter?: { name: string; cap: number },
): string {
  const redirect =
    `\\directlua{luatexbase.add_to_callback("find_write_file",function(_,name) ` +
    `return "${LUATEX_PREVIEW_OUTPUT_DIR}/"..name:gsub("/","__") end,"wasmtex-preview")}`
  if (chapter)
    return redirect + chapterPreviewHook(chapter.name, '\\directlua{tex.finish()}', chapter.cap)
  return (
    `${redirect}\\directlua{wasmtexPreviewShipped=0}` +
    `\\AddToHook{shipout/after}{\\directlua{wasmtexPreviewShipped=wasmtexPreviewShipped+1 ` +
    `if wasmtexPreviewShipped>=${pageLimit} then tex.finish() end}}`
  )
}

// Stopping inside the document environment ends inside a group; that report
// belongs to the preview stop, not to the author's source.
const PREVIEW_STOP_LOG = /^\(\\end occurred (inside a group at level \d+|when .* incomplete)\)$/gm

export class WasmTexLuatexEngine extends BaseTexFmtEngine {
  private checkpointBudget: { maxCount: number; maxBytes: number } | null = null

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

  /** True once the worker reported the checkpoint build (see `luatexHeapCheckpoints`). */
  get supportsHeapCheckpoints(): boolean {
    return this.tex.supportsHeapCheckpoints
  }

  get supportsLineCheckpoints(): boolean {
    return this.tex.supportsLineCheckpoints
  }

  get supportsFileCheckpoints(): boolean {
    return this.tex.supportsFileCheckpoints
  }

  get supportsResumeRecorder(): boolean {
    return this.tex.supportsResumeRecorder
  }

  setCheckpointBudget(maxCount: number, maxBytes: number): void {
    this.checkpointBudget = { maxCount: Math.min(maxCount, 64), maxBytes }
  }

  /** Compile; on the checkpoint build, `checkpoints` asks the worker to keep a resumable
   *  state before reading each listed line (reported in `result.heapCheckpoints`). */
  async compile(options?: { checkpoints?: HeapCheckpointArm[] }): Promise<CompileResult> {
    const start = performance.now()
    // 0. Ensure the LuaLaTeX format is built and present in the work dir.
    const fmtLog = await this.ensureFormat()
    // 1. LuaTeX: main.tex -> main.pdf (single pass; PDF returned in "out").
    const checkpoints = options?.checkpoints?.length ? options.checkpoints : undefined
    const lua = await this.tex.run(
      'compilelatex',
      this.withBudget(checkpoints ? { checkpoints } : {}),
    )
    return this.finishCompile(lua, fmtLog, start)
  }

  /** Resume a compile from a checkpoint taken earlier: the worker restores that state,
   *  reads the rest of the project as the host last wrote it, and finishes the run like a
   *  normal compile. The caller guarantees the checkpoint is still valid. */
  async compileFromHeapCheckpoint(
    id: string,
    checkpoints?: HeapCheckpointArm[],
  ): Promise<CompileResult> {
    if (!this.supportsHeapCheckpoints) {
      throw new Error('heap checkpoints are not supported by this engine')
    }
    const start = performance.now()
    const lua = await this.tex.run(
      'compileheapcheckpoint',
      this.withBudget({ id, ...(checkpoints?.length ? { checkpoints } : {}) }),
    )
    return this.finishCompile(lua, '', start)
  }

  /** A disposable prefix of pages 1..`pageLimit` resumed from heap checkpoint `id`; its
   *  auxiliary files are put back by the worker. Null when this build cannot. */
  async compileHeapPreview(pageLimit: number, id: string): Promise<CompileResult | null> {
    if (!this.supportsHeapCheckpoints || !this.tex.supportsPagePreview) return null
    const start = performance.now()
    const lua = await this.tex.run('compilepagepreview', { pageLimit, id })
    return this.result(
      lua.success && !!lua.out,
      lua.out,
      lua.log.replace(PREVIEW_STOP_LOG, '').trim(),
      start,
      undefined,
      undefined,
      [lua.resolver],
    )
  }

  /** Free checkpoints in the worker (all when `ids` is omitted). */
  dropHeapCheckpoints(ids?: string[]): Promise<void> {
    return this.tex.dropHeapCheckpoints(ids)
  }

  private withBudget(fields: Record<string, unknown>): Record<string, unknown> {
    return this.checkpointBudget ? { ...fields, checkpointBudget: this.checkpointBudget } : fields
  }

  private finishCompile(lua: CompileWorkerResult, fmtLog: string, start: number): CompileResult {
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
    if (lua.message) applyHeapCheckpoints(result, lua.message)
    if (result.success) {
      this.recordFullPass(lua.inputFiles, lua.log, 'bytes')
      // After a successful compile that fetched new files, persist the worker's
      // cache to IndexedDB (non-blocking, best-effort) for instant return visits.
      this.maybePersist()
    }
    return result
  }

  /** Typeset only pages 1..`pageLimit` of the current main source, or only the
   *  `\\include`d `chapter`, as a separate job (see {@link runPreviewJob}); null means
   *  run {@link compile} instead. */
  async compilePagePreview(
    pageLimit: number,
    { chapter, cold = false }: { chapter?: string; cold?: boolean } = {},
  ): Promise<ChapterPreviewResult | null> {
    const start = chapter ? this.chapterStart(chapter, pageLimit) : 1
    if (start === null) return null
    this.tex.mkdir(LUATEX_PREVIEW_OUTPUT_DIR)
    const preview = await this.runPreviewJob(
      luatexPreviewHook(
        pageLimit,
        chapter ? { name: chapter, cap: pageLimit - start + 1 } : undefined,
      ),
      undefined,
      { cold },
    )
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
    const attributed = this.attributePreviewErrors(result, preview.main)
    // A failed run reports its failure; the host refuses the chapter and retries.
    if (!chapter || !result.success) return { ...attributed, firstPage: 1 }
    const entries = await Promise.all([
      this.tex.readFile(`${LUATEX_PREVIEW_OUTPUT_DIR}/${chapter.replaceAll('/', '__')}.aux`),
      this.tex.readFile(`${chapter}.aux`),
    ])
    const firstPage = this.placeChapter(chapter, start, lua.log, 'bytes', [
      firstChapterEntry(entries[0]),
      firstChapterEntry(entries[1]),
    ])
    return firstPage === null ? null : { ...attributed, firstPage }
  }

  async flushCache(): Promise<void> {
    this.tex.flushCache()
    this.clearInjectedFormat()
  }

  terminate(): void {
    this.tex.terminate()
  }
}
