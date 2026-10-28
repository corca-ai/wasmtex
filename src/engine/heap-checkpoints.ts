/**
 * Arbitrary-line incremental compilation via heap checkpoints (#81).
 *
 * On the Asyncify engine build a compile can be suspended before TeX reads a given line
 * of the main file and its entire state kept as a **checkpoint**: a sparse copy of wasm
 * memory plus the worker's file state. A later edit that leaves everything before that
 * line unchanged resumes from the checkpoint and only the rest of the document is typeset —
 * a complete PDF and SyncTeX come out of the same run, nothing is spliced. Unlike the
 * page-break checkpoints of #55, a checkpoint can sit at any line and is reusable across
 * edits (restore is a memory copy), so consecutive edits in the same region are all fast.
 *
 * This class decides where to take checkpoints and which one an edit may resume from:
 *
 * - **Placement**: every full compile arms a checkpoint at the paragraph start before the
 *   region the last edit touched (edits cluster), and a host can arm one at the cursor while
 *   idle ({@link prepareAt}). Each costs one sparse memory copy (tens of ms, tens of MB).
 * - **Validity**: the bytes of the main file before the checkpoint line must be identical,
 *   and so must every project file TeX had opened by then (from the run's recorder).
 * - **Exactness**: a resumed run reads cross-references from the `.aux` the checkpointed run
 *   loaded, so an edit that touches labels/numbering is reported `final: false` and the host
 *   follows up with a full compile, exactly as for #55.
 */
import type { CompileResult, HeapCheckpointArm, HeapCheckpointRecord } from '../types'
import { firstDifference, hashString, includePositions } from './checkpoint-boundaries'
import { normalizeProjectDependencyPath } from './dependency-manifest'
import { editTouchesLabels } from './incremental'
import { extractPreamble } from './preamble-utils'

/** Project text files (path → content), including the main file. */
export type SourceSet = Map<string, string>

export interface HeapCheckpointEngine {
  readonly supportsHeapCheckpoints: boolean
  readonly supportsLineCheckpoints?: boolean
  readonly supportsSharedCheckpoints?: boolean
  readonly supportsFileCheckpoints?: boolean
  setCheckpointBudget?(maxCount: number, maxBytes: number): void
  compile(options?: {
    checkpoints?: Array<{ id: string; line: number; path?: string }>
  }): Promise<CompileResult>
  compileFromHeapCheckpoint(
    id: string,
    checkpoints?: Array<{ id: string; line: number; path?: string }>,
  ): Promise<CompileResult>
  dropHeapCheckpoints(ids?: string[]): Promise<void>
}

export interface HeapCheckpointOptions {
  mainFile?: string
  /** Checkpoints kept (LRU by use). Default 4. */
  maxCheckpoints?: number
  /** Total sparse-image bytes kept across checkpoints. Default 320 MiB. */
  maxBytes?: number
  /** Minimum effective head text, including earlier included files. Default 512. */
  minHeadBytes?: number
}

export type { HeapCheckpointArm } from '../types'

interface Checkpoint {
  path?: string
  id: string
  line: number
  /** Length and hash of the main-file prefix (up to the start of `line`) it was taken on. */
  prefixLength: number
  prefixHash: string
  /** Content hashes of the project text files TeX had opened when it was taken. */
  inputs: Map<string, string>
  /** Raw recorder reads; absent evidence cannot admit resource-sensitive resumes. */
  inputPaths: string[] | null
  inputsComplete: boolean
  bytes: number
  lastUsed: number
}

export interface HeapResumeResult {
  result: CompileResult
  /** False when the edit touched labels/numbering and a full reconcile pass should follow. */
  final: boolean
  checkpointId: string
}

/** 0-based offset of the start of 1-based `line` in `text`, or -1 when past the end. */
export function lineStartOffset(text: string, line: number): number {
  if (line <= 1) return 0
  let at = -1
  for (let n = 1; n < line; n++) {
    at = text.indexOf('\n', at + 1)
    if (at < 0) return -1
  }
  return at + 1
}

