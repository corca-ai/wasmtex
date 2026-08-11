import { SynctexParser as e } from "../synctex/synctex-parser.js";
import { TextMapper as t } from "../synctex/text-mapper.js";
import { PageRenderer as n } from "./page-renderer.js";
import { pickMostVisiblePage as r } from "./page-visibility.js";
import { RenderGate as i } from "./render-gate.js";
import { clampScale as a, computeRestoredScrollTop as o, computeTargetOffsetTop as s } from "./scale.js";
import * as c from "pdfjs-dist";
//#region src/viewer/pdf-viewer.ts
var l = null;
function u() {
	return l ||= (c.GlobalWorkerOptions.workerSrc || console.warn("[WasmTex] pdfjs-dist workerSrc is not configured. Set pdfjsLib.GlobalWorkerOptions.workerSrc before rendering PDFs. See the Integration Guide (docs/howto.md)."), new c.PDFWorker()), l;
}
var d = class {
	container;
	pdfDoc = null;
	currentPage = 1;
	scale = 1.5;
	renderedScale = 1.5;
	gate = new i();
	textMapper = new t();
	synctexData = null;
	synctexParser = new e();
	onInverseSearch = null;
	pageObserver = null;
	pageVisibility = /* @__PURE__ */ new Map();
	pageRenderer = new n();
	lastPdf = null;
	toolbarHidden = !1;
	intrinsicPageWidth = 0;
	indexedDoc = null;
	pageSizes = [];
	loadingOverlay = null;
	constructor(e) {
		this.container = e, this.buildLoadingOverlay(), this.buildControls();
	}
	setInverseSearchHandler(e) {
		this.onInverseSearch = e;
	}
	setSourceContent(e, t) {
		this.textMapper.setSource(e, t);
	}
	setSources(e) {
		this.textMapper.setSources(e);
	}
	setSynctexData(e) {
		this.synctexData = e;
	}
	getLastPdf() {
		return this.lastPdf;
	}
	setDownloadHandler(e) {
		this.downloadBtn.onclick = e;
	}
	controlsEl;
	pageInfo;
	pagesContainer;
	downloadBtn;
	buildLoadingOverlay() {
		let e = document.createElement("div");
		e.className = "pdf-loading-overlay", e.innerHTML = "<div class=\"pdf-loading-text\">Loading engine...</div><div class=\"pdf-loading-bar\"><div class=\"pdf-loading-bar-fill\"></div></div>", this.container.appendChild(e), this.loadingOverlay = e;
	}
	setLoadingStatus(e) {
		if (!this.loadingOverlay) return;
		let t = this.loadingOverlay.querySelector(".pdf-loading-text");
		t && (t.textContent = e);
		let n = this.loadingOverlay.querySelector(".pdf-loading-bar-fill");
		if (n) if (e.includes("Loading engine")) n.style.width = "20%";
		else if (e.includes("fetching")) {
			let e = Number.parseFloat(n.style.width || "20");
			n.style.width = `${Math.min(e + .5, 75)}%`;
		} else e.includes("Compiling") ? n.style.width = "50%" : e.includes("Rendering") && (n.style.width = "80%");
	}
	removeLoadingOverlay() {
		this.loadingOverlay &&= (this.loadingOverlay.remove(), null);
	}
	buildControls() {
		this.controlsEl = document.createElement("div"), this.controlsEl.className = "pdf-controls", this.controlsEl.style.display = "none", this.pageInfo = document.createElement("span"), this.pageInfo.textContent = "0 / 0";
		let e = document.createElement("button");
		e.textContent = "-", e.onclick = () => this.zoom(-.25);
		let t = document.createElement("span");
		t.className = "zoom-label", t.textContent = `${Math.round(this.scale * 100)}%`, t.ondblclick = () => {
			if (this.scale = 1, this.updateZoomLabel(), this.pdfDoc) {
				let e = this.gate.begin();
				this.renderAllPages(e);
			}
		}, this.zoomLabel = t;
		let n = document.createElement("button");
		n.textContent = "+", n.onclick = () => this.zoom(.25), this.downloadBtn = document.createElement("button"), this.downloadBtn.className = "pdf-download-btn", this.downloadBtn.textContent = "PDF", this.downloadBtn.title = "Download PDF", this.downloadBtn.style.display = "none", this.controlsEl.append(this.pageInfo, e, t, n, this.downloadBtn), this.pagesContainer = document.createElement("div"), this.container.appendChild(this.pagesContainer), this.pagesContainer.addEventListener("click", (e) => {
			if (!this.onInverseSearch) return;
			let t = e.target;
			if (!(t instanceof HTMLCanvasElement)) return;
			let n = t.closest(".pdf-page-container");
			if (!n) return;
			let r = parseInt(n.dataset.pageNum ?? "0", 10);
			if (r === 0) return;
			let i = t.getBoundingClientRect(), a = (e.clientX - i.left) / this.renderedScale, o = (e.clientY - i.top) / this.renderedScale, s = null;
			this.synctexData && (s = this.synctexParser.inverseLookup(this.synctexData, r, a, o)), s ||= this.textMapper.lookup(r, a, o), s && this.onInverseSearch(s);
		});
	}
	zoomLabel;
	updateZoomLabel() {
		this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
	}
	async render(e) {
		let t = performance.now(), n = this.gate.begin(), r = this.pdfDoc, i = await c.getDocument({
			data: e.slice(),
			worker: u()
		}).promise;
		if (!this.gate.claim(i, n)) return performance.now() - t;
		let a = await i.getPage(1);
		if (!this.gate.claim(i, n)) return performance.now() - t;
		let o = i;
		this.pdfDoc = o, this.lastPdf = e.slice(), this.pageSizes = [], this.intrinsicPageWidth = a.getViewport({ scale: 1 }).width, this.removeLoadingOverlay(), this.toolbarHidden || (this.container.insertBefore(this.controlsEl, this.pagesContainer), this.controlsEl.style.display = "flex"), this.downloadBtn.style.display = "";
		let s = !1;
		return this.currentPage > o.numPages && (this.currentPage = 1, s = !0), await this.renderAllPages(n, s), r && queueMicrotask(() => r.destroy()), performance.now() - t;
	}
	async renderAllPages(e, t = !1) {
		if (!this.pdfDoc) return;
		let n = this.pdfDoc.numPages;
		this.pageInfo.textContent = `Page ${this.currentPage} / ${n}`;
		let r = Array.from(this.pagesContainer.querySelectorAll(".pdf-page-container")), i = Math.min(this.currentPage, n);
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
		let o = this.buildPageWrappers(n, i, a.wrapper, r);
		this.swapPages(o, i, t);
		let s = r[i - 1]?.querySelector("canvas");
		s && this.pageRenderer.recycle([s]);
		for (let e = n; e < r.length; e++) {
			let t = r[e]?.querySelector("canvas");
			t && this.pageRenderer.recycle([t]);
		}
		await this.renderRemainingPages(e, n, i, o), this.pdfDoc && await this.reindexTextMapper(e, this.pdfDoc);
	}
	async reindexTextMapper(e, t) {
		if (this.gate.isCurrent(e) && this.indexedDoc !== t) {
			this.textMapper.clear();
			for (let n = 1; n <= t.numPages; n++) {
				if (!this.gate.isCurrent(e)) return;
				try {
					let e = await t.getPage(n);
					await this.textMapper.indexPage(e, n);
				} catch {
					return;
				}
			}
			this.indexedDoc = t;
		}
	}
	cachePageSize(e, t) {
		let n = Number.parseFloat(t.style.width);
		!Number.isFinite(n) || this.scale <= 0 || (this.pageSizes[e - 1] = {
			width: n / this.scale,
			aspectRatio: t.style.aspectRatio
		});
	}
	async renderRemainingPages(e, t, n, r) {
		if (this.pdfDoc) {
			for (let i = 1; i <= t; i++) {
				if (i === n) continue;
				if (!this.gate.isCurrent(e)) return;
				let t;
				try {
					t = await this.pageRenderer.renderPage(this.pdfDoc, i, this.scale);
				} catch {
					return;
				}
				if (!this.gate.isCurrent(e)) {
					this.pageRenderer.recycle([t.canvas]);
					return;
				}
				this.cachePageSize(i, t.canvas);
				let a = r[i - 1]?.querySelector("canvas");
				r[i - 1].replaceWith(t.wrapper), r[i - 1] = t.wrapper, a && this.pageRenderer.recycle([a]);
			}
			this.observePages();
		}
	}
	buildPageWrappers(e, t, n, r) {
		let i = Array(e), a = n.querySelector("canvas"), o = a.style.width, s = a.style.aspectRatio;
		for (let a = 1; a <= e; a++) if (a === t) i[a - 1] = n;
		else if (r[a - 1]) i[a - 1] = r[a - 1];
		else {
			let e = document.createElement("div");
			e.className = "pdf-page-container", e.dataset.pageNum = String(a);
			let t = this.pageSizes[a - 1];
			t ? (e.style.width = `${t.width * this.scale}px`, e.style.aspectRatio = t.aspectRatio) : (e.style.width = o, e.style.aspectRatio = s), i[a - 1] = e;
		}
		return i;
	}
	swapPages(e, t, n = !1) {
		let r = this.pagesContainer.querySelector(`.pdf-page-container[data-page-num="${t}"]`), i = this.container.scrollTop, a = r ? r.offsetTop : null, c = document.createDocumentFragment();
		for (let t of e) c.appendChild(t);
		this.pagesContainer.replaceChildren(c);
		let l = e[t - 1];
		if (l) {
			let e = s(this.pageSizes, t, this.scale), r = e > 0 ? e : l.offsetTop;
			this.container.scrollTop = o({
				scrollTop: i,
				oldPageOffsetTop: a,
				newTargetOffsetTop: r,
				oldScale: this.renderedScale,
				newScale: this.scale,
				anchorToTop: n
			});
		}
		this.renderedScale = this.scale, this.observePages();
	}
	observePages() {
		this.pageObserver && this.pageObserver.disconnect(), this.pageVisibility.clear(), this.pageObserver = new IntersectionObserver((e) => {
			for (let t of e) {
				let e = parseInt(t.target.dataset.pageNum ?? "1", 10);
				this.pageVisibility.set(e, t.isIntersecting ? t.intersectionRect.height : 0);
			}
			let t = r(this.pageVisibility);
			t !== null && (this.currentPage = t, this.pdfDoc && (this.pageInfo.textContent = `Page ${t} / ${this.pdfDoc.numPages}`));
		}, {
			root: this.container,
			threshold: [
				0,
				.01,
				.25,
				.5,
				.75,
				1
			]
		});
		for (let e of this.pagesContainer.querySelectorAll(".pdf-page-container")) this.pageObserver.observe(e);
	}
	setScale(e) {
		if (this.scale = a(e), this.updateZoomLabel(), this.pdfDoc) {
			let e = this.gate.begin();
			this.renderAllPages(e);
		}
	}
	fitToWidth() {
		if (!this.intrinsicPageWidth) return;
		let e = this.container.clientWidth - 16;
		e <= 0 || this.setScale(e / this.intrinsicPageWidth);
	}
	setToolbarVisible(e) {
		this.toolbarHidden = !e, e ? (this.container.insertBefore(this.controlsEl, this.pagesContainer), this.controlsEl.style.display = "flex") : this.controlsEl.remove();
	}
	zoom(e) {
		if (this.scale = a(this.scale + e), this.updateZoomLabel(), this.pdfDoc) {
			let e = this.gate.begin();
			this.renderAllPages(e);
		}
	}
	forwardSearch(e, t) {
		let n = this.synctexData ? this.synctexParser.forwardLookupAll(this.synctexData, e, t) : [];
		if (n.length === 0) {
			let r = this.textMapper.forwardLookup(e, t);
			r && (n = [r]);
		}
		let r = n[0];
		if (!r) return;
		let i = this.pagesContainer.querySelectorAll(".pdf-page-container")[r.page - 1];
		if (i) {
			for (let e of this.pagesContainer.querySelectorAll(".forward-search-highlight")) e.remove();
			i.style.position = "relative";
			for (let e of n) {
				if (e.page !== r.page) continue;
				let t = document.createElement("div");
				t.className = "forward-search-highlight", t.style.cssText = [
					"position: absolute",
					`left: ${e.x * this.renderedScale}px`,
					`top: ${e.y * this.renderedScale}px`,
					`width: ${Math.max(e.width * this.renderedScale, 200)}px`,
					`height: ${Math.max(e.height * this.renderedScale, 20)}px`,
					"background: rgba(255, 200, 0, 0.3)",
					"border: none",
					"pointer-events: none",
					"transition: opacity 0.5s"
				].join(";"), i.appendChild(t), setTimeout(() => {
					t.style.opacity = "0", setTimeout(() => t.remove(), 500);
				}, 2e3);
			}
			i.scrollIntoView({
				behavior: "smooth",
				block: "center"
			});
		}
	}
	destroy() {
		if (this.gate.begin(), this.pageObserver &&= (this.pageObserver.disconnect(), null), this.pdfDoc) {
			let e = this.pdfDoc;
			this.pdfDoc = null, queueMicrotask(() => e.destroy());
		}
		this.indexedDoc = null, this.pageSizes = [], this.pagesContainer.replaceChildren(), this.controlsEl.remove(), this.loadingOverlay?.remove(), this.loadingOverlay = null, this.lastPdf = null;
	}
};
//#endregion
export { d as PdfViewer };
