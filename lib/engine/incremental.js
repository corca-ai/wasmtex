import { extractPreamble as e } from "./preamble-utils.js";
import { mergeTailSynctex as t } from "../synctex/synctex-merge.js";
import { SynctexParser as n } from "../synctex/synctex-parser.js";
import { chooseBoundary as r, findPageBreaks as i, firstDifference as a, hashString as o, includePositions as s, splitAtBoundary as c } from "./checkpoint-boundaries.js";
import { createPdfPreviewParts as l, pdfPageCount as u, splicePdfs as d } from "./pdf-splice.js";
//#region src/engine/incremental.ts
var f = /\\(?:label|ref|pageref|eqref|autoref|cref|Cref|nameref|cite|bibitem|caption|footnote|appendix|(?:set|step|add(?:to)?)counter|newtheorem|(?:sub)*section|chapter|part|item|index|makeindex|printindex)(?![A-Za-z@])|\\begin\{(?:enumerate|equation|figure|table|align)/, p = /\\(?:tableofcontents|listof[a-z]+|bibliography(?![A-Za-z])|printbibliography|printindex|printglossary|printglossaries|printnomenclature)/i;
function m(e, t, n) {
	let r = e.length - 1, i = t.length - 1, a = 0;
	for (; r >= n && i >= n && e.charCodeAt(r) === t.charCodeAt(i);) r--, i--, a++;
	return a;
}
function h(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) e.charCodeAt(n) === 10 && t++;
	return t;
}
function g(e) {
	return e >= "a" && e <= "z" || e >= "A" && e <= "Z" || e === "*";
}
function _(e, t) {
	let n = a(e, t);
	if (n === e.length && n === t.length) return !1;
	let r = m(e, t, n), i = n;
	for (; i > 0 && g(e[i - 1]);) i--;
	i > 0 && e[i - 1] === "\\" && i--;
	let o = 0, s = t.length - r;
	for (; s + o < t.length && g(t[s + o]);) o++;
	let c = t.slice(i, s + o), l = e.slice(i, e.length - r + o);
	return f.test(c) || f.test(l);
}
var v = class {
	engine;
	maxCheckpoints;
	minHeadBytes;
	mainFile;
	last = null;
	lastFullSource = null;
	lastFullFiles = null;
	lastFullSynctexBytes = null;
	lastFullSynctex = null;
	synctexParser = new n();
	checkpoints = /* @__PURE__ */ new Map();
	lru = [];
	constructor(e, t = {}) {
		this.engine = e, this.maxCheckpoints = t.maxCheckpoints ?? 4, this.minHeadBytes = t.minHeadBytes ?? 2e3, this.mainFile = t.mainFile ?? "main.tex";
	}
	reset() {
		this.last = null, this.lastFullSource = null, this.lastFullFiles = null, this.lastFullSynctexBytes = null, this.lastFullSynctex = null, this.checkpoints.clear(), this.lru.length = 0;
	}
	setMainFile(e) {
		this.mainFile = e, this.reset();
	}
	async compile(e, t = /* @__PURE__ */ new Map()) {
		return await this.syncProjectFiles(e, t), await this.tryIncremental(e, t) || this.full(e, t);
	}
	async syncProjectFiles(e, t) {
		for (let [e, n] of t) e !== this.mainFile && await this.engine.writeFile(e, n);
		await this.engine.writeFile(this.mainFile, e);
	}
	noteFull(t, n = /* @__PURE__ */ new Map(), r = null) {
		let i = this.last?.get(this.mainFile);
		i != null && e(i)?.preamble !== e(t)?.preamble && (this.checkpoints.clear(), this.lru.length = 0), this.last = this.snapshot(t, n), this.lastFullSource = t, this.lastFullFiles = this.snapshot(t, n), this.lastFullSynctexBytes = r, this.lastFullSynctex = null;
	}
	async ensureLastFullSynctex() {
		return this.lastFullSynctex ? this.lastFullSynctex : this.lastFullSynctexBytes ? (this.lastFullSynctex = await this.synctexParser.parse(this.lastFullSynctexBytes), this.lastFullSynctex) : null;
	}
	planFast(t, n) {
		let a = this.last?.get(this.mainFile);
		if (a == null || e(a)?.preamble !== e(t)?.preamble || p.test(t)) return null;
		let o = r(i(t), this.editOffset(a, t, n));
		if (o === null) return null;
		let { headText: s, tailText: l } = c(t, o);
		return this.headSize(s, n) < this.minHeadBytes ? null : {
			prevMain: a,
			headText: s,
			tailText: l
		};
	}
	getRetentionStats() {
		let e = 0, t = 0;
		for (let n of this.checkpoints.values()) e += n.fmt.byteLength, t += n.headPdf.byteLength;
		return {
			checkpointCount: this.checkpoints.size,
			checkpointFormatBytes: e,
			checkpointPdfBytes: t,
			synctexBytes: this.lastFullSynctexBytes?.byteLength ?? 0
		};
	}
	async tryIncremental(e, t = /* @__PURE__ */ new Map(), n = !1) {
		let r = this.planFast(e, t);
		if (r === null || n && this.changeTouchesLabels(r.prevMain, e, t)) return null;
		try {
			let { checkpoint: i, built: a } = await this.ensureCheckpoint(r.headText, t), o = await this.engine.compileFromCheckpoint(i.fmt, r.tailText);
			if (!o.pdf || o.status !== 0 && o.status !== 1) return null;
			let s = n ? l([i.headPdf, o.pdf]) : await d([i.headPdf, o.pdf]), c = !this.changeTouchesLabels(r.prevMain, e, t), u = await this.spliceTailSynctex(i, r.headText, o.synctex, t);
			return this.last = this.snapshot(e, t), {
				pdf: s,
				log: o.log,
				success: !0,
				incremental: !0,
				checkpointBuilt: a,
				final: c,
				synctexData: u
			};
		} catch {
			return null;
		}
	}
	async spliceTailSynctex(e, n, r, i) {
		if (!r || this.lastFullSource == null || this.lastFullSource.slice(0, n.length) !== n) return null;
		let a = this.lastFullFiles ?? /* @__PURE__ */ new Map();
		for (let e of s(n).keys()) if (this.includedContent(e, i) !== this.includedContent(e, a)) return null;
		let o = await this.ensureLastFullSynctex();
		if (!o) return null;
		let c = await this.synctexParser.parse(r);
		return e.headPageCount ??= await u(e.headPdf), t({
			head: o,
			tail: c,
			headPageCount: e.headPageCount,
			tailLineOffset: h(n),
			mainFile: this.mainFile,
			tailFile: "tail.tex"
		});
	}
	canFastServe(e, t = /* @__PURE__ */ new Map()) {
		let n = this.planFast(e, t);
		return n !== null && !this.changeTouchesLabels(n.prevMain, e, t);
	}
	async prebuild(t, n = /* @__PURE__ */ new Map(), a = t.length) {
		let o = this.last?.get(this.mainFile);
		if (o == null || e(o)?.preamble !== e(t)?.preamble || p.test(t)) return !1;
		let s = r(i(t), a);
		if (s === null) return !1;
		let { headText: l } = c(t, s);
		if (this.headSize(l, n) < this.minHeadBytes) return !1;
		let u = this.checkpointKey(l, n);
		if (this.checkpoints.has(u)) return this.touch(u), !1;
		try {
			let { built: e } = await this.ensureCheckpoint(l, n);
			return e;
		} catch {
			return !1;
		}
	}
	async prebuildForEdit(e, t, n, r) {
		if (n === this.mainFile) return this.prebuild(e, t, r);
		let i = this.includePosFor(n, s(e));
		return i !== void 0 && this.prebuild(e, t, i);
	}
	editOffset(e, t, n) {
		let r = a(e, t);
		if (n.size && this.last) {
			let e = s(t);
			for (let [t, i] of n) {
				if (t === this.mainFile) continue;
				let n = this.includePosFor(t, e);
				n !== void 0 && n < r && this.last.get(t) !== i && (r = n);
			}
		}
		return r;
	}
	includePosFor(e, t) {
		let n = e.replace(/\.tex$/, ""), r = t.get(n);
		return r === void 0 ? t.get(n.slice(n.lastIndexOf("/") + 1)) : r;
	}
	includedContent(e, t) {
		let n = t.get(`${e}.tex`) ?? t.get(e);
		if (n !== void 0) return n;
		let r = e.slice(e.lastIndexOf("/") + 1), i;
		for (let [e, n] of t) if (e !== this.mainFile && e.slice(e.lastIndexOf("/") + 1).replace(/\.tex$/, "") === r) {
			if (i !== void 0) return "";
			i = n;
		}
		return i ?? "";
	}
	changeTouchesLabels(e, t, n) {
		if (_(e, t)) return !0;
		if (!this.last) return !1;
		let r = /* @__PURE__ */ new Set([...this.last.keys(), ...n.keys()]);
		r.delete(this.mainFile);
		for (let e of r) {
			let t = this.last.get(e) ?? "", r = n.get(e) ?? "";
			if (t !== r && _(t, r)) return !0;
		}
		return !1;
	}
	async ensureCheckpoint(e, t) {
		let n = this.checkpointKey(e, t), r = this.checkpoints.get(n);
		if (r) return this.touch(n), {
			checkpoint: r,
			built: !1
		};
		let { fmt: i, headPdf: a } = await this.engine.buildCheckpoint(e);
		if (!a) throw Error("checkpoint produced no head PDF");
		let o = {
			key: n,
			fmt: i,
			headPdf: a
		};
		return this.checkpoints.set(n, o), this.touch(n), this.evict(), {
			checkpoint: o,
			built: !0
		};
	}
	headSize(e, t) {
		let n = e.length;
		for (let r of s(e).keys()) n += this.includedContent(r, t).length;
		return n;
	}
	checkpointKey(e, t) {
		let n = [...s(e).keys()].sort().map((e) => `${e}=${o(this.includedContent(e, t))}`), r = [];
		for (let [e, n] of t) e === this.mainFile || e.endsWith(".tex") || r.push(`${e}=${o(n)}`);
		return r.sort(), `${e.length}:${o(e)}|${n.join(",")}|${r.join(",")}`;
	}
	snapshot(e, t) {
		let n = new Map(t);
		return n.set(this.mainFile, e), n;
	}
	touch(e) {
		let t = this.lru.indexOf(e);
		t !== -1 && this.lru.splice(t, 1), this.lru.push(e);
	}
	evict() {
		for (; this.lru.length > this.maxCheckpoints;) {
			let e = this.lru.shift();
			e && this.checkpoints.delete(e);
		}
	}
	async full(e, t) {
		let n = await this.engine.compile();
		return this.last = this.snapshot(e, t), this.lastFullSource = e, this.lastFullFiles = this.snapshot(e, t), this.lastFullSynctexBytes = n.synctex, this.lastFullSynctex = null, {
			pdf: n.pdf,
			log: n.log,
			success: n.success,
			incremental: !1,
			checkpointBuilt: !1,
			final: !0,
			reason: "no usable checkpoint"
		};
	}
};
//#endregion
export { v as IncrementalCompiler, _ as editTouchesLabels };