/** 1-based line containing 0-based `offset`. */
export function lineOfOffset(text: string, offset: number): number {
  let line = 1
  const end = Math.min(offset, text.length)
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/**
 * The line to checkpoint for an edit at `offset`: the start of the paragraph before the
 * one containing the edit (a blank-line boundary), so that further edits in the same
 * paragraph — and typing just above it — still resume from it. Without a blank-line
 * boundary, use the previous source line. Never inside the preamble.
 */
export function checkpointLineForEdit(
  source: string,
  offset: number,
  minHeadBytes = 512,
  lineFallback = false,
): number | null {
  const split = extractPreamble(source)
  const bodyStart = split ? source.indexOf('\\begin{document}') : -1
  if (bodyStart < 0) return null
  // First line after \begin{document}'s line is the earliest usable checkpoint.
  const floor = source.indexOf('\n', bodyStart)
  if (floor < 0) return null
  const earliest = floor + 1
  if (offset < earliest + minHeadBytes) return null
  const currentLineStart = source.lastIndexOf('\n', Math.min(offset, source.length) - 1) + 1
  // A chapter list often has no blank lines. Paragraph slack there would put
  // every chapter's checkpoint before the entire list. Capable workers can
  // suspend before reading the actual standalone input command instead.
  if (lineFallback && standaloneInputLine(source, currentLineStart))
    return lineOfOffset(source, currentLineStart)
  const fallback = lineFallback
    ? Math.max(earliest, source.lastIndexOf('\n', currentLineStart - 2) + 1)
    : minHeadBytes === 0
      ? earliest
      : -1
  const candidate = previousParagraphStart(source, offset, earliest) ?? fallback
  if (candidate < earliest + minHeadBytes) return null
  return lineOfOffset(source, candidate)
}

function standaloneInputLine(source: string, start: number): boolean {
  const end = source.indexOf('\n', start)
  const line = source.slice(start, end < 0 ? undefined : end)
  return /^\s*\\(?:include|input|subfile)\s*\{[^}\n]+\}\s*(?:%[^\n]*)?$/.test(line)
}

/** Prefer one paragraph of slack; compact sources may have no blank separator. */
function previousParagraphStart(source: string, offset: number, earliest: number): number | null {
  let at = Math.min(offset, source.length)
  let boundaries = 0
  let candidate: number | null = null
  while (at > earliest) {
    const nl = source.lastIndexOf('\n', at - 1)
    if (nl < earliest) break
    const prevNl = source.lastIndexOf('\n', nl - 1)
    if (source.slice(prevNl + 1, nl).trim() === '') {
      candidate = nl + 1
      if (++boundaries >= 2) break
    }
    at = nl
  }
  return candidate
}

/**
 * Bookkeeping for heap checkpoints of one document on one engine. The headless compiler
 * owns the engine and calls in at three points: when it is about to run a full compile
 * ({@link armsForFullCompile}), when a full compile finished ({@link noteFull}), and when an
 * edit arrives ({@link tryResume}).
 */
export class HeapCheckpointCompiler {
  private readonly engine: HeapCheckpointEngine
  private readonly mainFile: string
  private readonly maxCheckpoints: number
  private readonly maxBytes: number
  private readonly minHeadBytes: number
  private readonly checkpoints = new Map<string, Checkpoint>()
  /** Sources at the last full compile (the diff baseline for edits and placement). */
  private last: SourceSet | null = null
  private lastMain: string | null = null
  private seq = 0
  private tick = 0

  constructor(engine: HeapCheckpointEngine, options: HeapCheckpointOptions = {}) {
    this.engine = engine
    this.mainFile = options.mainFile ?? 'main.tex'
    this.maxCheckpoints = options.maxCheckpoints ?? 4
    this.maxBytes = options.maxBytes ?? 320 * 1024 * 1024
    this.minHeadBytes = options.minHeadBytes ?? 512
    engine.setCheckpointBudget?.(this.maxCheckpoints, this.maxBytes)
  }

