/**
 * Incremental compilation via mid-document checkpoints (#55).
 *
 * Wraps a {@link WasmTexPdftexEngine}. On an edit it finds the latest page-break boundary
 * before the first changed character, boots the engine from a checkpoint cached at that
 * boundary (building it once if needed), typesets only the tail, and splices the cached
 * head PDF with the fresh tail PDF. Falls back to a full compile when there's no usable
 * boundary, the preamble changed, pdf-lib is unavailable, or anything errors.
 *
 * Multi-file aware: `\include`d files are page boundaries (\include forces \clearpage),
 * so editing one chapter reuses the cached checkpoint just before it and re-typesets
 * only from there. A checkpoint's cache key folds in the content of the files its head
 * includes, so changing an early chapter invalidates exactly the checkpoints after it.
 *
 * Correctness: a checkpoint bakes in the cross-reference state from the last FULL
 * compile. An incremental result is exact as long as labels/numbering didn't shift;
 * when the edit touches labels or sectioning, `final` is false and the host should
 * follow up with a full compile to reconcile (LaTeX's usual two-pass model).
 */

import { mergeTailSynctex } from '../synctex/synctex-merge'
import { type SynctexData, SynctexParser } from '../synctex/synctex-parser'
import type { CompileResult } from '../types'
import {
  chooseBoundary,
  findPageBreaks,
  firstDifference,
  hashString,
  includePositions,
  splitAtBoundary,
} from './checkpoint-boundaries'
import { pdfPageCount, splicePdfs } from './pdf-splice'
import { extractPreamble } from './preamble-utils'
import type { WasmTexPdftexEngine } from './wasmtex-engine'

export interface IncrementalResult {
  pdf: Uint8Array | null
  log: string
  success: boolean
  /** True when served from a checkpoint (fast path) rather than a full compile. */
  incremental: boolean
  /** True when a new checkpoint had to be built this call (one-time cost). */
  checkpointBuilt: boolean
  /** False when the result may have stale cross-references and a full reconcile pass
   *  is advisable (the edit touched labels / sectioning). */
  final: boolean
  /** Why the full path was taken, when `incremental` is false. */
  reason?: string
  /** The tail SyncTeX spliced onto the last full compile's head — exact for the spliced PDF
   *  (#99 P2). Null when the splice couldn't run safely (head changed since the last full, or no
   *  last-full SyncTeX was recorded via {@link noteFull}); the caller then reuses the last full
   *  compile's SyncTeX and/or reconciles. Multi-file `\include` tails ARE spliced. Set only on the
   *  `incremental` path. */
  synctexData?: SynctexData | null
}

interface Checkpoint {
  /** Cache key (head text + the content hashes of the files its head includes). */
  key: string
  fmt: Uint8Array
  headPdf: Uint8Array
}

export interface IncrementalOptions {
  /** Max checkpoints kept (LRU). Default 4. */
  maxCheckpoints?: number
  /** Don't checkpoint when the head would be smaller than this (bytes). Default 2000. */
  minHeadBytes?: number
  /** Main file name written for full compiles. Default 'main.tex'. */
  mainFile?: string
}

/** Commands whose addition/removal in the edited region can shift numbering or labels,
 *  so a full reconcile pass is advisable. */
