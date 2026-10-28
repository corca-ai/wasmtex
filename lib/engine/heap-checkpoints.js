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
var d = class d {
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
		this.engine = e, this.mainFile = t.mainFile ?? "main.tex", this.maxCheckpoints = t.maxCheckpoints ?? 4, this.maxBytes = t.maxBytes ?? 335544320, this.minHeadBytes = t.minHeadBytes ?? 512, e.setCheckpointBudget?.(this.maxCheckpoints, this.maxBytes);
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
	cloneForEngine(e, t) {
		let n = new d(e, {
			mainFile: this.mainFile,
			maxCheckpoints: this.maxCheckpoints,
			maxBytes: this.maxBytes,
			minHeadBytes: this.minHeadBytes
		});
		n.last = this.last ? new Map(this.last) : null, n.lastMain = this.lastMain, n.seq = this.seq, n.tick = this.tick;
		for (let [e, r] of this.checkpoints) (t === void 0 || e === t) && n.checkpoints.set(e, {
			...r,
			inputs: new Map(r.inputs),
			inputPaths: r.inputPaths ? [...r.inputPaths] : null
		});
		return n;
	}
	previewCheckpoint(e, t) {
		if (!(!this.enabled || this.lastMain === null)) return this.findValid(e, t, n(this.lastMain, e))?.id;
	}
	previewCheckpointForEdit(e, t, n, r) {
		let i = t.get(n);
		if (!this.enabled || this.lastMain === null || i === void 0 || !Number.isSafeInteger(r) || r < 0 || r > i.length) return;
		if (n === this.mainFile) return this.findValid(e, t, r, void 0, void 0, !0)?.id;
		let a = [...this.checkpoints.values()].filter((i) => i.path === n && this.covers(i, e, t, e.length) && i.prefixLength <= r).sort((e, t) => t.prefixLength - e.prefixLength)[0];
		if (a) return a.id;
		let o = this.findValid(e, t, e.length, void 0, (e) => !e.some((e) => f(e) === n));
		return o?.inputsComplete ? o.id : void 0;
	}
	reset() {
		this.checkpoints.clear(), this.last = null, this.lastMain = null, this.engine.dropHeapCheckpoints();
	}
	invalidateFile(t, n) {
		if (f(t) !== t) {
			this.reset();
			return;
		}
		let i = [];
		for (let [a, o] of this.checkpoints) o.path === t && typeof n == "string" && r(n.slice(0, o.prefixLength)) === o.prefixHash && n.length >= o.prefixLength || (!o.inputsComplete || !o.inputPaths || !o.inputPaths.some((e) => f(e) === this.mainFile) || o.inputPaths.some((t) => t.replaceAll("\\", "/").split("/").includes("..") && !e(t.trim())) || o.inputPaths.some((e) => f(e) === t)) && (this.checkpoints.delete(a), i.push(a));
		i.length && this.engine.dropHeapCheckpoints(i);
	}
	armsForFullCompile(e, t, n, r) {
		if (!this.enabled || this.maxCheckpoints < 1) return [];
		let i = this.fullCompileOffsets(e, n), a = [], s = this.armForSecondarySource(e, t, r);
		s && a.push(s);
		let l = /* @__PURE__ */ new Set();
		for (let n of i) {
			if (a.length >= Math.min(this.maxCheckpoints, 64)) break;
			let r = c(e, n, this.engine.supportsLineCheckpoints ? this.effectiveHeadFloor(e, t, n) : this.minHeadBytes, this.engine.supportsLineCheckpoints);
			r === null || l.has(r) || (l.add(r), !this.findValid(e, t, o(e, r) + 1, r) && a.push({
				id: `hc${++this.seq}`,
				line: r
			}));
		}
		return a;
	}
	armForSecondarySource(e, t, n) {
		if (this.engine.supportsFileCheckpoints && n && n.path !== this.mainFile && f(n.path) === n.path && n.path.endsWith(".tex")) {
			let r = t.get(n.path);
			if (r !== void 0 && Number.isSafeInteger(n.offset) && n.offset > 0 && n.offset <= r.length) {
				let i = u(r, n.offset, 0) ?? Math.max(0, r.lastIndexOf("\n", r.lastIndexOf("\n", n.offset - 1) - 1) + 1), a = s(r, i);
				if (![...this.checkpoints.values()].some((r) => r.path === n.path && r.line === a && this.covers(r, e, t, e.length)) && i > 0) return {
					id: `hc${++this.seq}`,
					path: n.path,
					line: a
				};
			}
		}
		return null;
	}
	fullCompileOffsets(e, t) {
		let r = [];
		if (t !== void 0) r.push(t);
		else if (this.lastMain != null) {
			let t = n(this.lastMain, e);
			(t < e.length || this.lastMain !== e) && r.push(t);
		} else r.push(e.length);
		if (this.engine.supportsSharedCheckpoints && this.maxCheckpoints > 1) {
			let t = r[0] ?? e.length, n = [...i(e).values()].filter((t) => l(e, e.lastIndexOf("\n", t - 1) + 1));
			n.sort((e, n) => Math.abs(e - t) - Math.abs(n - t)), r.push(...n);
		}
		return r;
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
		let r = this.engine.supportsSharedCheckpoints ? n.heapCheckpointRetention : void 0, i = r && r.ids.length <= this.maxCheckpoints && r.bytes <= this.maxBytes ? new Set(r.ids) : null;
		if (i) for (let e of this.checkpoints.keys()) i.has(e) || this.checkpoints.delete(e);
		for (let r of n.heapCheckpoints ?? []) (!i || i.has(r.id)) && this.remember(e, t, r);
		i || this.enforceBudget();
	}
	async tryResume(e, r, i, a, o) {
		if (!this.enabled || this.lastMain == null || t(this.lastMain)?.preamble !== t(e)?.preamble) return null;
		let s = n(this.lastMain, e), c = this.findValid(e, r, s, void 0, i);
		if (!c) return null;
		c.lastUsed = ++this.tick;
		let l = this.armsForFullCompile(e, r, a, o), u = await this.engine.compileFromHeapCheckpoint(c.id, l);
		if (!u.pdf) return this.checkpoints.delete(c.id), null;
		let d = !this.changeTouchesLabels(e, r);
		return this.noteFull(e, r, u), {
			result: u,
			final: d,
			checkpointId: c.id
		};
	}
	findValid(e, t, n, r, i, a = !1) {
		let o = null, s = (e) => !!e.path && t.get(e.path) !== this.last?.get(e.path);
		for (let c of this.checkpoints.values()) h(c, r, a) && this.covers(c, e, t, n) && (i && (!c.inputPaths || !i(c.inputPaths)) || p(c, o, s) && (o = c));
		return o;
	}
	covers(e, t, n, i) {
		let a = e.path ? n.get(e.path) : t;
		if (a === void 0) return !1;
		let s = o(a, e.line);
		return s < 0 || !e.path && s > i || s !== e.prefixLength || r(a.slice(0, s)) !== e.prefixHash || e.path && e.inputs.get(this.mainFile) !== r(t) ? !1 : this.inputsMatch(e, n);
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
		let i = n.path;
		if (!m(n, this.mainFile)) return;
		let a = i ? t.get(i) : e;
		if (a === void 0) return;
		let s = o(a, n.line);
		if (s < 0) return;
		let c = /* @__PURE__ */ new Map();
		for (let e of n.inputs ?? []) {
			let i = f(e);
			if (!i || i === (n.path ?? this.mainFile)) continue;
			let a = t.get(i);
			a !== void 0 && c.set(i, r(a));
		}
		this.checkpoints.set(n.id, {
			id: n.id,
			...i ? { path: i } : {},
			line: n.line,
			prefixLength: s,
			prefixHash: r(a.slice(0, s)),
			inputs: c,
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
function p(e, t, n) {
	return t ? n(e) === n(t) ? !!e.path == !!t.path ? e.path === t.path && e.line > t.line : !e.path : n(e) : !0;
}
function m(e, t) {
	return e.path === void 0 || f(e.path) === e.path && e.path !== t && e.prefixSafe === !0 && e.inputsComplete === !0;
}
function h(e, t, n) {
	return n && e.path ? !1 : t === void 0 || !e.path && e.line === t;
}
//#endregion
export { d as HeapCheckpointCompiler, c as checkpointLineForEdit, s as lineOfOffset, o as lineStartOffset, f as projectPath };