  get enabled(): boolean {
    return this.engine.supportsHeapCheckpoints
  }

  /** Ids and bytes of the checkpoints currently held (for telemetry and tests). */
  get held(): Array<{ id: string; line: number; bytes: number }> {
    return [...this.checkpoints.values()].map((c) => ({ id: c.id, line: c.line, bytes: c.bytes }))
  }

  /** Copy proof and diff baselines; the engine's fork owns the copied heap. */
  cloneForEngine(engine: HeapCheckpointEngine, onlyId?: string): HeapCheckpointCompiler {
    const copy = new HeapCheckpointCompiler(engine, {
      mainFile: this.mainFile,
      maxCheckpoints: this.maxCheckpoints,
      maxBytes: this.maxBytes,
      minHeadBytes: this.minHeadBytes,
    })
    copy.last = this.last ? new Map(this.last) : null
    copy.lastMain = this.lastMain
    copy.seq = this.seq
    copy.tick = this.tick
    for (const [id, checkpoint] of this.checkpoints) {
      if (onlyId !== undefined && id !== onlyId) continue
      copy.checkpoints.set(id, {
        ...checkpoint,
        inputs: new Map(checkpoint.inputs),
        inputPaths: checkpoint.inputPaths ? [...checkpoint.inputPaths] : null,
      })
    }
    return copy
  }

  /** A preview must not advance the full-result baseline or arm new checkpoints. */
  previewCheckpoint(source: string, files: SourceSet): string | undefined {
    if (!this.enabled || this.lastMain === null) return undefined
    return this.findValid(source, files, firstDifference(this.lastMain, source))?.id
  }

  /** Select a prepared region before an edit, before its bytes are written. */
  previewCheckpointForEdit(
    source: string,
    files: SourceSet,
    path: string,
    offset: number,
  ): string | undefined {
    const content = files.get(path)
    if (
      !this.enabled ||
      this.lastMain === null ||
      content === undefined ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > content.length
    )
      return undefined
    if (path === this.mainFile)
      return this.findValid(source, files, offset, undefined, undefined, true)?.id
    const local = [...this.checkpoints.values()]
      .filter(
        (cp) =>
          cp.path === path &&
          this.covers(cp, source, files, source.length) &&
          cp.prefixLength <= offset,
      )
      .sort((a, b) => b.prefixLength - a.prefixLength)[0]
    if (local) return local.id
    const checkpoint = this.findValid(
      source,
      files,
      source.length,
      undefined,
      (paths) => !paths.some((raw) => projectPath(raw) === path),
    )
    return checkpoint?.inputsComplete ? checkpoint.id : undefined
  }

  reset(): void {
    this.checkpoints.clear()
    this.last = null
    this.lastMain = null
    void this.engine.dropHeapCheckpoints()
  }

  /** Keep a secondary-source edit only when the checkpoint proves it had not
   * read that file, including through a precompiled preamble. Older workers
   * lack this proof and retain their conservative reset behavior. */
  invalidateFile(path: string, content?: string | Uint8Array): void {
    if (projectPath(path) !== path) {
      this.reset()
      return
    }
    const drop: string[] = []
    for (const [id, checkpoint] of this.checkpoints) {
      if (
        checkpoint.path === path &&
        typeof content === 'string' &&
        hashString(content.slice(0, checkpoint.prefixLength)) === checkpoint.prefixHash &&
        content.length >= checkpoint.prefixLength
      )
        continue
      if (
        !checkpoint.inputsComplete ||
        !checkpoint.inputPaths ||
        !checkpoint.inputPaths.some((raw) => projectPath(raw) === this.mainFile) ||
        checkpoint.inputPaths.some(
          (raw) =>
            raw.replaceAll('\\', '/').split('/').includes('..') &&
            !normalizeProjectDependencyPath(raw.trim()),
        ) ||
        checkpoint.inputPaths.some((raw) => projectPath(raw) === path)
      ) {
        this.checkpoints.delete(id)
        drop.push(id)
      }
    }
    if (drop.length) void this.engine.dropHeapCheckpoints(drop)
  }