const LABEL_SENSITIVE_RE =
  /\\(?:label|ref|pageref|eqref|autoref|cref|Cref|nameref|cite|bibitem|caption|footnote|appendix|(?:set|step|add(?:to)?)counter|newtheorem|(?:sub)*section|chapter|part|item|index|makeindex|printindex)(?![A-Za-z@])|\\begin\{(?:enumerate|equation|figure|table|align)/

/** Commands that typeset content from a helper file the checkpoint compile does NOT have — the
 *  head/tail run in isolation with only `main.aux` copied, so `.toc`/`.lof`/`.lot`/`.bbl`/`.ind`
 *  are absent and these render blank. A document using any of them must take the full path, not a
 *  checkpoint fast path that would show an empty table of contents / bibliography / index. */
const CHECKPOINT_UNREPRODUCIBLE_RE =
  /\\(?:tableofcontents|listof[a-z]+|bibliography(?![A-Za-z])|printbibliography|printindex|printglossary|printglossaries|printnomenclature)/i

/** A project file map: path → text content (includes the main file). */
export type FileSet = Map<string, string>

/** Length of the longest common suffix of `a` and `b`, not crossing `start` in either. */
function commonSuffixLen(a: string, b: string, start: number): number {
  let i = a.length - 1
  let j = b.length - 1
  let n = 0
  while (i >= start && j >= start && a.charCodeAt(i) === b.charCodeAt(j)) {
    i--
    j--
    n++
  }
  return n
}

/** Count newlines in `s` — the head's line count, which is the offset from a tail-relative
 *  source line (the tail is compiled in isolation, its first line is 1) to a document line. */
function countNewlines(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
  return n
}

/** A LaTeX command-name character (the letters of `\ref`, `\subsection`, …). */
function isCmdNameChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '*'
}

/** Did the edit add/remove label- or numbering-affecting markup between `prev` and
 *  `next`? Examines the changed span (between the common prefix and suffix), widened just
 *  enough to reconstitute a `\command` token the edit boundary cut through — so a command
 *  completed/split at the boundary (`\r` → `\ref{x}`, `\section` → `\subsection`) is still
 *  seen, while an unchanged label merely *near* the edit does not force a needless full
 *  reconcile. */
export function editTouchesLabels(prev: string, next: string): boolean {
  const start = firstDifference(prev, next)
  if (start === prev.length && start === next.length) return false // identical
  const shared = commonSuffixLen(prev, next, start)
  // Expand left into the common prefix over a partial command token (its name chars plus
  // the leading backslash), so a command whose head sits in the unchanged prefix is seen.
  let lo = start
  while (lo > 0 && isCmdNameChar(prev[lo - 1]!)) lo--
  if (lo > 0 && prev[lo - 1] === '\\') lo--
  // Expand right into the common suffix over the rest of a command name the boundary cut.
  let extra = 0
  const tail = next.length - shared
  while (tail + extra < next.length && isCmdNameChar(next[tail + extra]!)) extra++
  const changedNew = next.slice(lo, tail + extra)
  const changedOld = prev.slice(lo, prev.length - shared + extra)
  return LABEL_SENSITIVE_RE.test(changedNew) || LABEL_SENSITIVE_RE.test(changedOld)
}

export class IncrementalCompiler {
  private readonly engine: WasmTexPdftexEngine
  private readonly maxCheckpoints: number
  private readonly minHeadBytes: number
  private mainFile: string
  /** Last fully-compiled project files (path → content), including the main file. */
  private last: FileSet | null = null
  /** Main source at the last FULL compile (distinct from `last`, which advances on fast paints
   *  too). The head-unchanged test for the SyncTeX merge diffs against this. (#99 P2) */
  private lastFullSource: string | null = null
  /** Project files at the last FULL compile — the head-unchanged test also compares the chapters
   *  the head `\include`s against these (a chapter changed since the last full but not since the
   *  last paint would leave the merge base stale). (#99 P2 multi-file) */
  private lastFullFiles: FileSet | null = null
  /** Last full compile's SyncTeX — the head merge-base. Kept as raw bytes and parsed lazily
   *  (once per full compile, reused across the fast paints that follow) into `lastFullSynctex`. */
  private lastFullSynctexBytes: Uint8Array | null = null
  private lastFullSynctex: SynctexData | null = null
  private readonly synctexParser = new SynctexParser()
  private readonly checkpoints = new Map<string, Checkpoint>()
  private readonly lru: string[] = []

