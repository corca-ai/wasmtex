import { projectVisiblePdfText as e } from "./visible-pdf-text.js";
import { VisibleTextCatalog as t } from "./visible-text-catalog.js";
//#region src/synctex/visible-text-index.ts
function n(e, t) {
	let n = 0, r = e.length;
	for (; n < r;) {
		let i = n + r >>> 1;
		e[i] <= t ? n = i + 1 : r = i;
	}
	let i = Math.max(0, n - 1);
	return {
		line: i + 1,
		column: t - (e[i] ?? 0) + 1
	};
}
var r = class {
	sources = /* @__PURE__ */ new Map();
	sourceCatalog = new t();
	pages = /* @__PURE__ */ new Map();
	pageCatalog = new t();
	dehyphenatedCatalog = new t();
	sourceTruncated = !1;
	setSources(e) {
		this.sources = new Map(e.map((e) => [e.fileId, e])), this.sourceCatalog = new t(), this.sourceTruncated = !1;
		for (let e of this.sources.values()) {
			this.sourceTruncated ||= e.truncated;
			for (let t of e.blocks) this.sourceCatalog.add({
				source: e,
				block: t
			}, t);
		}
	}
	setPage(e) {
		if (!Number.isSafeInteger(e.page) || e.page < 1) throw RangeError("Invalid PDF page");
		this.pages.delete(e.page), this.pages.set(e.page, e), this.pages.size > 8 && this.pages.delete(this.pages.keys().next().value), this.rebuildPages();
	}
	clearPages() {
		this.pages.clear(), this.rebuildPages();
	}
	rebuildPages() {
		this.pageCatalog = new t(), this.dehyphenatedCatalog = new t();
		for (let t of this.pages.values()) for (let n of e(t.text.slice(0, 25e4), !0)) (n.method === "exact" ? this.pageCatalog : this.dehyphenatedCatalog).add({
			page: t,
			method: n.method
		}, n.normalized);
	}
	findSources(e, t) {
		let r = this.sourceCatalog.find(e, t);
		return {
			truncated: r.truncated || this.sourceTruncated,
			candidates: r.candidates.map(({ owner: { source: e, block: t }, start: r, end: i, contextBefore: a, contextAfter: o }) => ({
				fileId: e.fileId,
				file: e.file,
				documentVersion: e.documentVersion,
				start: r,
				end: i,
				...n(e.lineStarts, r),
				kind: t.kind,
				structuralRange: t.structuralRange,
				contextBefore: a,
				contextAfter: o
			}))
		};
	}
	findPdf(e, t) {
		let n = this.pageCatalog.find(e, t);
		return !n.candidates.length && !n.truncated && t?.dehyphenate && (n = this.dehyphenatedCatalog.find(e, t)), {
			truncated: n.truncated || [...this.pages.values()].some(({ text: e }) => e.length > 25e4),
			candidates: n.candidates.map(({ owner: { page: e, method: t }, start: n, end: r, contextBefore: i, contextAfter: a }) => ({
				page: e.page,
				method: t,
				start: n,
				end: r,
				regions: e.rangeRects(n, r),
				contextBefore: i,
				contextAfter: a
			}))
		};
	}
	sourceFragments(e, t) {
		let n = this.sources.get(e);
		return !n || n.truncated || !Number.isSafeInteger(t) || t < 0 ? [] : n.blocks.flatMap((e) => {
			if (t < (e.starts[0] ?? 0) || t > (e.ends.at(-1) ?? 0)) return [];
			let n = 0, r = e.ends.length;
			for (; n < r;) {
				let i = n + r >>> 1;
				e.ends[i] <= t ? n = i + 1 : r = i;
			}
			let i = Math.max(0, n - 64), a = Math.min(e.text.length, i + 160);
			return [{
				text: e.text.slice(i, a),
				starts: e.starts.slice(i, a),
				ends: e.ends.slice(i, a)
			}];
		});
	}
};
//#endregion
export { r as VisibleTextIndex };