  /**
   * Checkpoints to arm on the full compile about to run for `source`: the paragraph before
   * the region the last edit touched (or, with no baseline, before the end of the document),
   * unless a held checkpoint already covers it. `extraOffset` lets a host add the cursor location.
   */
  armsForFullCompile(
    source: string,
    files: SourceSet,
    extraOffset?: number,
    hint?: { path: string; offset: number },
  ): HeapCheckpointArm[] {
    if (!this.enabled || this.maxCheckpoints < 1) return []
    const offsets = this.fullCompileOffsets(source, extraOffset)
    const arms: HeapCheckpointArm[] = []
    const local = this.armForSecondarySource(source, files, hint)
    if (local) arms.push(local)
    const seenLines = new Set<number>()
    for (const offset of offsets) {
      if (arms.length >= Math.min(this.maxCheckpoints, 64)) break
      const line = checkpointLineForEdit(
        source,
        offset,
        this.engine.supportsLineCheckpoints
          ? this.effectiveHeadFloor(source, files, offset)
          : this.minHeadBytes,
        this.engine.supportsLineCheckpoints,
      )
      if (line === null || seenLines.has(line)) continue
      seenLines.add(line)
      if (this.findValid(source, files, lineStartOffset(source, line) + 1, line)) continue
      arms.push({ id: `hc${++this.seq}`, line })
    }
    return arms
  }

  private armForSecondarySource(
    source: string,
    files: SourceSet,
    hint?: { path: string; offset: number },
  ): HeapCheckpointArm | null {
    if (
      this.engine.supportsFileCheckpoints &&
      hint &&
      hint.path !== this.mainFile &&
      projectPath(hint.path) === hint.path &&
      hint.path.endsWith('.tex')
    ) {
      const text = files.get(hint.path)
      if (
        text !== undefined &&
        Number.isSafeInteger(hint.offset) &&
        hint.offset > 0 &&
        hint.offset <= text.length
      ) {
        const at =
          previousParagraphStart(text, hint.offset, 0) ??
          Math.max(0, text.lastIndexOf('\n', text.lastIndexOf('\n', hint.offset - 1) - 1) + 1)
        const line = lineOfOffset(text, at)
        const held = [...this.checkpoints.values()].some(
          (cp) =>
            cp.path === hint.path &&
            cp.line === line &&
            this.covers(cp, source, files, source.length),
        )
        if (!held && at > 0) return { id: `hc${++this.seq}`, path: hint.path, line }
      }
    }
    return null
  }

  private fullCompileOffsets(source: string, extraOffset?: number): number[] {
    const offsets: number[] = []
    if (extraOffset !== undefined) {
      offsets.push(extraOffset)
    } else if (this.lastMain != null) {
      const diff = firstDifference(this.lastMain, source)
      if (diff < source.length || this.lastMain !== source) offsets.push(diff)
    } else {
      offsets.push(source.length)
    }
    if (this.engine.supportsSharedCheckpoints && this.maxCheckpoints > 1) {
      const target = offsets[0] ?? source.length
      const chapters = [...includePositions(source).values()].filter((offset) =>
        standaloneInputLine(source, source.lastIndexOf('\n', offset - 1) + 1),
      )
      chapters.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
      offsets.push(...chapters)
    }
    return offsets
  }

