import { normalizeProjectDependencyPath as e } from "./dependency-manifest.js";
import { extractPreamble as t } from "./preamble-utils.js";
import { firstDifference as n, hashString as r } from "./checkpoint-boundaries.js";
import { editTouchesLabels as i } from "./incremental.js";
//#region src/engine/heap-checkpoints.ts
function a(e, t) {
	if (t <= 1) return 0;
	let n = -1;
	for (let r = 1; r < t; r++) if (n = e.indexOf("\n", n + 1), n < 0) return -1;
	return n + 1;
}
function o(e, t) {
	let n = 1, r = Math.min(t, e.length);
	for (let t = 0; t < r; t++) e.charCodeAt(t) === 10 && n++;
	return n;
}
function s(e, n, r = 512, i = !1) {
	let a = t(e) ? e.indexOf("\\begin{document}") : -1;
	if (a < 0) return null;
	let s = e.indexOf("\n", a);
	if (s < 0) return null;
	let l = s + 1;
	if (n < l + r) return null;
	let u = e.lastIndexOf("\n", Math.min(n, e.length) - 1) + 1, d = i ? Math.max(l, e.lastIndexOf("\n", u - 2) + 1) : r === 0 ? l : -1, f = c(e, n, l) ?? d;
	return f < l + r ? null : o(e, f);
}
function c(e, t, n) {
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
var l = class {
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
		if (u(t) !== t) {
			this.reset();
			return;
		}
		let n = [];
		for (let [r, i] of this.checkpoints) (!i.inputsComplete || !i.inputPaths || !i.inputPaths.some((e) => u(e) === this.mainFile) || i.inputPaths.some((t) => t.replaceAll("\\", "/").split("/").includes("..") && !e(t.trim())) || i.inputPaths.some((e) => u(e) === t)) && (this.checkpoints.delete(r), n.push(r));
		n.length && this.engine.dropHeapCheckpoints(n);
	}
	armsForFullCompile(e, t, r) {
		if (!this.enabled) return [];
		let i = [];
		if (this.lastMain != null) {
			let t = n(this.lastMain, e);
			(t < e.length || this.lastMain !== e) && i.push(t);
		} else i.push(e.length);
		r !== void 0 && i.push(r);
		let o = [], c = /* @__PURE__ */ new Set();
		for (let n of i) {
			let r = s(e, n, this.minHeadBytes, this.engine.supportsLineCheckpoints);
			r === null || c.has(r) || (c.add(r), !this.findValid(e, t, a(e, r) + 1, r) && o.push({
				id: `hc${++this.seq}`,
				line: r
			}));
		}
		return o;
	}
	noteFull(e, t, n) {
		this.last = new Map(t), this.last.set(this.mainFile, e), this.lastMain = e;
		for (let r of n.heapCheckpoints ?? []) this.remember(e, t, r);
		this.enforceBudget();
	}
	async tryResume(e, r, i) {
		if (!this.enabled || this.lastMain == null || t(this.lastMain)?.preamble !== t(e)?.preamble) return null;
		let a = n(this.lastMain, e), o = this.findValid(e, r, a, void 0, i);
		if (!o) return null;
		o.lastUsed = ++this.tick;
		let s = this.armsForFullCompile(e, r), c = await this.engine.compileFromHeapCheckpoint(o.id, s);
		if (!c.pdf) return this.checkpoints.delete(o.id), null;
		let l = !this.changeTouchesLabels(e, r);
		return this.noteFull(e, r, c), {
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
	covers(e, t, n, i) {
		let o = a(t, e.line);
		return o < 0 || o > i || o !== e.prefixLength || r(t.slice(0, o)) !== e.prefixHash ? !1 : this.inputsMatch(e, n);
	}
	inputsMatch(e, t) {
		for (let [n, i] of e.inputs) {
			let e = t.get(n);
			if (e === void 0 || r(e) !== i) return !1;
		}
		return !0;
	}
	changeTouchesLabels(e, t) {
		if (this.lastMain != null && i(this.lastMain, e)) return !0;
		if (!this.last) return !1;
		for (let [e, n] of t) {
			if (e === this.mainFile) continue;
			let t = this.last.get(e);
			if (t !== void 0 && t !== n && i(t, n)) return !0;
		}
		return !1;
	}
	remember(e, t, n) {
		let i = a(e, n.line);
		if (i < 0) return;
		let o = /* @__PURE__ */ new Map();
		for (let e of n.inputs ?? []) {
			let n = u(e);
			if (!n || n === this.mainFile) continue;
			let i = t.get(n);
			i !== void 0 && o.set(n, r(i));
		}
		this.checkpoints.set(n.id, {
			id: n.id,
			line: n.line,
			prefixLength: i,
			prefixHash: r(e.slice(0, i)),
			inputs: o,
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
function u(t) {
	let n = e(t.trim());
	return !n || n.startsWith("__") || n.startsWith(".") ? null : n;
}
//#endregion
export { l as HeapCheckpointCompiler, s as checkpointLineForEdit, o as lineOfOffset, a as lineStartOffset, u as projectPath };
