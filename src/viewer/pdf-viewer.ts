import * as pdfjsLib from 'pdfjs-dist'
import type { SynctexData } from '../synctex/synctex-parser'
import { SynctexParser } from '../synctex/synctex-parser'
import type { SourceLocation } from '../synctex/text-mapper'
import { TextMapper } from '../synctex/text-mapper'
import { PageRenderer } from './page-renderer'
import { pickMostVisiblePage } from './page-visibility'
import { RenderGate } from './render-gate'
import { clampScale, computeRestoredScrollTop, computeTargetOffsetTop } from './scale'

// Single shared worker instance — avoids re-fetching pdf.worker.mjs on every render.
// When consumed as a library, the consumer should set pdfjsLib.GlobalWorkerOptions.workerSrc
// in their own source so that their bundler resolves the worker file.
// Lazy-init: the first PdfViewer.render() call will create the worker if needed.
let pdfWorker: pdfjsLib.PDFWorker | null = null

function ensurePdfWorker(): pdfjsLib.PDFWorker {
  if (!pdfWorker) {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      console.warn(
        '[WasmTex] pdfjs-dist workerSrc is not configured. ' +
          'Set pdfjsLib.GlobalWorkerOptions.workerSrc before rendering PDFs. ' +
          'See the Integration Guide (docs/howto.md).',
      )
    }
    pdfWorker = new pdfjsLib.PDFWorker()
  }
  return pdfWorker
}

/** Configure the pdfjs-dist worker source.
 *
 *  **Must be called in the consumer's own source code** so that the consumer's
 *  bundler can resolve the worker file from `node_modules/pdfjs-dist`.
 *
 *  This helper is used by the bundled demo. Library consumers should place the
 *  equivalent `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)`
 *  expression in their own app source.
 */
export function configurePdfjsWorker(): void {
  if (pdfjsLib.GlobalWorkerOptions.workerSrc) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString()
}

export class PdfViewer {
  private container: HTMLElement
  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
  private currentPage = 1
  private scale = 1.5
  /** Scale at which the pages currently in the DOM were rendered — lets swapPages rescale
   *  the in-page scroll offset across a zoom so the view doesn't jump within the page. */
  private renderedScale = 1.5
  /** Single source of truth for which render is current; gates overlapping async renders. */
  private readonly gate = new RenderGate()
  private textMapper = new TextMapper()
  private synctexData: SynctexData | null = null
  private synctexParser = new SynctexParser()
  private onInverseSearch: ((loc: SourceLocation) => void) | null = null
  private pageObserver: IntersectionObserver | null = null
  /** Per-page visible height (px), updated from IntersectionObserver entries, used to
   *  pick the current page robustly even for pages taller than the viewport. */
  private readonly pageVisibility = new Map<number, number>()
  private pageRenderer = new PageRenderer()
  private lastPdf: Uint8Array | null = null
  private toolbarHidden = false
  private intrinsicPageWidth = 0
  /** The document the text-fallback index currently covers; lets a re-render skip
   *  redundant reindexing while still rebuilding after an interrupted indexing. */
  private indexedDoc: pdfjsLib.PDFDocumentProxy | null = null
  /** Per-page intrinsic size (width at scale 1 + scale-independent aspect ratio),
   *  cached as pages render so placeholders for not-yet-rendered pages are sized to
   *  their OWN dimensions rather than the visible page's. Indexed by page-1. */
  private pageSizes: Array<{ width: number; aspectRatio: string } | undefined> = []