  private effectiveHeadFloor(source: string, files: SourceSet, offset: number): number {
    let remaining = this.minHeadBytes
    const directory = this.mainFile.slice(0, this.mainFile.lastIndexOf('/') + 1)
    for (const name of includePositions(source.slice(0, offset)).keys()) {
      const path = normalizeProjectDependencyPath(`${directory}${name}.tex`)
      const text = files.get(`${name}.tex`) ?? (path ? files.get(path) : undefined)
      remaining -= text?.length ?? 0
      if (remaining <= 0) return 0
    }
    return remaining
  }

  /** Record a finished full compile (or resume) and the checkpoints it took. */
  noteFull(source: string, files: SourceSet, result: CompileResult): void {
    this.last = new Map(files)
    this.last.set(this.mainFile, source)
    this.lastMain = source
    const retained = this.engine.supportsSharedCheckpoints
      ? result.heapCheckpointRetention
      : undefined
    const shared =
      retained && retained.ids.length <= this.maxCheckpoints && retained.bytes <= this.maxBytes
        ? new Set(retained.ids)
        : null
    if (shared) {
      for (const id of this.checkpoints.keys()) if (!shared.has(id)) this.checkpoints.delete(id)
    }
    for (const record of result.heapCheckpoints ?? []) {
      if (!shared || shared.has(record.id)) this.remember(source, files, record)
    }
    if (!shared) void this.enforceBudget()
  }

  /**
   * Resume from a checkpoint valid for `source` (bytes before its line unchanged, its inputs
   * unchanged), taking new checkpoints for the edited region on the way. Null when no
   * checkpoint applies, when there is no baseline yet, or when the preamble changed.
   */
  async tryResume(
    source: string,
    files: SourceSet,
    acceptInputs?: (paths: readonly string[]) => boolean,
    extraOffset?: number,
    hint?: { path: string; offset: number },
  ): Promise<HeapResumeResult | null> {
    if (!this.enabled || this.lastMain == null) return null
    if (extractPreamble(this.lastMain)?.preamble !== extractPreamble(source)?.preamble) return null
    const diff = firstDifference(this.lastMain, source)
    const checkpoint = this.findValid(source, files, diff, undefined, acceptInputs)
    if (!checkpoint) return null
    checkpoint.lastUsed = ++this.tick
    const arms = this.armsForFullCompile(source, files, extraOffset, hint)
    const result = await this.engine.compileFromHeapCheckpoint(checkpoint.id, arms)
    if (!result.pdf) {
      // The worker could not resume (crashed state, evicted): forget it, let the caller go full.
      this.checkpoints.delete(checkpoint.id)
      return null
    }
    const final = !this.changeTouchesLabels(source, files)
    this.noteFull(source, files, result)
    return { result, final, checkpointId: checkpoint.id }
  }

  /**
   * Latest held checkpoint whose line starts at or before `editOffset` and whose prefix and
   * inputs still match `source`/`files`. With `atLine`, only that line qualifies.
   */
  private findValid(
    source: string,
    files: SourceSet,
    editOffset: number,
    atLine?: number,
    acceptInputs?: (paths: readonly string[]) => boolean,
    mainOnly = false,
  ): Checkpoint | null {
    let best: Checkpoint | null = null
    const localChanged = (candidate: Checkpoint) =>
      !!candidate.path && files.get(candidate.path) !== this.last?.get(candidate.path)
    for (const cp of this.checkpoints.values()) {
      if (!checkpointLocationMatches(cp, atLine, mainOnly)) continue
      if (!this.covers(cp, source, files, editOffset)) continue
      if (acceptInputs && (!cp.inputPaths || !acceptInputs(cp.inputPaths))) continue
      if (laterCheckpoint(cp, best, localChanged)) best = cp
    }
    return best
  }

