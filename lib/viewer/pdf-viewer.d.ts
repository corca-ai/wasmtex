import { SynctexData } from '../synctex/synctex-parser';
import { SourceLocation } from '../synctex/text-mapper';
/** Configure the pdfjs-dist worker source.
 *
 *  **Must be called in the consumer's own source code** so that the consumer's
 *  bundler can resolve the worker file from `node_modules/pdfjs-dist`.
 *
 *  This helper is used by the bundled demo. Library consumers should place the
 *  equivalent `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)`
 *  expression in their own app source.
 */
export declare function configurePdfjsWorker(): void;
export declare class PdfViewer {
    private container;
    private pdfDoc;
    private currentPage;
    private scale;
    /** Scale at which the pages currently in the DOM were rendered — lets swapPages rescale
     *  the in-page scroll offset across a zoom so the view doesn't jump within the page. */
    private renderedScale;
    /** Single source of truth for which render is current; gates overlapping async renders. */
    private readonly gate;
    private textMapper;
    private synctexData;
    private synctexParser;
    private onInverseSearch;
    private pageObserver;
    /** Per-page visible height (px), updated from IntersectionObserver entries, used to
     *  pick the current page robustly even for pages taller than the viewport. */
    private readonly pageVisibility;
    private pageRenderer;
    private lastPdf;
    private toolbarHidden;
    private intrinsicPageWidth;
    /** The document the text-fallback index currently covers; lets a re-render skip
     *  redundant reindexing while still rebuilding after an interrupted indexing. */
    private indexedDoc;
    /** Per-page intrinsic size (width at scale 1 + scale-independent aspect ratio),
     *  cached as pages render so placeholders for not-yet-rendered pages are sized to
     *  their OWN dimensions rather than the visible page's. Indexed by page-1. */
    private pageSizes;
    private loadingOverlay;
    constructor(container: HTMLElement);
    /** Register callback for inverse search (Cmd/Ctrl+click on PDF → source location) */
    setInverseSearchHandler(handler: (loc: SourceLocation) => void): void;
    /** Set source content for text-based inverse search (fallback) */
    setSourceContent(file: string, content: string): void;
    /**
     * Replace the full set of source files used for text-based inverse search.
     * Dropping stale entries prevents clicks from jumping to deleted/renamed files.
     */
    setSources(sources: Iterable<readonly [string, string]>): void;
    /** Set parsed SyncTeX data for precise PDF↔source sync */
    setSynctexData(data: SynctexData | null): void;
    /** Get the last rendered PDF data for download. */
    getLastPdf(): Uint8Array | null;
    /** Set the download button click handler. */
    setDownloadHandler(handler: () => void): void;
    private controlsEl;
    private pageInfo;
    private pagesContainer;
    private downloadBtn;
    private buildLoadingOverlay;
    /** Update the loading overlay status. Hides overlay on first render. */
    setLoadingStatus(status: string): void;
    private removeLoadingOverlay;
    private buildControls;
    private zoomLabel;
    private updateZoomLabel;
    render(pdfData: Uint8Array): Promise<number>;
    private renderAllPages;
    /** (Re)build the text-fallback index for `doc`, gated by `generation` so a newer
     *  render supersedes it. Skips when `doc` is already fully indexed. The text
     *  mapper indexes at scale 1, so this is scale-independent (zoom-safe). */
    private reindexTextMapper;
    /** Cache a rendered page's intrinsic size for sizing future placeholders. */
    private cachePageSize;
    /** Render non-visible pages and swap them into the DOM one by one. */
    private renderRemainingPages;
    /** Build page wrapper elements (rendered page + old wrappers as placeholders) */
    private buildPageWrappers;
    /** Swap page DOM and restore scroll position within the current page */
    private swapPages;
    /** Track which page is most visible via IntersectionObserver */
    private observePages;
    /** Set the absolute zoom scale (clamped to MIN_SCALE–MAX_SCALE). */
    setScale(scale: number): void;
    /** Zoom to fit the page width inside the container.
     *  Synchronous — safe to call from resize/ResizeObserver handlers. */
    fitToWidth(): void;
    /** Show or hide the toolbar (zoom controls, page info, download button). */
    setToolbarVisible(visible: boolean): void;
    private zoom;
    /** Forward search: highlight a source location in the PDF */
    forwardSearch(file: string, line: number): void;
    /** Tear down the viewer: invalidate any in-flight render, disconnect the page
     *  IntersectionObserver, and destroy the last PDFDocumentProxy so neither leaks
     *  for the lifetime of the host page. Safe to call more than once. */
    destroy(): void;
}
