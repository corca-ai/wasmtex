import { normalizeProjectDependencyPath as e } from "./dependency-manifest.js";
import { extractPreamble as t } from "./preamble-utils.js";
import { firstDifference as n, hashString as r, includePositions as i } from "./checkpoint-boundaries.js";
import { editTouchesLabels as a } from "./incremental.js";
//#region src/engine/heap-checkpoints.ts
function o(e, t) {
	if (t <= 1) return 0;
	let n = -1;
	for (let r = 1; r < t; r++) if (n = e.indexOf("\n", n + 1), n < 0) return -1;
	return n + 1;
}
function s(e, t) {
	let n = 1, r = Math.min(t, e.length);
	for (let t = 0; t < r; t++) e.charCodeAt(t) === 10 && n++;
	return n;
}
function c(e, n, r = 512, i = !1) {
	let a = t(e) ? e.indexOf("\\begin{document}") : -1;
	if (a < 0) return null;
	let o = e.indexOf("\n", a);
	if (o < 0) return null;
	let c = o + 1;
	if (n < c + r) return null;
	let d = e.lastIndexOf("\n", Math.min(n, e.length) - 1) + 1;
	if (i && l(e, d)) return s(e, d);
	let f = i ? Math.max(c, e.lastIndexOf("\n", d - 2) + 1) : r === 0 ? c : -1, p = u(e, n, c) ?? f;
	return p < c + r ? null : s(e, p);
}
function l(e, t) {
	let n = e.indexOf("\n", t), r = e.slice(t, n < 0 ? void 0 : n);
	return /^\s*\\(?:include|input|subfile)\s*\{[^}\n]+\}\s*(?:%[^\n]*)?$/.test(r);
}
function u(e, t, n) {
	let r = Math.min(t, e.length), i = 0, a = null;
	for (; r > n;) {
		let t = e.lastIndexOf("\n", r - 1);
		if (t < n) break;
		let o = e.lastIndexOf("\n", t - 1);
		if (e.slice(o + 1, t).trim() === "" && (a = t + 1, ++i >= 2)) break;
		r = t;
	}
	return a;
}
var d = class {
	engine;
	mainFile;
	maxCheckpoints;
	maxBytes;
	minHeadBytes;
	checkpoints = /* @__PURE__ */ new Map();
	last = null;
	lastMain = null;
	seq = 0;
	tick = 0;
	constructor(e, t = {}) {
		this.engine = e, this.mainFile = t.mainFile ?? "main.tex", this.maxCheckpoints = t.maxCheckpoints ?? 4, this.maxBytes = t.maxBytes ?? 335544320, this.minHeadBytes = t.minHeadBytes ?? 512;
	}
	get enabled() {
		return this.engine.supportsHeapCheckpoints;
	}
	get held() {
		return [...this.checkpoints.values()].map((e) => ({
			id: e.id,
			line: e.line,
			bytes: e.bytes
		}));
	}
	previewCheckpoint(e, t) {
		if (!(!this.enabled || this.lastMain === null)) return this.findValid(e, t, n(this.lastMain, e))?.id;
	}
	reset() {
		this.checkpoints.clear(), this.last = null, this.lastMain = null, this.engine.dropHeapCheckpoints();
	}
	invalidateFile(t) {
		if (f(t) !== t) {
			this.reset();
			return;
		}
		let n = [];
		for (let [r, i] of this.checkpoints) (!i.inputsComplete || !i.inputPaths || !i.inputPaths.some((e) => f(e) === this.mainFile) || i.inputPaths.some((t) => t.replaceAll("\\", "/").split("/").includes("..") && !e(t.trim())) || i.inputPaths.some((e) => f(e) === t)) && (this.checkpoints.delete(r), n.push(r));
		n.length && this.engine.dropHeapCheckpoints(n);
	}
	armsForFullCompile(e, t, r) {
		if (!this.enabled) return [];
		let i = [];
		if (r !== void 0) i.push(r);
		else if (this.lastMain != null) {
			let t = n(this.lastMain, e);
			(t < e.length || this.lastMain !== e) && i.push(t);
		} else i.push(e.length);
		let a = [], s = /* @__PURE__ */ new Set();
		for (let n of i) {
			let r = c(e, n, this.engine.supportsLineCheckpoints ? this.effectiveHeadFloor(e, t, n) : this.minHeadBytes, this.engine.supportsLineCheckpoints);
			r === null || s.has(r) || (s.add(r), !this.findValid(e, t, o(e, r) + 1, r) && a.push({
				id: `hc${++this.seq}`,
				line: r
			}));
		}
		return a;
	}
	effectiveHeadFloor(t, n, r) {
		let a = this.minHeadBytes, o = this.mainFile.slice(0, this.mainFile.lastIndexOf("/") + 1);
		for (let s of i(t.slice(0, r)).keys()) {
			let t = e(`${o}${s}.tex`), r = n.get(`${s}.tex`) ?? (t ? n.get(t) : void 0);
			if (a -= r?.length ?? 0, a <= 0) return 0;
		}
		return a;
	}
	noteFull(e, t, n) {
		this.last = new Map(t), this.last.set(this.mainFile, e), this.lastMain = e;
		for (let r of n.heapCheckpoints ?? []) this.remember(e, t, r);
		this.enforceBudget();
	}
	async tryResume(e, r, i, a) {
		if (!this.enabled || this.lastMain == null || t(this.lastMain)?.preamble !== t(e)?.preamble) return null;
		let o = n(this.lastMain, e), s = this.findValid(e, r, o, void 0, i);
		if (!s) return null;
		s.lastUsed = ++this.tick;
		let c = this.armsForFullCompile(e, r, a), l = await this.engine.compileFromHeapCheckpoint(s.id, c);
		if (!l.pdf) return this.checkpoints.delete(s.id), null;
		let u = !this.changeTouchesLabels(e, r);
		return this.noteFull(e, r, l), {
			result: l,
			final: u,
			checkpointId: s.id
		};
	}
	findValid(e, t, n, r, i) {
		let a = null;
		for (let o of this.checkpoints.values()) (r === void 0 || o.line === r) && this.covers(o, e, t, n) && (i && (!o.inputPaths || !i(o.inputPaths)) || (!a || o.line > a.line) && (a = o));
		return a;
	}
	covers(e, t, n, i) {
		let a = o(t, e.line);
		return a < 0 || a > i || a !== e.prefixLength || r(t.slice(0, a)) !== e.prefixHash ? !1 : this.inputsMatch(e, n);
	}
	inputsMatch(e, t) {
		for (let [n, i] of e.inputs) {
			let e = t.get(n);
			if (e === void 0 || r(e) !== i) return !1;
		}
		return !0;
	}
	changeTouchesLabels(e, t) {
		if (this.lastMain != null && a(this.lastMain, e)) return !0;
		if (!this.last) return !1;
		for (let [e, n] of t) {
			if (e === this.mainFile) continue;
			let t = this.last.get(e);
			if (t !== void 0 && t !== n && a(t, n)) return !0;
		}
		return !1;
	}
	remember(e, t, n) {
		let i = o(e, n.line);
		if (i < 0) return;
		let a = /* @__PURE__ */ new Map();
		for (let e of n.inputs ?? []) {
			let n = f(e);
			if (!n || n === this.mainFile) continue;
			let i = t.get(n);
			i !== void 0 && a.set(n, r(i));
		}
		this.checkpoints.set(n.id, {
			id: n.id,
			line: n.line,
			prefixLength: i,
			prefixHash: r(e.slice(0, i)),
			inputs: a,
			inputPaths: n.inputs ? [...n.inputs] : null,
			inputsComplete: n.inputsComplete === !0,
			bytes: n.bytes,
			lastUsed: ++this.tick
		});
	}
	async enforceBudget() {
		let e = [], t = [...this.checkpoints.values()].sort((e, t) => t.lastUsed - e.lastUsed), n = 0;
		if (t.forEach((t, r) => {
			n += t.bytes, (r >= this.maxCheckpoints || n > this.maxBytes) && e.push(t.id);
		}), e.length !== 0) {
			for (let t of e) this.checkpoints.delete(t);
			await this.engine.dropHeapCheckpoints(e);
		}
	}
};
function f(t) {
	let n = e(t.trim());
	return !n || n.startsWith("__") || n.startsWith(".") ? null : n;
}
//#endregion
export { d as HeapCheckpointCompiler, c as checkpointLineForEdit, s as lineOfOffset, o as lineStartOffset, f as projectPath };
