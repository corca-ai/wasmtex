import { normalizeNavigationText as e } from "./visible-text-normalize.js";
//#region src/synctex/visible-text-catalog.ts
function t(e, t) {
	let n = 0;
	for (; n < e.length && n < t.length && e[e.length - 1 - n] === t[t.length - 1 - n];) n++;
	return n;
}
function n(e, t) {
	let n = 0;
	for (; n < e.length && n < t.length && e[n] === t[n];) n++;
	return n;
}
var r = class {
	maxUnits;
	maxEntries;
	entries = [];
	grams = /* @__PURE__ */ new Map();
	postings = 0;
	units = 0;
	clipped = !1;
	constructor(e = 2e6, t = 8192) {
		this.maxUnits = e, this.maxEntries = t;
	}
	add(e, t) {
		if (this.entries.length >= this.maxEntries || this.units + t.text.length > this.maxUnits) return this.clipped = !0, !1;
		let n = this.entries.length;
		this.entries.push({
			owner: e,
			normalized: t
		}), this.units += t.text.length;
		for (let e = 0; e + 3 <= t.text.length; e++) {
			let r = t.text.slice(e, e + 3), i = this.grams.get(r);
			if (!i && this.grams.size >= 32768 || this.postings >= 2e5) {
				this.clipped = !0;
				continue;
			}
			i || (i = /* @__PURE__ */ new Set(), this.grams.set(r, i)), i.has(n) || (i.add(n), this.postings++);
		}
		return !0;
	}
	candidateEntries(e) {
		let t;
		for (let n = 0; n + 3 <= e.length; n++) {
			let r = this.grams.get(e.slice(n, n + 3));
			if (!r) return;
			(!t || r.size < t.size) && (t = r);
		}
		return t;
	}
	find(r, i = {}) {
		let a = {
			candidates: [],
			truncated: this.clipped
		};
		if (r.length > 4096) return a;
		let o = e(r).text;
		if (o.length < 4 || o.length > 512) return a;
		let s = this.candidateEntries(o), c = e((i.contextBefore ?? "").slice(-128)).text, l = e((i.contextAfter ?? "").slice(0, 128)).text, u = Math.max(1, Math.min(64, Math.floor(Number.isFinite(i.maxCandidates) ? i.maxCandidates : 32))), d = 0;
		for (let e of s ?? []) {
			if (++d > 256) {
				a.truncated = !0;
				break;
			}
			let r = this.entries[e], i = r.normalized.text.indexOf(o);
			for (; i !== -1;) {
				if (a.candidates.length >= u) return a.truncated = !0, a;
				let e = i + o.length;
				a.candidates.push({
					owner: r.owner,
					start: r.normalized.starts[i],
					end: r.normalized.ends[e - 1],
					normalizedStart: i,
					normalizedEnd: e,
					contextBefore: t(c, r.normalized.text.slice(Math.max(0, i - 128), i).trimEnd()),
					contextAfter: n(l, r.normalized.text.slice(e, e + 128).trimStart())
				}), i = r.normalized.text.indexOf(o, i + 1);
			}
		}
		return a;
	}
};
//#endregion
export { r as VisibleTextCatalog };
