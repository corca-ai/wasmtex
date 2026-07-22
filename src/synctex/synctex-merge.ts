import type { SynctexData, SynctexNode } from './synctex-parser'

/**
 * Merge a tail's SyncTeX (from `compileFromCheckpoint`) onto the head pages of the last full
 * compile's SyncTeX, producing a complete SyncTeX for the spliced head+tail PDF (#99 Phase 2).
 * This lets an incremental fast paint carry EXACT SyncTeX so click-to-source works immediately
 * and the background full reconcile can be skipped for the servable (final) edit.
 *
 * The tail is compiled in isolation as a virtual file (`tailFile`, e.g. `tail.tex`) so its own
 * source lines are tail-relative and its pages start at 1. The merge:
 *   - keeps head pages `1..headPageCount` unchanged (their nodes already map to their real files);
 *   - offsets each tail page by `headPageCount`; rewrites `tailFile` nodes to the head's `mainFile`
 *     tag with their source lines offset by `tailLineOffset` (the head's line count); remaps each
 *     `\include`d chapter the tail loads to a fresh merged tag, keeping its real name and its
 *     file-relative lines — coordinates are per-page-relative, so they never move;
 *   - rebuilds `pageRoots`/`friendIndex` exactly as {@link SynctexParser} does.
 *
 * Multi-file aware: `\include`/`\input` chapters in the tail are handled per-file (their lines are
 * file-relative like in a full compile, only `tailFile`'s own lines are offset). Preconditions the
 * CALLER must guarantee: the head — the main-source prefix AND every file it bakes in — is unchanged
 * since the last full compile (so head pages `1..headPageCount` are still valid) and head/tail share
 * the preamble. Returns `null` (→ keep the last full SyncTeX and reconcile) when the expected
 * `mainFile`/`tailFile` input tags can't be found.
 */
export interface TailMergeInput {
  head: SynctexData
  tail: SynctexData
  headPageCount: number
  tailLineOffset: number
  mainFile: string
  tailFile: string
}

/** The tag for `name`: an exact match first, then a `/name` suffix match — mirroring the
 *  parser's `forwardLookup` so a subdirectory file sharing the basename can't win over the
 *  exact one. Null if neither matches. */
function findTag(inputs: Map<number, string>, name: string): number | null {
  for (const [tag, n] of inputs) if (n === name) return tag
  for (const [tag, n] of inputs) if (n.endsWith(`/${name}`)) return tag
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

/** Offset the tail's pages onto the spliced PDF, in place, remapping each node's input tag via
 *  `tagRemap` (a tag absent from the map — e.g. `.aux` bookkeeping — is dropped). Only the tail's
 *  own file (`tailMainTag` → the head's `mainFile`) gets its source lines offset; an `\include`d
 *  chapter's nodes keep their file-relative lines, matching a full compile. Coordinates are
 *  per-page relative, so they don't move. Mutating the freshly-parsed tail nodes in place is safe. */
function offsetTailInto(
  pages: Map<number, SynctexNode[]>,
  tail: SynctexData,
  headPageCount: number,
  tailLineOffset: number,
  tailMainTag: number,
  tagRemap: Map<number, number>,
): void {
  for (const [tp, nodes] of tail.pages) {
    const newPage = headPageCount + tp
    const kept: SynctexNode[] = []
    for (const node of nodes) {
      const remapped = tagRemap.get(node.input)
      if (remapped === undefined) continue // no merged tag (e.g. tail.aux / orphan) → drop
      node.page = newPage
      if (node.input === tailMainTag && node.line > 0) node.line += tailLineOffset
      node.input = remapped
      kept.push(node)
    }
    pages.set(newPage, kept)
  }
}

export function mergeTailSynctex(input: TailMergeInput): SynctexData | null {
  const { head, tail, headPageCount, tailLineOffset, mainFile, tailFile } = input
  const headMainTag = findTag(head.inputs, mainFile)
  const tailMainTag = findTag(tail.inputs, tailFile)
  if (headMainTag === null || tailMainTag === null) return null

  // Remap the tail's input tags into the merged tag space: the tail's own file → the head's main
  // file (its lines are offset to document lines); each `\include`d chapter → the head's tag for
  // that file if the head already loads it, else a FRESH tag above every head tag (real name kept,
  // file-relative lines unchanged). `.aux` bookkeeping (and any unnamed tag) is left out of the map
  // so its nodes are dropped. Fresh tags are `maxHeadTag + tailTag`, distinct from every head tag
  // and from each other, so head and tail files never collide.
  const maxHeadTag = [...head.inputs.keys()].reduce((m, t) => Math.max(m, t), 0)
  const tagRemap = new Map<number, number>([[tailMainTag, headMainTag]])
  const inputs = new Map(head.inputs)
  for (const [tag, name] of tail.inputs) {
    if (tag === tailMainTag || name.endsWith('.aux')) continue
    const merged = findTag(head.inputs, name) ?? maxHeadTag + tag
    tagRemap.set(tag, merged)
    if (!inputs.has(merged)) inputs.set(merged, name)
  }

  const pages = new Map<number, SynctexNode[]>()
  // Head pages 1..H — unchanged (reuse the last full compile's nodes; they already map to their
  // files at document line numbers on pages 1..H).
  for (let p = 1; p <= headPageCount; p++) {
    const hp = head.pages.get(p)
    if (hp) pages.set(p, hp)
  }
  offsetTailInto(pages, tail, headPageCount, tailLineOffset, tailMainTag, tagRemap)

  const { pageRoots, friendIndex } = rebuildDerived(pages)
  return {
    inputs,
    pages,
    pageRoots,
    friendIndex,
    magnification: head.magnification,
    unit: head.unit,
    xOffset: head.xOffset,
    yOffset: head.yOffset,
  }
}
