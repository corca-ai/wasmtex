import type * as pdfjsLib from 'pdfjs-dist'

interface PageRenderResult {
  wrapper: HTMLDivElement
  canvas: HTMLCanvasElement
  pageNum: number
}

/** Renders PDF pages to canvases. Separated from PdfViewer for testability
 *  and to isolate future optimizations (canvas reuse, visible-first, etc.). */
export class PageRenderer {
  private canvasPool: HTMLCanvasElement[] = []

  /** Render a single page into a wrapper div with canvas.
   *  Reuses canvases from the pool when available. */
  async renderPage(
    doc: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    scale: number,
  ): Promise<PageRenderResult> {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale })

    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-page-container'
    wrapper.dataset.pageNum = String(pageNum)

    const canvas = this.acquireCanvas()
    const dpr = window.devicePixelRatio || 1
    const pxWidth = Math.floor(viewport.width * dpr)
    const pxHeight = Math.floor(viewport.height * dpr)

    // Only resize if dimensions changed (avoids clearing a reusable canvas unnecessarily)
    if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
      canvas.width = pxWidth
      canvas.height = pxHeight
    }
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    await page.render({ canvasContext: ctx, viewport, canvas }).promise

    wrapper.appendChild(canvas)
    return { wrapper, canvas, pageNum }
  }

  /** Return canvases to the pool for reuse. */
  recycle(canvases: HTMLCanvasElement[]): void {
    for (const c of canvases) {
      this.canvasPool.push(c)
    }
  }

  private acquireCanvas(): HTMLCanvasElement {
    return this.canvasPool.pop() ?? document.createElement('canvas')
  }
}
