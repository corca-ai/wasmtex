import type { PdfLocation } from './text-mapper'
import { projectVisiblePdfText } from './visible-pdf-text'
import { VisibleTextCatalog, type VisibleTextQueryOptions } from './visible-text-catalog'
import type { NormalizedVisibleText } from './visible-text-normalize'
import type { VisibleTextSourceBlock, VisibleTextSourceProjection } from './visible-text-source'

export interface VisibleTextPdfPage {
  page: number
  text: string
  /** Original UTF-16 PDF extraction offsets; return separate line/run boxes. */
  rangeRects(start: number, end: number): readonly PdfLocation[]
}

export interface VisibleTextSourceMatch {
  fileId: string
  file: string
  documentVersion: number
  start: number
  end: number
  line: number
  column: number
  kind: VisibleTextSourceBlock['kind']
  structuralRange: VisibleTextSourceBlock['structuralRange']
  contextBefore: number
  contextAfter: number
}

export interface VisibleTextPdfMatch {
  page: number
  start: number
  end: number
  method: 'exact' | 'dehyphenated'
  regions: readonly PdfLocation[]
  contextBefore: number
  contextAfter: number
}

export interface VisibleTextIndexResult<T> {
  candidates: T[]
  truncated: boolean
}

interface SourceOwner {
  source: VisibleTextSourceProjection
  block: VisibleTextSourceBlock
}
interface PageOwner {
  page: VisibleTextPdfPage
  method: VisibleTextPdfMatch['method']
}

function sourcePosition(starts: Uint32Array, offset: number) {
  let low = 0
  let high = starts.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (starts[middle]! <= offset) low = middle + 1
    else high = middle
  }
  const lineIndex = Math.max(0, low - 1)
  return { line: lineIndex + 1, column: offset - (starts[lineIndex] ?? 0) + 1 }
}

/** Opt-in navigation evidence index. The host owns compile identity and selection. */
export class VisibleTextIndex {
  private sources = new Map<string, VisibleTextSourceProjection>()
  private sourceCatalog = new VisibleTextCatalog<SourceOwner>()
  private pages = new Map<number, VisibleTextPdfPage>()
  private pageCatalog = new VisibleTextCatalog<PageOwner>()
  private dehyphenatedCatalog = new VisibleTextCatalog<PageOwner>()
  private sourceTruncated = false

  /** Replaces the inventory: removed or renamed paths cannot leave stale candidates. */
  setSources(sources: readonly VisibleTextSourceProjection[]) {
    this.sources = new Map(sources.map((source) => [source.fileId, source]))
    this.sourceCatalog = new VisibleTextCatalog()
    this.sourceTruncated = false
    for (const source of this.sources.values()) {
      this.sourceTruncated ||= source.truncated
      for (const block of source.blocks) this.sourceCatalog.add({ source, block }, block)
    }
  }

  /** Bounded page LRU; call with the visible and neighboring pages, not every PDF page. */
  setPage(page: VisibleTextPdfPage) {
    if (!Number.isSafeInteger(page.page) || page.page < 1) throw new RangeError('Invalid PDF page')
    this.pages.delete(page.page)
    this.pages.set(page.page, page)
    if (this.pages.size > 8) this.pages.delete(this.pages.keys().next().value!)
    this.rebuildPages()
  }

  clearPages() {
    this.pages.clear()
    this.rebuildPages()
  }

  private rebuildPages() {
    this.pageCatalog = new VisibleTextCatalog()
    this.dehyphenatedCatalog = new VisibleTextCatalog()
    for (const page of this.pages.values()) {
      for (const variant of projectVisiblePdfText(page.text.slice(0, 250_000), true)) {
        const catalog = variant.method === 'exact' ? this.pageCatalog : this.dehyphenatedCatalog
        catalog.add({ page, method: variant.method }, variant.normalized)
      }
    }
  }

  findSources(
    text: string,
    options?: VisibleTextQueryOptions,
  ): VisibleTextIndexResult<VisibleTextSourceMatch> {
    const result = this.sourceCatalog.find(text, options)
    return {
      truncated: result.truncated || this.sourceTruncated,
      candidates: result.candidates.map(
        ({ owner: { source, block }, start, end, contextBefore, contextAfter }) => ({
          fileId: source.fileId,
          file: source.file,
          documentVersion: source.documentVersion,
          start,
          end,
          ...sourcePosition(source.lineStarts, start),
          kind: block.kind,
          structuralRange: block.structuralRange,
          contextBefore,
          contextAfter,
        }),
      ),
    }
  }

  findPdf(
    text: string,
    options?: VisibleTextQueryOptions & { dehyphenate?: boolean },
  ): VisibleTextIndexResult<VisibleTextPdfMatch> {
    let result = this.pageCatalog.find(text, options)
    // Never replace literal spelling evidence with the optional hyphen-removal path.
    if (!result.candidates.length && !result.truncated && options?.dehyphenate)
      result = this.dehyphenatedCatalog.find(text, options)
    return {
      truncated:
        result.truncated || [...this.pages.values()].some(({ text }) => text.length > 250_000),
      candidates: result.candidates.map(
        ({ owner: { page, method }, start, end, contextBefore, contextAfter }) => ({
          page: page.page,
          method,
          start,
          end,
          regions: page.rangeRects(start, end),
          contextBefore,
          contextAfter,
        }),
      ),
    }
  }

  /** Small source fragment at a compiled caret. No reparse or project scan on lookup. */
  sourceFragments(fileId: string, offset: number): readonly NormalizedVisibleText[] {
    const source = this.sources.get(fileId)
    if (!source || source.truncated || !Number.isSafeInteger(offset) || offset < 0) return []
    return source.blocks.flatMap((block) => {
      if (offset < (block.starts[0] ?? 0) || offset > (block.ends.at(-1) ?? 0)) return []
      let low = 0
      let high = block.ends.length
      while (low < high) {
        const middle = (low + high) >>> 1
        if (block.ends[middle]! <= offset) low = middle + 1
        else high = middle
      }
      const start = Math.max(0, low - 64)
      const end = Math.min(block.text.length, start + 160)
      return [
        {
          text: block.text.slice(start, end),
          starts: block.starts.slice(start, end),
          ends: block.ends.slice(start, end),
        },
      ]
    })
  }
}