  /** True when `cp` sits at or before `editOffset` and its prefix and inputs still match. */
  private covers(cp: Checkpoint, source: string, files: SourceSet, editOffset: number): boolean {
    const target = cp.path ? files.get(cp.path) : source
    if (target === undefined) return false
    const start = lineStartOffset(target, cp.line)
    if (start < 0 || (!cp.path && start > editOffset) || start !== cp.prefixLength) return false
    if (hashString(target.slice(0, start)) !== cp.prefixHash) return false
    if (cp.path && cp.inputs.get(this.mainFile) !== hashString(source)) return false
    return this.inputsMatch(cp, files)
  }

  private inputsMatch(cp: Checkpoint, files: SourceSet): boolean {
    for (const [path, hash] of cp.inputs) {
      const content = files.get(path)
      if (content === undefined || hashString(content) !== hash) return false
    }
    return true
  }

  private changeTouchesLabels(source: string, files: SourceSet): boolean {
    if (this.lastMain != null && editTouchesLabels(this.lastMain, source)) return true
    if (!this.last) return false
    for (const [path, content] of files) {
      if (path === this.mainFile) continue
      const prev = this.last.get(path)
      if (prev !== undefined && prev !== content && editTouchesLabels(prev, content)) return true
    }
    return false
  }

  private remember(source: string, files: SourceSet, record: HeapCheckpointRecord): void {
    const path = record.path
    if (!validSecondaryRecord(record, this.mainFile)) return
    const target = path ? files.get(path) : source
    if (target === undefined) return
    const start = lineStartOffset(target, record.line)
    if (start < 0) return
    const inputs = new Map<string, string>()
    for (const raw of record.inputs ?? []) {
      const path = projectPath(raw)
      if (!path || path === (record.path ?? this.mainFile)) continue
      const content = files.get(path)
      if (content !== undefined) inputs.set(path, hashString(content))
    }
    this.checkpoints.set(record.id, {
      id: record.id,
      ...(path ? { path } : {}),
      line: record.line,
      prefixLength: start,
      prefixHash: hashString(target.slice(0, start)),
      inputs,
      inputPaths: record.inputs ? [...record.inputs] : null,
      inputsComplete: record.inputsComplete === true,
      bytes: record.bytes,
      lastUsed: ++this.tick,
    })
  }

  /** Drop least-recently-used checkpoints beyond the count/bytes budget. */
  private async enforceBudget(): Promise<void> {
    const drop: string[] = []
    const byUse = [...this.checkpoints.values()].sort((a, b) => b.lastUsed - a.lastUsed)
    let bytes = 0
    byUse.forEach((cp, i) => {
      bytes += cp.bytes
      if (i >= this.maxCheckpoints || bytes > this.maxBytes) drop.push(cp.id)
    })
    if (drop.length === 0) return
    for (const id of drop) this.checkpoints.delete(id)
    await this.engine.dropHeapCheckpoints(drop)
  }
}

/** Project-relative path of a recorder input (`/work/chapters/a.tex` → `chapters/a.tex`),
 *  or null for TeX Live / system files. */
export function projectPath(raw: string): string | null {
  const path = normalizeProjectDependencyPath(raw.trim())
  if (!path || path.startsWith('__') || path.startsWith('.')) return null
  return path
}

function laterCheckpoint(
  cp: Checkpoint,
  best: Checkpoint | null,
  changed: (cp: Checkpoint) => boolean,
): boolean {
  if (!best) return true
  if (changed(cp) !== changed(best)) return changed(cp)
  if (!!cp.path !== !!best.path) return !cp.path
  return cp.path === best.path && cp.line > best.line
}
function validSecondaryRecord(record: HeapCheckpointRecord, main: string): boolean {
  if (record.path === undefined) return true
  return (
    projectPath(record.path) === record.path &&
    record.path !== main &&
    record.prefixSafe === true &&
    record.inputsComplete === true
  )
}

function checkpointLocationMatches(
  cp: Checkpoint,
  line: number | undefined,
  mainOnly: boolean,
): boolean {
  if (mainOnly && cp.path) return false
  return line === undefined || (!cp.path && cp.line === line)
}