  constructor(engine: WasmTexPdftexEngine, opts: IncrementalOptions = {}) {
    this.engine = engine
    this.maxCheckpoints = opts.maxCheckpoints ?? 4
    this.minHeadBytes = opts.minHeadBytes ?? 2000
    this.mainFile = opts.mainFile ?? 'main.tex'
  }

  /** Forget all incremental state (call when the document/engine is swapped). */
  reset(): void {
    this.last = null
    this.lastFullSource = null
    this.lastFullFiles = null
    this.lastFullSynctexBytes = null
    this.lastFullSynctex = null
    this.checkpoints.clear()
    this.lru.length = 0
  }

  /** Re-point the compiler at a new main file (and reset state). Without this the old
   *  main-file name stays wired into snapshot()/editOffset()/changeTouchesLabels(),
   *  corrupting the diff baseline after the host switches the active main file. */
  setMainFile(path: string): void {
    this.mainFile = path
    this.reset()
  }

  /** Standalone convenience: fast path if possible, else a raw full compile. Hosts
   *  that own a richer compile pipeline (bibtex/rerun) should instead call
   *  {@link tryIncremental} and {@link noteFull}. */
  async compile(source: string, files: FileSet = new Map()): Promise<IncrementalResult> {
    // Standalone API: ensure the engine FS has every project file (incl. chapters)
    // before we read from it (checkpoint build) or run a full compile. (The headless
    // compiler syncs files itself and calls tryIncremental/noteFull directly.)
    await this.syncProjectFiles(source, files)
    const incr = await this.tryIncremental(source, files)
    if (incr) return incr
    return this.full(source, files)
  }

  private async syncProjectFiles(source: string, files: FileSet): Promise<void> {
    for (const [path, content] of files) {
      if (path !== this.mainFile) await this.engine.writeFile(path, content)
    }
    await this.engine.writeFile(this.mainFile, source)
  }

  /**
   * Record that the host performed a full compile (updating `main.aux`), so the next edit diffs
   * against it. Drops cached checkpoints when the preamble changed. Pass the full compile's raw
   * SyncTeX (`CompileResult.synctex`) so the next fast paint can splice its tail onto this head
   * and return exact {@link IncrementalResult.synctexData} (#99 P2) — omit it to skip splicing.
   */
  noteFull(source: string, files: FileSet = new Map(), synctex: Uint8Array | null = null): void {
    const prevMain = this.last?.get(this.mainFile)
    if (
      prevMain != null &&
      extractPreamble(prevMain)?.preamble !== extractPreamble(source)?.preamble
    ) {
      this.checkpoints.clear()
      this.lru.length = 0
    }
    this.last = this.snapshot(source, files)
    this.lastFullSource = source
    this.lastFullFiles = this.snapshot(source, files)
    this.lastFullSynctexBytes = synctex
    this.lastFullSynctex = null // parsed lazily on the first fast paint that needs it
  }

  /** The last full compile's parsed SyncTeX (the head merge-base), parsed once and cached. */
  private async ensureLastFullSynctex(): Promise<SynctexData | null> {
    if (this.lastFullSynctex) return this.lastFullSynctex
    if (!this.lastFullSynctexBytes) return null
    this.lastFullSynctex = await this.synctexParser.parse(this.lastFullSynctexBytes)
    return this.lastFullSynctex
  }

