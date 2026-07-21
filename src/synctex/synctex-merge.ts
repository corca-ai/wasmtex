import type { SynctexData, SynctexNode } from './synctex-parser'

/**
 * Merge a tail's SyncTeX (from `compileFromCheckpoint`) onto the head pages of the last full
 * compile's SyncTeX, producing a complete SyncTeX for the spliced head+tail PDF (#99 Phase 2).
 * This lets an incremental fast paint carry EXACT SyncTeX so click-to-source works immediately
 * and the background full reconcile can be skipped for the servable (final) edit.
 *
 * The tail is compiled in isolation as a virtual file (`tailFile`, e.g. `tail.tex`) so its
 * source lines are tail-relative and its pages start at 1. The merge:
 *   - keeps head pages `1..headPageCount` unchanged (their nodes already map to `mainFile`);
 *   - offsets each tail page by `headPageCount`, its `tailFile` nodes' source lines by
 *     `tailLineOffset` (the head's line count), and rewrites their input tag to the head's
 *     `mainFile` tag — coordinates are per-page-relative, so they need no adjustment;
 *   - rebuilds `pageRoots`/`friendIndex` exactly as {@link SynctexParser} does.
 *
 * Preconditions the CALLER must guarantee: the head is unchanged since the last full compile
 * (so head pages `1..headPageCount` are still valid) and head/tail share the preamble (so the
 * `magnification`/`unit`/offset scalars match). Returns `null` — meaning "keep the last full
 * SyncTeX and reconcile with a full compile" — when the tail isn't a single-file tail (its only
 * non-`.aux` source file is `tailFile`) or the expected input tags can't be found.
 */
export interface TailMergeInput {
  head: SynctexData
  tail: SynctexData
  headPageCount: number
  tailLineOffset: number
  mainFile: string
  tailFile: string
}

/** First tag whose input name equals `name` or ends with `/name`; null if none. */
function findTag(inputs: Map<number, string>, name: string): number | null {
  for (const [tag, n] of inputs) {
    if (n === name || n.endsWith(`/${name}`)) return tag
  }
  return null
}

/** Rebuild the derived indexes from the flat per-page node lists, matching the parser:
 *  `pageRoots` = nodes with no parent; `friendIndex` = "input:line" for nodes with line > 0. */
function rebuildDerived(pages: Map<number, SynctexNode[]>): {
  pageRoots: Map<number, SynctexNode[]>
  friendIndex: Map<string, SynctexNode[]>
} {
  const pageRoots = new Map<number, SynctexNode[]>()
  const friendIndex = new Map<string, SynctexNode[]>()
  for (const [page, nodes] of pages) {
    const roots: SynctexNode[] = []
    for (const node of nodes) {
      if (node.parent === null) roots.push(node)
      if (node.line > 0) {
        const key = `${node.input}:${node.line}`
        let bucket = friendIndex.get(key)
        if (!bucket) {
          bucket = []
          friendIndex.set(key, bucket)
        }
        bucket.push(node)
      }
    }
    pageRoots.set(page, roots)
  }
  return { pageRoots, friendIndex }
}

/** True when the tail's only real (non-`.aux`) source file is `tailMainTag` — the single-file
 *  case this merge supports. A multi-file tail (\include/\input of chapters) needs per-file line
 *  handling (chapter lines are file-relative, not tail-relative) and is left to a full reconcile. */
function isSingleFileTail(tail: SynctexData, tailMainTag: number): boolean {
  for (const [tag, name] of tail.inputs) {
    if (tag === tailMainTag || name.endsWith('.aux')) continue
    return false
  }
  return true
}

/** Offset the tail's pages onto the spliced PDF, in place: page += headPageCount; `tailMainTag`
 *  nodes → `headMainTag` with source lines += tailLineOffset (coords are per-page relative, so
 *  they don't move). Mutating is safe — the tail SyncTeX is throwaway (re-parsed each fast paint). */
function offsetTailInto(
  pages: Map<number, SynctexNode[]>,
  tail: SynctexData,
  headPageCount: number,
  tailLineOffset: number,
  tailMainTag: number,
  headMainTag: number,
): void {
  for (const [tp, nodes] of tail.pages) {
    const newPage = headPageCount + tp
    for (const node of nodes) {
      node.page = newPage
      if (node.input === tailMainTag) {
        node.input = headMainTag
        if (node.line > 0) node.line += tailLineOffset
      }
    }
    pages.set(newPage, nodes)
  }
}

export function mergeTailSynctex(input: TailMergeInput): SynctexData | null {
  const { head, tail, headPageCount, tailLineOffset, mainFile, tailFile } = input
  const headMainTag = findTag(head.inputs, mainFile)
  const tailMainTag = findTag(tail.inputs, tailFile)
  if (headMainTag === null || tailMainTag === null) return null
  if (!isSingleFileTail(tail, tailMainTag)) return null

  const pages = new Map<number, SynctexNode[]>()
  // Head pages 1..H — unchanged (reuse the last full compile's nodes; they already map to
  // `mainFile` at document line numbers on pages 1..H).
  for (let p = 1; p <= headPageCount; p++) {
    const hp = head.pages.get(p)
    if (hp) pages.set(p, hp)
  }
  offsetTailInto(pages, tail, headPageCount, tailLineOffset, tailMainTag, headMainTag)

  const { pageRoots, friendIndex } = rebuildDerived(pages)
  return {
    inputs: new Map(head.inputs),
    pages,
    pageRoots,
    friendIndex,
    magnification: head.magnification,
    unit: head.unit,
    xOffset: head.xOffset,
    yOffset: head.yOffset,
  }
}
