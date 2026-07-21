import * as p from "pdfjs-dist";
import { SynctexParser as f } from "../synctex/synctex-parser.js";
import { TextMapper as u } from "../synctex/text-mapper.js";
import { PageRenderer as m } from "./page-renderer.js";
import { pickMostVisiblePage as y } from "./page-visibility.js";
import { RenderGate as w } from "./render-gate.js";
import { computeTargetOffsetTop as v, computeRestoredScrollTop as b, clampScale as g } from "./scale.js";
let h = null;
function P() {
  return h || (p.GlobalWorkerOptions.workerSrc || console.warn(
    "[WasmTex] pdfjs-dist workerSrc is not configured. Set pdfjsLib.GlobalWorkerOptions.workerSrc before rendering PDFs. See the Integration Guide (docs/howto.md)."
  ), h = new p.PDFWorker()), h;
}
class R {
  container;
  pdfDoc = null;
  currentPage = 1;
  scale = 1.5;
  /** Scale at which the pages currently in the DOM were rendered — lets swapPages rescale
   *  the in-page scroll offset across a zoom so the view doesn't jump within the page. */
  renderedScale = 1.5;
  /** Single source of truth for which render is current; gates overlapping async renders. */
  gate = new w();
  textMapper = new u();
  synctexData = null;
  synctexParser = new f();
  onInverseSearch = null;
  pageObserver = null;
  /** Per-page visible height (px), updated from IntersectionObserver entries, used to
   *  pick the current page robustly even for pages taller than the viewport. */
  pageVisibility = /* @__PURE__ */ new Map();
  pageRenderer = new m();
  lastPdf = null;
  toolbarHidden = !1;
  intrinsicPageWidth = 0;
  /** The document the text-fallback index currently covers; lets a re-render skip
   *  redundant reindexing while still rebuilding after an interrupted indexing. */
  indexedDoc = null;
  /** Per-page intrinsic size (width at scale 1 + scale-independent aspect ratio),
   *  cached as pages render so placeholders for not-yet-rendered pages are sized to
   *  their OWN dimensions rather than the visible page's. Indexed by page-1. */
  pageSizes = [];
  loadingOverlay = null;
  constructor(e) {
    this.container = e, this.buildLoadingOverlay(), this.buildControls();
  }
  /** Register callback for inverse search (Cmd/Ctrl+click on PDF → source location) */
  setInverseSearchHandler(e) {
    this.onInverseSearch = e;
  }
  /** Set source content for text-based inverse search (fallback) */
  setSourceContent(e, s) {
    this.textMapper.setSource(e, s);
  }
  /**
   * Replace the full set of source files used for text-based inverse search.
   * Dropping stale entries prevents clicks from jumping to deleted/renamed files.
   */
  setSources(e) {
    this.textMapper.setSources(e);
  }
  /** Set parsed SyncTeX data for precise PDF↔source sync */
  setSynctexData(e) {
    this.synctexData = e;
  }
  /** Get the last rendered PDF data for download. */
  getLastPdf() {
    return this.lastPdf;
  }
  /** Set the download button click handler. */
  setDownloadHandler(e) {
    this.downloadBtn.onclick = e;
  }
  controlsEl;
  pageInfo;
  pagesContainer;
  downloadBtn;
  buildLoadingOverlay() {
    const e = document.createElement("div");
    e.className = "pdf-loading-overlay", e.innerHTML = '<div class="pdf-loading-text">Loading engine...</div><div class="pdf-loading-bar"><div class="pdf-loading-bar-fill"></div></div>', this.container.appendChild(e), this.loadingOverlay = e;
  }
  /** Update the loading overlay status. Hides overlay on first render. */
  setLoadingStatus(e) {
    if (!this.loadingOverlay) return;
    const s = this.loadingOverlay.querySelector(".pdf-loading-text");
    s && (s.textContent = e);
    const t = this.loadingOverlay.querySelector(".pdf-loading-bar-fill");
    if (t)
      if (e.includes("Loading engine")) t.style.width = "20%";
      else if (e.includes("fetching")) {
        const n = Number.parseFloat(t.style.width || "20");
        t.style.width = `${Math.min(n + 0.5, 75)}%`;
      } else e.includes("Compiling") ? t.style.width = "50%" : e.includes("Rendering") && (t.style.width = "80%");
  }
  removeLoadingOverlay() {
    this.loadingOverlay && (this.loadingOverlay.remove(), this.loadingOverlay = null);
  }
  buildControls() {
    this.controlsEl = document.createElement("div"), this.controlsEl.className = "pdf-controls", this.controlsEl.style.display = "none", this.pageInfo = document.createElement("span"), this.pageInfo.textContent = "0 / 0";
    const e = document.createElement("button");
    e.textContent = "-", e.onclick = () => this.zoom(-0.25);
    const s = document.createElement("span");
    s.className = "zoom-label", s.textContent = `${Math.round(this.scale * 100)}%`, s.ondblclick = () => {
      if (this.scale = 1, this.updateZoomLabel(), this.pdfDoc) {
        const n = this.gate.begin();
        this.renderAllPages(n);
      }
    }, this.zoomLabel = s;
    const t = document.createElement("button");
    t.textContent = "+", t.onclick = () => this.zoom(0.25), this.downloadBtn = document.createElement("button"), this.downloadBtn.className = "pdf-download-btn", this.downloadBtn.textContent = "PDF", this.downloadBtn.title = "Download PDF", this.downloadBtn.style.display = "none", this.controlsEl.append(this.pageInfo, e, s, t, this.downloadBtn), this.pagesContainer = document.createElement("div"), this.container.appendChild(this.pagesContainer), this.pagesContainer.addEventListener("click", (n) => {
      if (!this.onInverseSearch) return;
      const i = n.target;
      if (!(i instanceof HTMLCanvasElement)) return;
      const a = i.closest(".pdf-page-container");
      if (!a) return;
      const o = parseInt(a.dataset.pageNum ?? "0", 10);
      if (o === 0) return;
      const c = i.getBoundingClientRect(), r = (n.clientX - c.left) / this.renderedScale, l = (n.clientY - c.top) / this.renderedScale;
      let d = null;
      this.synctexData && (d = this.synctexParser.inverseLookup(this.synctexData, o, r, l)), d || (d = this.textMapper.lookup(o, r, l)), d && this.onInverseSearch(d);
    });
  }
  zoomLabel;
  updateZoomLabel() {
    this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
  }
  async render(e) {
    const s = performance.now(), t = this.gate.begin(), n = this.pdfDoc, i = await p.getDocument({ data: e.slice(), worker: P() }).promise;
    if (!this.gate.claim(i, t)) return performance.now() - s;
    const a = await i.getPage(1);
    if (!this.gate.claim(i, t)) return performance.now() - s;
    const o = i;
    this.pdfDoc = o, this.lastPdf = e.slice(), this.pageSizes = [], this.intrinsicPageWidth = a.getViewport({ scale: 1 }).width, this.removeLoadingOverlay(), this.toolbarHidden || (this.container.insertBefore(this.controlsEl, this.pagesContainer), this.controlsEl.style.display = "flex"), this.downloadBtn.style.display = "";
    let c = !1;
    return this.currentPage > o.numPages && (this.currentPage = 1, c = !0), await this.renderAllPages(t, c), n && queueMicrotask(() => n.destroy()), performance.now() - s;
  }
  async renderAllPages(e, s = !1) {
    if (!this.pdfDoc) return;
    const t = this.pdfDoc.numPages;
    this.pageInfo.textContent = `Page ${this.currentPage} / ${t}`;
    const n = Array.from(
      this.pagesContainer.querySelectorAll(".pdf-page-container")
    ), i = Math.min(this.currentPage, t);
    if (!this.gate.isCurrent(e)) return;
    let a;
    try {
      a = await this.pageRenderer.renderPage(this.pdfDoc, i, this.scale);
    } catch {
      return;
    }
    if (!this.gate.isCurrent(e)) {
      this.pageRenderer.recycle([a.canvas]);
      return;
    }
    this.cachePageSize(i, a.canvas);
    const o = this.buildPageWrappers(t, i, a.wrapper, n);
    this.swapPages(o, i, s);
    const c = n[i - 1]?.querySelector("canvas");
    c && this.pageRenderer.recycle([c]);
    for (let r = t; r < n.length; r++) {
      const l = n[r]?.querySelector("canvas");
      l && this.pageRenderer.recycle([l]);
    }
    await this.renderRemainingPages(e, t, i, o), this.pdfDoc && await this.reindexTextMapper(e, this.pdfDoc);
  }
  /** (Re)build the text-fallback index for `doc`, gated by `generation` so a newer
   *  render supersedes it. Skips when `doc` is already fully indexed. The text
   *  mapper indexes at scale 1, so this is scale-independent (zoom-safe). */
  async reindexTextMapper(e, s) {
    if (this.gate.isCurrent(e) && this.indexedDoc !== s) {
      this.textMapper.clear();
      for (let t = 1; t <= s.numPages; t++) {
        if (!this.gate.isCurrent(e)) return;
        try {
          const n = await s.getPage(t);
          await this.textMapper.indexPage(n, t);
        } catch {
          return;
        }
      }
      this.indexedDoc = s;
    }
  }
  /** Cache a rendered page's intrinsic size for sizing future placeholders. */
  cachePageSize(e, s) {
    const t = Number.parseFloat(s.style.width);
    !Number.isFinite(t) || this.scale <= 0 || (this.pageSizes[e - 1] = {
      width: t / this.scale,
      aspectRatio: s.style.aspectRatio
    });
  }
  /** Render non-visible pages and swap them into the DOM one by one. */
  async renderRemainingPages(e, s, t, n) {
    if (this.pdfDoc) {
      for (let i = 1; i <= s; i++) {
        if (i === t) continue;
        if (!this.gate.isCurrent(e)) return;
        let a;
        try {
          a = await this.pageRenderer.renderPage(this.pdfDoc, i, this.scale);
        } catch {
          return;
        }
        if (!this.gate.isCurrent(e)) {
          this.pageRenderer.recycle([a.canvas]);
          return;
        }
        this.cachePageSize(i, a.canvas);
        const o = n[i - 1]?.querySelector("canvas");
        n[i - 1].replaceWith(a.wrapper), n[i - 1] = a.wrapper, o && this.pageRenderer.recycle([o]);
      }
      this.observePages();
    }
  }
  /** Build page wrapper elements (rendered page + old wrappers as placeholders) */
  buildPageWrappers(e, s, t, n) {
    const i = new Array(e), a = t.querySelector("canvas"), o = a.style.width, c = a.style.aspectRatio;
    for (let r = 1; r <= e; r++)
      if (r === s)
        i[r - 1] = t;
      else if (n[r - 1])
        i[r - 1] = n[r - 1];
      else {
        const l = document.createElement("div");
        l.className = "pdf-page-container", l.dataset.pageNum = String(r);
        const d = this.pageSizes[r - 1];
        d ? (l.style.width = `${d.width * this.scale}px`, l.style.aspectRatio = d.aspectRatio) : (l.style.width = o, l.style.aspectRatio = c), i[r - 1] = l;
      }
    return i;
  }
  /** Swap page DOM and restore scroll position within the current page */
  swapPages(e, s, t = !1) {
    const n = this.pagesContainer.querySelector(
      `.pdf-page-container[data-page-num="${s}"]`
    ), i = this.container.scrollTop, a = n ? n.offsetTop : null, o = document.createDocumentFragment();
    for (const r of e) o.appendChild(r);
    this.pagesContainer.replaceChildren(o);
    const c = e[s - 1];
    if (c) {
      const r = v(this.pageSizes, s, this.scale), l = r > 0 ? r : c.offsetTop;
      this.container.scrollTop = b({
        scrollTop: i,
        oldPageOffsetTop: a,
        newTargetOffsetTop: l,
        oldScale: this.renderedScale,
        newScale: this.scale,
        anchorToTop: t
      });
    }
    this.renderedScale = this.scale, this.observePages();
  }
  /** Track which page is most visible via IntersectionObserver */
  observePages() {
    this.pageObserver && this.pageObserver.disconnect(), this.pageVisibility.clear(), this.pageObserver = new IntersectionObserver(
      (e) => {
        for (const t of e) {
          const n = parseInt(t.target.dataset.pageNum ?? "1", 10);
          this.pageVisibility.set(n, t.isIntersecting ? t.intersectionRect.height : 0);
        }
        const s = y(this.pageVisibility);
        s !== null && (this.currentPage = s, this.pdfDoc && (this.pageInfo.textContent = `Page ${s} / ${this.pdfDoc.numPages}`));
      },
      { root: this.container, threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] }
    );
    for (const e of this.pagesContainer.querySelectorAll(".pdf-page-container"))
      this.pageObserver.observe(e);
  }
  /** Set the absolute zoom scale (clamped to MIN_SCALE–MAX_SCALE). */
  setScale(e) {
    if (this.scale = g(e), this.updateZoomLabel(), this.pdfDoc) {
      const s = this.gate.begin();
      this.renderAllPages(s);
    }
  }
  /** Zoom to fit the page width inside the container.
   *  Synchronous — safe to call from resize/ResizeObserver handlers. */
  fitToWidth() {
    if (!this.intrinsicPageWidth) return;
    const e = this.container.clientWidth - 16;
    e <= 0 || this.setScale(e / this.intrinsicPageWidth);
  }
  /** Show or hide the toolbar (zoom controls, page info, download button). */
  setToolbarVisible(e) {
    this.toolbarHidden = !e, e ? (this.container.insertBefore(this.controlsEl, this.pagesContainer), this.controlsEl.style.display = "flex") : this.controlsEl.remove();
  }
  zoom(e) {
    if (this.scale = g(this.scale + e), this.updateZoomLabel(), this.pdfDoc) {
      const s = this.gate.begin();
      this.renderAllPages(s);
    }
  }
  /** Forward search: highlight a source location in the PDF */
  forwardSearch(e, s) {
    let t = this.synctexData ? this.synctexParser.forwardLookup(this.synctexData, e, s) : null;
    if (t ??= this.textMapper.forwardLookup(e, s), !t) return;
    const i = this.pagesContainer.querySelectorAll(".pdf-page-container")[t.page - 1];
    if (!i) return;
    for (const o of this.pagesContainer.querySelectorAll(".forward-search-highlight"))
      o.remove();
    const a = document.createElement("div");
    a.className = "forward-search-highlight", a.style.cssText = [
      "position: absolute",
      `left: ${t.x * this.renderedScale}px`,
      `top: ${t.y * this.renderedScale}px`,
      `width: ${Math.max(t.width * this.renderedScale, 200)}px`,
      `height: ${Math.max(t.height * this.renderedScale, 20)}px`,
      "background: rgba(255, 200, 0, 0.3)",
      "border: none",
      "pointer-events: none",
      "transition: opacity 0.5s"
    ].join(";"), i.style.position = "relative", i.appendChild(a), i.scrollIntoView({ behavior: "smooth", block: "center" }), setTimeout(() => {
      a.style.opacity = "0", setTimeout(() => a.remove(), 500);
    }, 2e3);
  }
  /** Tear down the viewer: invalidate any in-flight render, disconnect the page
   *  IntersectionObserver, and destroy the last PDFDocumentProxy so neither leaks
   *  for the lifetime of the host page. Safe to call more than once. */
  destroy() {
    if (this.gate.begin(), this.pageObserver && (this.pageObserver.disconnect(), this.pageObserver = null), this.pdfDoc) {
      const e = this.pdfDoc;
      this.pdfDoc = null, queueMicrotask(() => e.destroy());
    }
    this.indexedDoc = null, this.pageSizes = [], this.pagesContainer.replaceChildren(), this.controlsEl.remove(), this.loadingOverlay?.remove(), this.loadingOverlay = null, this.lastPdf = null;
  }
}
export {
  R as PdfViewer
};