  /** Cheap pre-flight for a servable tail edit: the head/tail split at the boundary before
   *  the edit, or null when a full compile is required (no baseline, preamble changed, no
   *  page break before the edit, or too-small head). No compile — pure string work. Shared
   *  by {@link tryIncremental} and {@link canFastServe}. Head size measures EFFECTIVE content:
   *  with \include the main-source prefix is tiny but the included chapters are the real head,
   *  so their bytes count too. */
  private planFast(
    source: string,
    files: FileSet,
  ): { prevMain: string; headText: string; tailText: string } | null {
    const prevMain = this.last?.get(this.mainFile)
    if (prevMain == null) return null // first compile must be full (seeds main.aux)
    if (extractPreamble(prevMain)?.preamble !== extractPreamble(source)?.preamble) return null
    // The checkpoint compiles head/tail in isolation without `.toc`/`.bbl`/`.lof`/`.ind`, so a
    // ToC / bibliography / list-of / index would render blank — take the full path instead.
    if (CHECKPOINT_UNREPRODUCIBLE_RE.test(source)) return null
    const boundary = chooseBoundary(
      findPageBreaks(source),
      this.editOffset(prevMain, source, files),
    )
    if (boundary === null) return null
    const { headText, tailText } = splitAtBoundary(source, boundary)
    if (this.headSize(headText, files) < this.minHeadBytes) return null
    return { prevMain, headText, tailText }
  }

  /** Attempt the checkpoint fast path; return null to signal "fall back to full". */
  async tryIncremental(
    source: string,
    files: FileSet = new Map(),
  ): Promise<IncrementalResult | null> {
    const plan = this.planFast(source, files)
    if (plan === null) return null
    try {
      const { checkpoint, built } = await this.ensureCheckpoint(plan.headText, files)
      const tail = await this.engine.compileFromCheckpoint(checkpoint.fmt, plan.tailText)
      if (!tail.pdf || (tail.status !== 0 && tail.status !== 1)) return null
      const pdf = await splicePdfs([checkpoint.headPdf, tail.pdf])
      const final = !this.changeTouchesLabels(plan.prevMain, source, files)
      const synctexData = await this.spliceTailSynctex(
        checkpoint,
        plan.headText,
        tail.synctex,
        files,
      )
      this.last = this.snapshot(source, files)
      return {
        pdf,
        log: tail.log,
        success: true,
        incremental: true,
        checkpointBuilt: built,
        final,
        synctexData,
      }
    } catch {
      return null // pdf-lib missing, build/splice error → full compile
    }
  }

  /** Splice the tail's SyncTeX onto the last full compile's head → exact SyncTeX for the spliced
   *  PDF (#99 P2), or null when it can't run safely. Safe only when the ENTIRE head is unchanged
   *  since the last full compile — the main-source prefix AND every file it `\include`s — because
   *  a head file changed since the last full but not since the last paint renders fresh in the head
   *  PDF while the merge base still describes the old one. (`this.last` advances on fast paints, so
   *  the diff can't catch that; we compare against the last FULL snapshot.) */
  private async spliceTailSynctex(
    checkpoint: Checkpoint,
    headText: string,
    tailSynctex: Uint8Array | null,
    files: FileSet,
  ): Promise<SynctexData | null> {
    if (!tailSynctex || this.lastFullSource == null) return null
    if (this.lastFullSource.slice(0, headText.length) !== headText) return null
    // Every chapter the head bakes in must be byte-identical to the last full compile.
    const prevFiles = this.lastFullFiles ?? new Map<string, string>()
    for (const name of includePositions(headText).keys()) {
      if (this.includedContent(name, files) !== this.includedContent(name, prevFiles)) return null
    }
    const head = await this.ensureLastFullSynctex()
    if (!head) return null
    const tail = await this.synctexParser.parse(tailSynctex)
    return mergeTailSynctex({
      head,
      tail,
      headPageCount: await pdfPageCount(checkpoint.headPdf),
      tailLineOffset: countNewlines(headText),
      mainFile: this.mainFile,
      tailFile: 'tail.tex',
    })
  }

  /** True iff a fast, `final` incremental paint is servable for this edit — the cheap
   *  pre-flight ({@link planFast}) succeeds AND the change touches no labels/numbering. Lets
   *  an interactive host skip the tail compile entirely for edits that must go full (preamble,
   *  pre-first-page-break, or label/citation edits), so those never pay a wasted tail compile
   *  on the way to the full one. (#99) */
  canFastServe(source: string, files: FileSet = new Map()): boolean {
    const plan = this.planFast(source, files)
    return plan !== null && !this.changeTouchesLabels(plan.prevMain, source, files)
  }