  private loadingOverlay: HTMLElement | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.buildLoadingOverlay()
    this.buildControls()
  }

  /** Register callback for inverse search (Cmd/Ctrl+click on PDF → source location) */
  setInverseSearchHandler(handler: (loc: SourceLocation) => void): void {
    this.onInverseSearch = handler
  }

  /** Set source content for text-based inverse search (fallback) */
  setSourceContent(file: string, content: string): void {
    this.textMapper.setSource(file, content)
  }

  /**
   * Replace the full set of source files used for text-based inverse search.
   * Dropping stale entries prevents clicks from jumping to deleted/renamed files.
   */
  setSources(sources: Iterable<readonly [string, string]>): void {
    this.textMapper.setSources(sources)
  }

  /** Set parsed SyncTeX data for precise PDF↔source sync */
  setSynctexData(data: SynctexData | null): void {
    this.synctexData = data
  }

  /** Get the last rendered PDF data for download. */
  getLastPdf(): Uint8Array | null {
    return this.lastPdf
  }

  /** Set the download button click handler. */
  setDownloadHandler(handler: () => void): void {
    this.downloadBtn.onclick = handler
  }

  private controlsEl!: HTMLElement
  private pageInfo!: HTMLSpanElement
  private pagesContainer!: HTMLElement
  private downloadBtn!: HTMLButtonElement

  private buildLoadingOverlay(): void {
    const overlay = document.createElement('div')
    overlay.className = 'pdf-loading-overlay'
    overlay.innerHTML =
      '<div class="pdf-loading-text">Loading engine...</div>' +
      '<div class="pdf-loading-bar"><div class="pdf-loading-bar-fill"></div></div>'
    this.container.appendChild(overlay)
    this.loadingOverlay = overlay
  }

  /** Update the loading overlay status. Hides overlay on first render. */
  setLoadingStatus(status: string): void {
    if (!this.loadingOverlay) return
    const text = this.loadingOverlay.querySelector('.pdf-loading-text')
    if (text) text.textContent = status
    const fill = this.loadingOverlay.querySelector<HTMLElement>('.pdf-loading-bar-fill')
    if (fill) {
      if (status.includes('Loading engine')) fill.style.width = '20%'
      else if (status.includes('fetching')) {
        // Incrementally increase bar as we fetch more files
        const currentWidth = Number.parseFloat(fill.style.width || '20')
        fill.style.width = `${Math.min(currentWidth + 0.5, 75)}%`
      } else if (status.includes('Compiling')) fill.style.width = '50%'
      else if (status.includes('Rendering')) fill.style.width = '80%'
    }
  }

  private removeLoadingOverlay(): void {
    if (this.loadingOverlay) {
      this.loadingOverlay.remove()
      this.loadingOverlay = null
    }
  }

  private buildControls(): void {
    this.controlsEl = document.createElement('div')
    this.controlsEl.className = 'pdf-controls'
    this.controlsEl.style.display = 'none'

    this.pageInfo = document.createElement('span')
    this.pageInfo.textContent = '0 / 0'

    const zoomOut = document.createElement('button')
    zoomOut.textContent = '-'
    zoomOut.onclick = () => this.zoom(-0.25)

    const zoomLabel = document.createElement('span')
    zoomLabel.className = 'zoom-label'
    zoomLabel.textContent = `${Math.round(this.scale * 100)}%`
    zoomLabel.ondblclick = () => {
      this.scale = 1.0
      this.updateZoomLabel()
      if (this.pdfDoc) {
        const generation = this.gate.begin()
        this.renderAllPages(generation)
      }
    }
    this.zoomLabel = zoomLabel

    const zoomIn = document.createElement('button')
    zoomIn.textContent = '+'
    zoomIn.onclick = () => this.zoom(0.25)

    this.downloadBtn = document.createElement('button')
    this.downloadBtn.className = 'pdf-download-btn'
    this.downloadBtn.textContent = 'PDF'
    this.downloadBtn.title = 'Download PDF'
    this.downloadBtn.style.display = 'none'

    this.controlsEl.append(this.pageInfo, zoomOut, zoomLabel, zoomIn, this.downloadBtn)
    // Don't append controlsEl here — inserted on first show via render() or
    // setToolbarVisible(true). Keeps it fully out of the DOM when toolbar=false.

    this.pagesContainer = document.createElement('div')
    this.container.appendChild(this.pagesContainer)

    // Single delegated click handler for inverse search — avoids duplicate
    // listeners that accumulate when canvases are recycled across renders.
    this.pagesContainer.addEventListener('click', (e) => {
      if (!this.onInverseSearch) return
      const target = e.target
      if (!(target instanceof HTMLCanvasElement)) return

      const wrapper = target.closest('.pdf-page-container') as HTMLElement | null
      if (!wrapper) return
      const pageNum = parseInt(wrapper.dataset.pageNum ?? '0', 10)
      if (pageNum === 0) return

      // Divide by the scale the in-DOM canvas was actually PAINTED at (renderedScale), not
      // the synchronously-advanced this.scale: zoom()/setScale()/dblclick bump this.scale
      // immediately but renderedScale only updates after the async re-render (swapPages). In
      // that in-flight window the rect getBoundingClientRect measures is still the old size,
      // so this.scale would map the click to the wrong PDF coordinate. Equal in steady state.
      const rect = target.getBoundingClientRect()
      const x = (e.clientX - rect.left) / this.renderedScale
      const y = (e.clientY - rect.top) / this.renderedScale

      let loc: SourceLocation | null = null
      if (this.synctexData) {
        loc = this.synctexParser.inverseLookup(this.synctexData, pageNum, x, y)
      }
      if (!loc) {
        loc = this.textMapper.lookup(pageNum, x, y)
      }
      if (loc) this.onInverseSearch(loc)
    })
  }

  private zoomLabel!: HTMLSpanElement

  private updateZoomLabel(): void {
    this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`
  }

  async render(pdfData: Uint8Array): Promise<number> {
    const start = performance.now()
    const generation = this.gate.begin()

    const oldDoc = this.pdfDoc

    // Load into a LOCAL doc and only adopt it once we're still the current render. A
    // superseded render's claim() destroys this freshly-loaded doc and returns null, so
    // `this.pdfDoc` is never overwritten by — nor left pointing at — a destroyed doc.
    const loaded = await pdfjsLib.getDocument({ data: pdfData.slice(), worker: ensurePdfWorker() })
      .promise
    if (!this.gate.claim(loaded, generation)) return performance.now() - start

    // Cache intrinsic page width for synchronous fitToWidth()
    const p1 = await loaded.getPage(1)
    if (!this.gate.claim(loaded, generation)) return performance.now() - start

    // We are the current render: adopt the doc and retire the previous one.
    const doc = loaded
    this.pdfDoc = doc
    // Commit the download copy only now that the render is confirmed current, so
    // getLastPdf() always matches what's displayed. pdf.js detaches the buffer it
    // transfers to its worker, but it received a separate pdfData.slice() above, so
    // the original pdfData is still intact and slice-able here.
    this.lastPdf = pdfData.slice()
    // New document — drop the previous doc's per-page sizes so they can't size
    // this doc's placeholders (zoom/setScale keep them, since they don't re-render).
    this.pageSizes = []
    this.intrinsicPageWidth = p1.getViewport({ scale: 1 }).width

    this.removeLoadingOverlay()
    if (!this.toolbarHidden) {
      this.container.insertBefore(this.controlsEl, this.pagesContainer)
      this.controlsEl.style.display = 'flex'
    }
    this.downloadBtn.style.display = ''

    // Clamp current page. When the recompiled doc has fewer pages than the one being viewed,
    // the captured scroll position refers to a page that no longer exists, so the swap must
    // anchor the new page 1 at its top rather than applying a stale multi-page offset.
    let anchorToTop = false
    if (this.currentPage > doc.numPages) {
      this.currentPage = 1
      anchorToTop = true
    }

    await this.renderAllPages(generation, anchorToTop)
    // renderAllPages reindexes the text mapper at the end, so a zoom/setScale that
    // supersedes this render restarts the indexing instead of abandoning it.

    // Destroy old document after swap — defer to let any pending getPage()
    // promises from previous fitToWidth() calls settle first.
    if (oldDoc) {
      queueMicrotask(() => oldDoc.destroy())
    }

    return performance.now() - start
  }

  private async renderAllPages(generation: number, anchorToTop = false): Promise<void> {
    if (!this.pdfDoc) return

    const numPages = this.pdfDoc.numPages
    this.pageInfo.textContent = `Page ${this.currentPage} / ${numPages}`

    // Save old wrappers — reused as placeholders to keep previous content visible
    // instead of showing blank divs (prevents flicker on non-visible pages).
    const oldWrappers = Array.from(
      this.pagesContainer.querySelectorAll('.pdf-page-container'),
    ) as HTMLElement[]

    // Phase 1: Render the current (visible) page to a NEW offscreen canvas.
    // Don't recycle anything yet — old canvases are still visible in the DOM.
    const visiblePage = Math.min(this.currentPage, numPages)
    if (!this.gate.isCurrent(generation)) return

    let firstResult: Awaited<ReturnType<PageRenderer['renderPage']>>
    try {
      firstResult = await this.pageRenderer.renderPage(this.pdfDoc, visiblePage, this.scale)
    } catch {
      // pdfDoc destroyed during concurrent render — skip silently
      return
    }
    if (!this.gate.isCurrent(generation)) {
      // Superseded mid-flight (e.g. a newer zoom/recompile): the freshly-rendered canvas was
      // never put in the DOM, so recycle it back into the pool instead of leaking the slot.
      this.pageRenderer.recycle([firstResult.canvas])
      return
    }
    this.cachePageSize(visiblePage, firstResult.canvas)

    const wrappers = this.buildPageWrappers(numPages, visiblePage, firstResult.wrapper, oldWrappers)
    this.swapPages(wrappers, visiblePage, anchorToTop)

    // The visible page's old wrapper is now out of the DOM — safe to recycle its canvas
    const visibleOldCanvas = oldWrappers[visiblePage - 1]?.querySelector('canvas')
    if (visibleOldCanvas) this.pageRenderer.recycle([visibleOldCanvas as HTMLCanvasElement])

    // When the new document has FEWER pages (e.g. \includeonly, commenting out sections), the
    // trailing old wrappers (numPages..oldCount-1) are dropped by swapPages' replaceChildren and
    // never reused by buildPageWrappers/renderRemainingPages — recycle their canvases too, else
    // grow/shrink oscillation permanently drains the reuse pool.
    for (let i = numPages; i < oldWrappers.length; i++) {
      const droppedCanvas = oldWrappers[i]?.querySelector('canvas')
      if (droppedCanvas) this.pageRenderer.recycle([droppedCanvas as HTMLCanvasElement])
    }

    // Phase 2: Render remaining pages
    await this.renderRemainingPages(generation, numPages, visiblePage, wrappers)

    // Keep the text-fallback index in sync. Done from every render path (incl.
    // zoom) so a zoom that superseded an in-flight indexing run rebuilds it.
    if (this.pdfDoc) await this.reindexTextMapper(generation, this.pdfDoc)
  }

  /** (Re)build the text-fallback index for `doc`, gated by `generation` so a newer
   *  render supersedes it. Skips when `doc` is already fully indexed. The text
   *  mapper indexes at scale 1, so this is scale-independent (zoom-safe). */
  private async reindexTextMapper(
    generation: number,
    doc: pdfjsLib.PDFDocumentProxy,
  ): Promise<void> {
    if (!this.gate.isCurrent(generation)) return
    if (this.indexedDoc === doc) return // already fully indexed for this document
    this.textMapper.clear()
    for (let i = 1; i <= doc.numPages; i++) {
      // A newer render must not interleave another document's pages; leave
      // indexedDoc unset so the superseding render re-indexes from scratch.
      if (!this.gate.isCurrent(generation)) return
      try {
        const page = await doc.getPage(i)
        await this.textMapper.indexPage(page, i)
      } catch {
        // doc destroyed during a concurrent render (this runs fire-and-forget from
        // zoom/setScale) — abandon indexing; the superseding render reindexes from scratch.
        // Mirrors the renderPage destroy-during-await guard; without it the rejection
        // escapes as an unhandledrejection on the zoom path.
        return
      }
    }
    this.indexedDoc = doc
  }

  /** Cache a rendered page's intrinsic size for sizing future placeholders. */
  private cachePageSize(pageNum: number, canvas: HTMLCanvasElement): void {
    const scaledWidth = Number.parseFloat(canvas.style.width)
    if (!Number.isFinite(scaledWidth) || this.scale <= 0) return
    this.pageSizes[pageNum - 1] = {
      width: scaledWidth / this.scale,
      aspectRatio: canvas.style.aspectRatio,
    }
  }

  /** Render non-visible pages and swap them into the DOM one by one. */
  private async renderRemainingPages(
    generation: number,
    numPages: number,
    visiblePage: number,
    wrappers: HTMLElement[],
  ): Promise<void> {
    if (!this.pdfDoc) return

    for (let i = 1; i <= numPages; i++) {
      if (i === visiblePage) continue
      if (!this.gate.isCurrent(generation)) return

      let result: Awaited<ReturnType<PageRenderer['renderPage']>>
      try {
        result = await this.pageRenderer.renderPage(this.pdfDoc, i, this.scale)
      } catch {
        // pdfDoc destroyed during concurrent render — skip silently
        return
      }
      if (!this.gate.isCurrent(generation)) {
        // Superseded mid-flight: recycle the unused canvas so the reuse pool isn't depleted.
        this.pageRenderer.recycle([result.canvas])
        return
      }
      this.cachePageSize(i, result.canvas)

      // Old wrapper's canvas is still in DOM — recycle after replacement
      const oldCanvas = wrappers[i - 1]?.querySelector('canvas')
      wrappers[i - 1]!.replaceWith(result.wrapper)
      wrappers[i - 1] = result.wrapper
      if (oldCanvas) this.pageRenderer.recycle([oldCanvas as HTMLCanvasElement])
    }

    // Re-observe after all pages are real
    this.observePages()
  }

  /** Build page wrapper elements (rendered page + old wrappers as placeholders) */
  private buildPageWrappers(
    numPages: number,
    visiblePage: number,
    renderedWrapper: HTMLElement,
    oldWrappers: HTMLElement[],
  ): HTMLElement[] {
    const wrappers = new Array<HTMLElement>(numPages)
    const canvas = renderedWrapper.querySelector('canvas')!
    const pageWidth = canvas.style.width
    const pageAspectRatio = canvas.style.aspectRatio
    for (let i = 1; i <= numPages; i++) {
      if (i === visiblePage) {
        wrappers[i - 1] = renderedWrapper
      } else if (oldWrappers[i - 1]) {
        // Reuse old wrapper to keep previous content visible (no blank flash)
        wrappers[i - 1] = oldWrappers[i - 1]!
      } else {
        // New page with no previous content — sized placeholder. Prefer this
        // page's OWN cached dimensions (non-uniform docs mix page sizes); fall
        // back to the visible page's only when this page hasn't been seen yet.
        const placeholder = document.createElement('div')
        placeholder.className = 'pdf-page-container'
        placeholder.dataset.pageNum = String(i)
        const own = this.pageSizes[i - 1]
        if (own) {
          placeholder.style.width = `${own.width * this.scale}px`
          placeholder.style.aspectRatio = own.aspectRatio
        } else {
          placeholder.style.width = pageWidth
          placeholder.style.aspectRatio = pageAspectRatio
        }
        wrappers[i - 1] = placeholder
      }
    }
    return wrappers
  }

  /** Swap page DOM and restore scroll position within the current page */
  private swapPages(wrappers: HTMLElement[], visiblePage: number, anchorToTop = false): void {
    // Capture scroll position BEFORE building fragment — appendChild moves
    // old wrappers out of the DOM, which changes their offsetTop.
    const oldPageEl = this.pagesContainer.querySelector(
      `.pdf-page-container[data-page-num="${visiblePage}"]`,
    ) as HTMLElement | null
    // Captured at the OLD scale (oldPageEl is still the pre-swap DOM). The offset is rescaled to
    // the new scale (zoom) and discarded entirely when the viewed page no longer exists
    // (anchorToTop) so the swap can't scroll past a shrunken document.
    const scrollTop = this.container.scrollTop
    const oldPageOffsetTop = oldPageEl ? oldPageEl.offsetTop : null

    const fragment = document.createDocumentFragment()
    for (const w of wrappers) fragment.appendChild(w)

    this.pagesContainer.replaceChildren(fragment)

    const target = wrappers[visiblePage - 1]
    if (target) {
      // Use the visible page's offset computed from cached intrinsic sizes at the NEW scale,
      // not the live `target.offsetTop`: at swap time the preceding pages are still rendered at
      // the OLD scale (renderRemainingPages rescales them afterwards), so reading offsetTop here
      // would anchor the view to a stale position and jump once those pages rescale. Falls back
      // to the live offset when no preceding page has a cached size yet.
      const computedOffset = computeTargetOffsetTop(this.pageSizes, visiblePage, this.scale)
      const newTargetOffsetTop = computedOffset > 0 ? computedOffset : target.offsetTop
      this.container.scrollTop = computeRestoredScrollTop({
        scrollTop,
        oldPageOffsetTop,
        newTargetOffsetTop,
        oldScale: this.renderedScale,
        newScale: this.scale,
        anchorToTop,
      })
    }
    // Pages in the DOM now reflect this.scale — record it for the next swap's rescale.
    this.renderedScale = this.scale
    this.observePages()
  }

  /** Track which page is most visible via IntersectionObserver */
  private observePages(): void {
    if (this.pageObserver) {
      this.pageObserver.disconnect()
    }
    this.pageVisibility.clear()

    this.pageObserver = new IntersectionObserver(
      (entries) => {
        // Track each page's visible height and pick the most-visible. A fixed 0.5
        // threshold never fires for pages taller than ~2× the viewport, leaving the
        // indicator (and the zoom anchor that reads currentPage) stale; the multi-step
        // threshold + greatest-visible-height selection is robust for any page height.
        for (const entry of entries) {
          const pageNum = parseInt((entry.target as HTMLElement).dataset.pageNum ?? '1', 10)
          this.pageVisibility.set(pageNum, entry.isIntersecting ? entry.intersectionRect.height : 0)
        }
        const page = pickMostVisiblePage(this.pageVisibility)
        if (page !== null) {
          this.currentPage = page
          if (this.pdfDoc) {
            this.pageInfo.textContent = `Page ${page} / ${this.pdfDoc.numPages}`
          }
        }
      },
      { root: this.container, threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] },
    )

    for (const wrapper of this.pagesContainer.querySelectorAll('.pdf-page-container')) {
      this.pageObserver.observe(wrapper)
    }
  }

  /** Set the absolute zoom scale (clamped to MIN_SCALE–MAX_SCALE). */
  setScale(scale: number): void {
    this.scale = clampScale(scale)
    this.updateZoomLabel()
    if (this.pdfDoc) {
      const generation = this.gate.begin()
      this.renderAllPages(generation)
    }
  }

  /** Zoom to fit the page width inside the container.
   *  Synchronous — safe to call from resize/ResizeObserver handlers. */
  fitToWidth(): void {
    if (!this.intrinsicPageWidth) return
    const availableWidth = this.container.clientWidth - 16
    if (availableWidth <= 0) return
    this.setScale(availableWidth / this.intrinsicPageWidth)
  }

  /** Show or hide the toolbar (zoom controls, page info, download button). */
  setToolbarVisible(visible: boolean): void {
    this.toolbarHidden = !visible
    if (visible) {
      this.container.insertBefore(this.controlsEl, this.pagesContainer)
      this.controlsEl.style.display = 'flex'
    } else {
      this.controlsEl.remove()
    }
  }

  private zoom(delta: number): void {
    // Same range as setScale/fitToWidth, so the +/- buttons can't snap a fit-to-width
    // scale into a different bound.
    this.scale = clampScale(this.scale + delta)
    this.updateZoomLabel()
    if (this.pdfDoc) {
      const generation = this.gate.begin()
      this.renderAllPages(generation)
    }
  }

  /** Forward search: highlight a source location in the PDF */
  forwardSearch(file: string, line: number): void {
    let locations = this.synctexData
      ? this.synctexParser.forwardLookupAll(this.synctexData, file, line)
      : []

    if (locations.length === 0) {
      const fallback = this.textMapper.forwardLookup(file, line)
      if (fallback) locations = [fallback]
    }

    const primary = locations[0]
    if (!primary) return

    // Find the page wrapper
    const pages = this.pagesContainer.querySelectorAll('.pdf-page-container')
    const pageEl = pages[primary.page - 1]
    if (!pageEl) return

    // Remove previous highlight
    for (const el of this.pagesContainer.querySelectorAll('.forward-search-highlight')) {
      el.remove()
    }
    // Page wrapper needs relative positioning for absolute child
    ;(pageEl as HTMLElement).style.position = 'relative'

    for (const loc of locations) {
      // A display query selects one page; keep the guard explicit for fallback
      // implementations or future page-hint support.
      if (loc.page !== primary.page) continue

      const highlight = document.createElement('div')
      highlight.className = 'forward-search-highlight'
      // Position relative to the canvas as currently PAINTED (renderedScale), not the
      // synchronously-advanced this.scale — during an in-flight zoom they differ and this.scale
      // would offset the overlay from the page it sits on. Equal in steady state.
      highlight.style.cssText = [
        'position: absolute',
        `left: ${loc.x * this.renderedScale}px`,
        `top: ${loc.y * this.renderedScale}px`,
        `width: ${Math.max(loc.width * this.renderedScale, 200)}px`,
        `height: ${Math.max(loc.height * this.renderedScale, 20)}px`,
        'background: rgba(255, 200, 0, 0.3)',
        'border: none',
        'pointer-events: none',
        'transition: opacity 0.5s',
      ].join(';')
      pageEl.appendChild(highlight)

      // Fade out after 2s
      setTimeout(() => {
        highlight.style.opacity = '0'
        setTimeout(() => highlight.remove(), 500)
      }, 2000)
    }

    // Scroll to the page
    pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /** Tear down the viewer: invalidate any in-flight render, disconnect the page
   *  IntersectionObserver, and destroy the last PDFDocumentProxy so neither leaks
   *  for the lifetime of the host page. Safe to call more than once. */
  destroy(): void {
    // Supersede any in-flight render so it can't re-adopt a doc or re-observe.
    this.gate.begin()
    if (this.pageObserver) {
      this.pageObserver.disconnect()
      this.pageObserver = null
    }
    if (this.pdfDoc) {
      const doc = this.pdfDoc
      this.pdfDoc = null
      queueMicrotask(() => doc.destroy())
    }
    this.indexedDoc = null
    this.pageSizes = []
    this.pagesContainer.replaceChildren()
    this.controlsEl.remove()
    this.loadingOverlay?.remove()
    this.loadingOverlay = null
    this.lastPdf = null
  }
}
