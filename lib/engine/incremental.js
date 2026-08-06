import { mergeTailSynctex as e } from "../synctex/synctex-merge.js";
import { SynctexParser as t } from "../synctex/synctex-parser.js";
import { chooseBoundary as n, findPageBreaks as r, firstDifference as i, hashString as a, includePositions as o, splitAtBoundary as s } from "./checkpoint-boundaries.js";
import { pdfPageCount as c, splicePdfs as l } from "./pdf-splice.js";
import { extractPreamble as u } from "./preamble-utils.js";
//#region src/engine/incremental.ts
var d = /\\(?:label|ref|pageref|eqref|autoref|cref|Cref|nameref|cite|bibitem|caption|footnote|appendix|(?:set|step|add(?:to)?)counter|newtheorem|(?:sub)*section|chapter|part|item|index|makeindex|printindex)(?![A-Za-z@])|\\begin\{(?:enumerate|equation|figure|table|align)/, f = /\\(?:tableofcontents|listof[a-z]+|bibliography(?![A-Za-z])|printbibliography|printindex|printglossary|printglossaries|printnomenclature)/i;
function p(e, t, n) {
	let r = e.length - 1, i = t.length - 1, a = 0;
	for (; r >= n && i >= n && e.charCodeAt(r) === t.charCodeAt(i);) r--, i--, a++;
	return a;
}
function m(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) e.charCodeAt(n) === 10 && t++;
	return t;
}
function h(e) {
	return e >= "a" && e <= "z" || e >= "A" && e <= "Z" || e === "*";
}
function g(e, t) {
	let n = i(e, t);
	if (n === e.length && n === t.length) return !1;
	let r = p(e, t, n), a = n;
	for (; a > 0 && h(e[a - 1]);) a--;
	a > 0 && e[a - 1] === "\\" && a--;
	let o = 0, s = t.length - r;
	for (; s + o < t.length && h(t[s + o]);) o++;
	let c = t.slice(a, s + o), l = e.slice(a, e.length - r + o);
	return d.test(c) || d.test(l);
}
var _ = class {
	engine;
	maxCheckpoints;
	minHeadBytes;
	mainFile;
	last = null;
	lastFullSource = null;
	lastFullFiles = null;
	lastFullSynctexBytes = null;
	lastFullSynctex = null;
	synctexParser = new t();
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
	noteFull(e, t = /* @__PURE__ */ new Map(), n = null) {
		let r = this.last?.get(this.mainFile);
		r != null && u(r)?.preamble !== u(e)?.preamble && (this.checkpoints.clear(), this.lru.length = 0), this.last = this.snapshot(e, t), this.lastFullSource = e, this.lastFullFiles = this.snapshot(e, t), this.lastFullSynctexBytes = n, this.lastFullSynctex = null;
	}
	async ensureLastFullSynctex() {
		return this.lastFullSynctex ? this.lastFullSynctex : this.lastFullSynctexBytes ? (this.lastFullSynctex = await this.synctexParser.parse(this.lastFullSynctexBytes), this.lastFullSynctex) : null;
	}
	planFast(e, t) {
		let i = this.last?.get(this.mainFile);
		if (i == null || u(i)?.preamble !== u(e)?.preamble || f.test(e)) return null;
		let a = n(r(e), this.editOffset(i, e, t));
		if (a === null) return null;
		let { headText: o, tailText: c } = s(e, a);
		return this.headSize(o, t) < this.minHeadBytes ? null : {
			prevMain: i,
			headText: o,
			tailText: c
		};
	}
	async tryIncremental(e, t = /* @__PURE__ */ new Map()) {
		let n = this.planFast(e, t);
		if (n === null) return null;
		try {
			let { checkpoint: r, built: i } = await this.ensureCheckpoint(n.headText, t), a = await this.engine.compileFromCheckpoint(r.fmt, n.tailText);
			if (!a.pdf || a.status !== 0 && a.status !== 1) return null;
			let o = await l([r.headPdf, a.pdf]), s = !this.changeTouchesLabels(n.prevMain, e, t), c = await this.spliceTailSynctex(r, n.headText, a.synctex, t);
			return this.last = this.snapshot(e, t), {
				pdf: o,
				log: a.log,
				success: !0,
				incremental: !0,
				checkpointBuilt: i,
				final: s,
				synctexData: c
			};
		} catch {
			return null;
		}
	}
	async spliceTailSynctex(t, n, r, i) {
		if (!r || this.lastFullSource == null || this.lastFullSource.slice(0, n.length) !== n) return null;
		let a = this.lastFullFiles ?? /* @__PURE__ */ new Map();
		for (let e of o(n).keys()) if (this.includedContent(e, i) !== this.includedContent(e, a)) return null;
		let s = await this.ensureLastFullSynctex();
		if (!s) return null;
		let l = await this.synctexParser.parse(r);
		return e({
			head: s,
			tail: l,
			headPageCount: await c(t.headPdf),
			tailLineOffset: m(n),
			mainFile: this.mainFile,
			tailFile: "tail.tex"
		});
	}
	canFastServe(e, t = /* @__PURE__ */ new Map()) {
		let n = this.planFast(e, t);
		return n !== null && !this.changeTouchesLabels(n.prevMain, e, t);
	}
	async prebuild(e, t = /* @__PURE__ */ new Map(), i = e.length) {
		let a = this.last?.get(this.mainFile);
		if (a == null || u(a)?.preamble !== u(e)?.preamble || f.test(e)) return !1;
		let o = n(r(e), i);
		if (o === null) return !1;
		let { headText: c } = s(e, o);
		if (this.headSize(c, t) < this.minHeadBytes) return !1;
		let l = this.checkpointKey(c, t);
		if (this.checkpoints.has(l)) return this.touch(l), !1;
		try {
			let { built: e } = await this.ensureCheckpoint(c, t);
			return e;
		} catch {
			return !1;
		}
	}
	editOffset(e, t, n) {
		let r = i(e, t);
		if (n.size && this.last) {
			let e = o(t);
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
		if (g(e, t)) return !0;
		if (!this.last) return !1;
		let r = /* @__PURE__ */ new Set([...this.last.keys(), ...n.keys()]);
		r.delete(this.mainFile);
		for (let e of r) {
			let t = this.last.get(e) ?? "", r = n.get(e) ?? "";
			if (t !== r && g(t, r)) return !0;
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
		for (let r of o(e).keys()) n += this.includedContent(r, t).length;
		return n;
	}
	checkpointKey(e, t) {
		let n = [...o(e).keys()].sort().map((e) => `${e}=${a(this.includedContent(e, t))}`), r = [];
		for (let [e, n] of t) e === this.mainFile || e.endsWith(".tex") || r.push(`${e}=${a(n)}`);
		return r.sort(), `${e.length}:${a(e)}|${n.join(",")}|${r.join(",")}`;
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
export { _ as IncrementalCompiler, g as editTouchesLabels };