  /**
   * Speculatively build (and cache) the checkpoint for the boundary before `editOffset`
   * (default: end of document) so a subsequent tail edit there is served from cache
   * instead of paying the ~one-full-compile build cost on the first edit (#99, option A).
   *
   * Returns `true` iff it built a new checkpoint; `false` when there's no baseline yet
   * (a full compile must have seeded `main.aux` first), the preamble differs from the
   * baseline, no page-break boundary qualifies, the head is too small, or the checkpoint
   * is already cached (already-warm → nothing to do).
   *
   * The caller MUST ensure the engine is idle: `buildCheckpoint` drives the worker, and
   * unlike `compile()` it does not flip the engine's ready status, so overlapping it with
   * a compile is the caller's responsibility to serialize.
   */
  async prebuild(
    source: string,
    files: FileSet = new Map(),
    editOffset: number = source.length,
  ): Promise<boolean> {
    const prevMain = this.last?.get(this.mainFile)
    if (prevMain == null) return false // no baseline yet → first compile must be full
    if (extractPreamble(prevMain)?.preamble !== extractPreamble(source)?.preamble) return false
    if (CHECKPOINT_UNREPRODUCIBLE_RE.test(source)) return false // full-path doc → no fast path to warm
    const boundary = chooseBoundary(findPageBreaks(source), editOffset)
    if (boundary === null) return false
    const { headText } = splitAtBoundary(source, boundary)
    if (this.headSize(headText, files) < this.minHeadBytes) return false
    const key = this.checkpointKey(headText, files)
    if (this.checkpoints.has(key)) {
      this.touch(key)
      return false // already warm
    }
    try {
      const { built } = await this.ensureCheckpoint(headText, files)
      return built
    } catch {
      return false // build failure is non-fatal — the next real edit just falls back to full
    }
  }

  /** First changed position in the main source, pulled earlier to the `\include`/`\input`
   *  command of any included file whose content changed since the last full compile. */
  private editOffset(prevMain: string, source: string, files: FileSet): number {
    let offset = firstDifference(prevMain, source)
    if (files.size && this.last) {
      const pos = includePositions(source)
      for (const [path, content] of files) {
        if (path === this.mainFile) continue
        const at = this.includePosFor(path, pos)
        if (at !== undefined && at < offset && this.last.get(path) !== content) offset = at
      }
    }
    return offset
  }

  /** The `\include`/`\input` offset that loads `path`. Matches the include name exactly
   *  (`ch1.tex` ↔ `\include{ch1}`), else by bare basename so a subdirectory chapter loaded
   *  via TeX's search path (`\input{intro}` ↔ `chapters/intro.tex`) is still found. */
  private includePosFor(path: string, pos: Map<string, number>): number | undefined {
    const stripped = path.replace(/\.tex$/, '')
    const exact = pos.get(stripped)
    if (exact !== undefined) return exact
    return pos.get(stripped.slice(stripped.lastIndexOf('/') + 1))
  }

  /** Content of the file an include name refers to: the exact `${n}.tex`/`n` key, else a
   *  unique basename match (so `\input{intro}` resolves `chapters/intro.tex`). '' if none
   *  or ambiguous (two files sharing a basename → don't guess). */
  private includedContent(n: string, files: FileSet): string {
    const direct = files.get(`${n}.tex`) ?? files.get(n)
    if (direct !== undefined) return direct
    const base = n.slice(n.lastIndexOf('/') + 1)
    let found: string | undefined
    for (const [path, content] of files) {
      if (path === this.mainFile) continue
      if (path.slice(path.lastIndexOf('/') + 1).replace(/\.tex$/, '') === base) {
        if (found !== undefined) return '' // ambiguous basename → don't guess
        found = content
      }
    }
    return found ?? ''
  }

