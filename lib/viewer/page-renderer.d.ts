import type * as pdfjsLib from 'pdfjs-dist';
interface PageRenderResult {
    wrapper: HTMLDivElement;
    canvas: HTMLCanvasElement;
    pageNum: number;
}
/** Renders PDF pages to canvases. Separated from PdfViewer for testability
 *  and to isolate future optimizations (canvas reuse, visible-first, etc.). */
export declare class PageRenderer {
    private canvasPool;
    /** Render a single page into a wrapper div with canvas.
     *  Reuses canvases from the pool when available. */
    renderPage(doc: pdfjsLib.PDFDocumentProxy, pageNum: number, scale: number): Promise<PageRenderResult>;
    /** Return canvases to the pool for reuse. */
    recycle(canvases: HTMLCanvasElement[]): void;
    private acquireCanvas;
}
export {};
