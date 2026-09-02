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
import type { CompileResult, HeapCheckpointRecord } from '../types'
import { firstDifference, hashString } from './checkpoint-boundaries'
import { editTouchesLabels } from './incremental'
import { extractPreamble } from './preamble-utils'

/** Project text files (path → content), including the main file. */
export type SourceSet = Map<string, string>

export interface HeapCheckpointEngine {
  readonly supportsHeapCheckpoints: boolean
  compile(options?: { checkpoints?: Array<{ id: string; line: number }> }): Promise<CompileResult>
  compileFromHeapCheckpoint(
    id: string,
    checkpoints?: Array<{ id: string; line: number }>,
  ): Promise<CompileResult>
  dropHeapCheckpoints(ids?: string[]): Promise<void>
}

export interface HeapCheckpointOptions {
  mainFile?: string
  /** Checkpoints kept (LRU by use). Default 4. */
  maxCheckpoints?: number
  /** Total sparse-image bytes kept across checkpoints. Default 320 MiB. */
  maxBytes?: number
  /** Never checkpoint within this many bytes of the start of the body. Default 512. */
  minHeadBytes?: number
}

export interface HeapCheckpointArm {
  id: string
  line: number
}

interface Checkpoint {
  id: string
  line: number
  /** Length and hash of the main-file prefix (up to the start of `line`) it was taken on. */
  prefixLength: number
  prefixHash: string
  /** Content hashes of the project text files TeX had opened when it was taken. */
  inputs: Map<string, string>
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
 * paragraph — and typing just above it — still resume from it. Never inside the preamble.
 */
export function checkpointLineForEdit(
  source: string,
  offset: number,
  minHeadBytes = 512,
): number | null {
  const split = extractPreamble(source)
  const bodyStart = split ? source.indexOf('\\begin{document}') : -1
  if (bodyStart < 0) return null
  // First line after \begin{document}'s line is the earliest usable checkpoint.
  const floor = source.indexOf('\n', bodyStart)
  if (floor < 0) return null
  const earliest = floor + 1
  if (offset <= earliest + minHeadBytes) return null
  // Walk back over blank-line paragraph boundaries: the edit's paragraph start, then one more.
  let at = Math.min(offset, source.length)
  let boundaries = 0
  let candidate = -1
  while (at > earliest) {
    const nl = source.lastIndexOf('\n', at - 1)
    if (nl < earliest) break
    // A blank line: "\n\n" or "\n<spaces>\n"
    const prevNl = source.lastIndexOf('\n', nl - 1)
    const between = source.slice(prevNl + 1, nl)
    if (between.trim() === '') {
      candidate = nl + 1
      boundaries++
      if (boundaries >= 2) break
    }
    at = nl
  }
  if (candidate < 0) return null
  if (candidate <= earliest + minHeadBytes) return null
  return lineOfOffset(source, candidate)
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
  }

  get enabled(): boolean {
    return this.engine.supportsHeapCheckpoints
  }

  /** Ids and bytes of the checkpoints currently held (for telemetry and tests). */
  get held(): Array<{ id: string; line: number; bytes: number }> {
    return [...this.checkpoints.values()].map((c) => ({ id: c.id, line: c.line, bytes: c.bytes }))
  }

  reset(): void {
    this.checkpoints.clear()
    this.last = null
    this.lastMain = null
    void this.engine.dropHeapCheckpoints()
  }

  /**
   * Checkpoints to arm on the full compile about to run for `source`: the paragraph before
   * the region the last edit touched (or, with no baseline, before the end of the document),
   * unless a held checkpoint already covers it. `extraLine` lets a host add the cursor line.
   */
  armsForFullCompile(source: string, files: SourceSet, extraOffset?: number): HeapCheckpointArm[] {
    if (!this.enabled) return []
    const offsets: number[] = []
    if (this.lastMain != null) {
      const diff = firstDifference(this.lastMain, source)
      if (diff < source.length || this.lastMain !== source) offsets.push(diff)
    } else {
      offsets.push(source.length)
    }
    if (extraOffset !== undefined) offsets.push(extraOffset)
    const arms: HeapCheckpointArm[] = []
    const seenLines = new Set<number>()
    for (const offset of offsets) {
      const line = checkpointLineForEdit(source, offset, this.minHeadBytes)
      if (line === null || seenLines.has(line)) continue
      seenLines.add(line)
      if (this.findValid(source, files, lineStartOffset(source, line) + 1, line)) continue
      arms.push({ id: `hc${++this.seq}`, line })
    }
    return arms
  }

  /** Record a finished full compile (or resume) and the checkpoints it took. */
  noteFull(source: string, files: SourceSet, result: CompileResult): void {
    this.last = new Map(files)
    this.last.set(this.mainFile, source)
    this.lastMain = source
    for (const record of result.heapCheckpoints ?? []) this.remember(source, files, record)
    void this.enforceBudget()
  }

  /**
   * Resume from a checkpoint valid for `source` (bytes before its line unchanged, its inputs
   * unchanged), taking new checkpoints for the edited region on the way. Null when no
   * checkpoint applies, when there is no baseline yet, or when the preamble changed.
   */
  async tryResume(source: string, files: SourceSet): Promise<HeapResumeResult | null> {
    if (!this.enabled || this.lastMain == null) return null
    if (extractPreamble(this.lastMain)?.preamble !== extractPreamble(source)?.preamble) return null
    const diff = firstDifference(this.lastMain, source)
    const checkpoint = this.findValid(source, files, diff)
    if (!checkpoint) return null
    checkpoint.lastUsed = ++this.tick
    const arms = this.armsForFullCompile(source, files)
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
  ): Checkpoint | null {
    let best: Checkpoint | null = null
    for (const cp of this.checkpoints.values()) {
      if (atLine !== undefined && cp.line !== atLine) continue
      if (!this.covers(cp, source, files, editOffset)) continue
      if (!best || cp.line > best.line) best = cp
    }
    return best
  }

  /** True when `cp` sits at or before `editOffset` and its prefix and inputs still match. */
  private covers(cp: Checkpoint, source: string, files: SourceSet, editOffset: number): boolean {
    const start = lineStartOffset(source, cp.line)
    if (start < 0 || start > editOffset || start !== cp.prefixLength) return false
    if (hashString(source.slice(0, start)) !== cp.prefixHash) return false
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
    const start = lineStartOffset(source, record.line)
    if (start < 0) return
    const inputs = new Map<string, string>()
    for (const raw of record.inputs ?? []) {
      const path = projectPath(raw)
      if (!path || path === this.mainFile) continue
      const content = files.get(path)
      if (content !== undefined) inputs.set(path, hashString(content))
    }
    this.checkpoints.set(record.id, {
      id: record.id,
      line: record.line,
      prefixLength: start,
      prefixHash: hashString(source.slice(0, start)),
      inputs,
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
  let p = raw.trim()
  if (p.startsWith('/work/')) p = p.slice('/work/'.length)
  else if (p.startsWith('./')) p = p.slice(2)
  else if (p.startsWith('/')) return null
  if (!p || p.startsWith('__') || p.startsWith('.')) return null
  return p
}