  /** True if the main edit OR any changed included file touched labels/numbering. */
  private changeTouchesLabels(prevMain: string, source: string, files: FileSet): boolean {
    if (editTouchesLabels(prevMain, source)) return true
    if (!this.last) return false
    // Union of previous + current files so added/removed chapters are checked too.
    const paths = new Set<string>([...this.last.keys(), ...files.keys()])
    paths.delete(this.mainFile)
    for (const path of paths) {
      const prev = this.last.get(path) ?? ''
      const next = files.get(path) ?? ''
      if (prev !== next && editTouchesLabels(prev, next)) return true
    }
    return false
  }

  private async ensureCheckpoint(
    headText: string,
    files: FileSet,
  ): Promise<{ checkpoint: Checkpoint; built: boolean }> {
    const key = this.checkpointKey(headText, files)
    const cached = this.checkpoints.get(key)
    if (cached) {
      this.touch(key)
      return { checkpoint: cached, built: false }
    }
    const { fmt, headPdf } = await this.engine.buildCheckpoint(headText)
    if (!headPdf) throw new Error('checkpoint produced no head PDF')
    const checkpoint: Checkpoint = { key, fmt, headPdf }
    this.checkpoints.set(key, checkpoint)
    this.touch(key)
    this.evict()
    return { checkpoint, built: true }
  }

  /** Effective head content size: the main-source prefix plus the bytes of the files it
   *  includes (so an \include-only main file isn't mistaken for a tiny head). */
  private headSize(headText: string, files: FileSet): number {
    let size = headText.length
    for (const name of includePositions(headText).keys()) {
      size += this.includedContent(name, files).length
    }
    return size
  }

  /** Key a checkpoint by its head text AND the content of the files the head can bake in —
   *  so an early-chapter or head-asset edit invalidates exactly the checkpoints after it.
   *  Folds in: (1) `\include`/`\input`/`\subfile` targets the head loads (basename-aware),
   *  and (2) every non-.tex project file (images/data the head may `\includegraphics`), which
   *  an include-name lookup can't see — without (2) a changed head asset reuses a stale head. */
  private checkpointKey(headText: string, files: FileSet): string {
    const names = [...includePositions(headText).keys()].sort()
    const inc = names.map((n) => `${n}=${hashString(this.includedContent(n, files))}`)
    const assets: string[] = []
    for (const [path, content] of files) {
      if (path === this.mainFile || path.endsWith('.tex')) continue
      assets.push(`${path}=${hashString(content)}`)
    }
    assets.sort()
    return `${headText.length}:${hashString(headText)}|${inc.join(',')}|${assets.join(',')}`
  }

  private snapshot(source: string, files: FileSet): FileSet {
    const m = new Map(files)
    m.set(this.mainFile, source)
    return m
  }

  private touch(key: string): void {
    const i = this.lru.indexOf(key)
    if (i !== -1) this.lru.splice(i, 1)
    this.lru.push(key)
  }

  private evict(): void {
    while (this.lru.length > this.maxCheckpoints) {
      const old = this.lru.shift()
      if (old) this.checkpoints.delete(old)
    }
  }

  private async full(source: string, files: FileSet): Promise<IncrementalResult> {
    // Files are already on the engine FS (compile() called syncProjectFiles first).
    const r: CompileResult = await this.engine.compile()
    this.last = this.snapshot(source, files)
    this.lastFullSource = source
    this.lastFullFiles = this.snapshot(source, files)
    this.lastFullSynctexBytes = r.synctex // head merge-base for the next fast paint
    this.lastFullSynctex = null
    return {
      pdf: r.pdf,
      log: r.log,
      success: r.success,
      incremental: false,
      checkpointBuilt: false,
      final: true,
      reason: 'no usable checkpoint',
    }
  }
}
