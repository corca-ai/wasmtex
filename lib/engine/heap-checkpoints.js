import { extractPreamble as e } from "./preamble-utils.js";
import { firstDifference as t, hashString as n } from "./checkpoint-boundaries.js";
import { editTouchesLabels as r } from "./incremental.js";
//#region src/engine/heap-checkpoints.ts
function i(e, t) {
	if (t <= 1) return 0;
	let n = -1;
	for (let r = 1; r < t; r++) if (n = e.indexOf("\n", n + 1), n < 0) return -1;
	return n + 1;
}
function a(e, t) {
	let n = 1, r = Math.min(t, e.length);
	for (let t = 0; t < r; t++) e.charCodeAt(t) === 10 && n++;
	return n;
}
function o(t, n, r = 512, i = !1) {
	let o = e(t) ? t.indexOf("\\begin{document}") : -1;
	if (o < 0) return null;
	let c = t.indexOf("\n", o);
	if (c < 0) return null;
	let l = c + 1;
	if (n < l + r) return null;
	let u = t.lastIndexOf("\n", Math.min(n, t.length) - 1) + 1, d = i ? Math.max(l, t.lastIndexOf("\n", u - 2) + 1) : r === 0 ? l : -1, f = s(t, n, l) ?? d;
	return f < l + r ? null : a(t, f);
}
function s(e, t, n) {
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
var c = class {
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
	previewCheckpoint(e, n) {
		if (!(!this.enabled || this.lastMain === null)) return this.findValid(e, n, t(this.lastMain, e))?.id;
	}
	reset() {
		this.checkpoints.clear(), this.last = null, this.lastMain = null, this.engine.dropHeapCheckpoints();
	}
	armsForFullCompile(e, n, r) {
		if (!this.enabled) return [];
		let a = [];
		if (this.lastMain != null) {
			let n = t(this.lastMain, e);
			(n < e.length || this.lastMain !== e) && a.push(n);
		} else a.push(e.length);
		r !== void 0 && a.push(r);
		let s = [], c = /* @__PURE__ */ new Set();
		for (let t of a) {
			let r = o(e, t, this.minHeadBytes, this.engine.supportsLineCheckpoints);
			r === null || c.has(r) || (c.add(r), !this.findValid(e, n, i(e, r) + 1, r) && s.push({
				id: `hc${++this.seq}`,
				line: r
			}));
		}
		return s;
	}
	noteFull(e, t, n) {
		this.last = new Map(t), this.last.set(this.mainFile, e), this.lastMain = e;
		for (let r of n.heapCheckpoints ?? []) this.remember(e, t, r);
		this.enforceBudget();
	}
	async tryResume(n, r, i) {
		if (!this.enabled || this.lastMain == null || e(this.lastMain)?.preamble !== e(n)?.preamble) return null;
		let a = t(this.lastMain, n), o = this.findValid(n, r, a, void 0, i);
		if (!o) return null;
		o.lastUsed = ++this.tick;
		let s = this.armsForFullCompile(n, r), c = await this.engine.compileFromHeapCheckpoint(o.id, s);
		if (!c.pdf) return this.checkpoints.delete(o.id), null;
		let l = !this.changeTouchesLabels(n, r);
		return this.noteFull(n, r, c), {
			result: c,
			final: l,
			checkpointId: o.id
		};
	}
	findValid(e, t, n, r, i) {
		let a = null;
		for (let o of this.checkpoints.values()) (r === void 0 || o.line === r) && this.covers(o, e, t, n) && (i && (!o.inputPaths || !i(o.inputPaths)) || (!a || o.line > a.line) && (a = o));
		return a;
	}
	covers(e, t, r, a) {
		let o = i(t, e.line);
		return o < 0 || o > a || o !== e.prefixLength || n(t.slice(0, o)) !== e.prefixHash ? !1 : this.inputsMatch(e, r);
	}
	inputsMatch(e, t) {
		for (let [r, i] of e.inputs) {
			let e = t.get(r);
			if (e === void 0 || n(e) !== i) return !1;
		}
		return !0;
	}
	changeTouchesLabels(e, t) {
		if (this.lastMain != null && r(this.lastMain, e)) return !0;
		if (!this.last) return !1;
		for (let [e, n] of t) {
			if (e === this.mainFile) continue;
			let t = this.last.get(e);
			if (t !== void 0 && t !== n && r(t, n)) return !0;
		}
		return !1;
	}
	remember(e, t, r) {
		let a = i(e, r.line);
		if (a < 0) return;
		let o = /* @__PURE__ */ new Map();
		for (let e of r.inputs ?? []) {
			let r = l(e);
			if (!r || r === this.mainFile) continue;
			let i = t.get(r);
			i !== void 0 && o.set(r, n(i));
		}
		this.checkpoints.set(r.id, {
			id: r.id,
			line: r.line,
			prefixLength: a,
			prefixHash: n(e.slice(0, a)),
			inputs: o,
			inputPaths: r.inputs ? [...r.inputs] : null,
			bytes: r.bytes,
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
function l(e) {
	let t = e.trim();
	if (t.startsWith("/work/")) t = t.slice(6);
	else if (t.startsWith("./")) t = t.slice(2);
	else if (t.startsWith("/")) return null;
	return !t || t.startsWith("__") || t.startsWith(".") ? null : t;
}
//#endregion
export { c as HeapCheckpointCompiler, o as checkpointLineForEdit, a as lineOfOffset, i as lineStartOffset, l as projectPath };
