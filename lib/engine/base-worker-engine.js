import { defaultTexliveUrl as e } from "./default-texlive-mirrors.js";
//#region src/engine/base-worker-engine.ts
function t(e) {
	let t = Error(e);
	return t.name = "AbortError", t;
}
function n(e) {
	return typeof e == "string" && e ? e : null;
}
function r(e) {
	if (typeof e != "object" || !e) return null;
	let t = e, r = n(t.message);
	if (!r) return null;
	let i = Error(r), a = n(t.name);
	a && (i.name = a);
	let o = n(t.stack);
	return o && (i.stack = o), i;
}
function i(e) {
	let t = n(e.filename);
	if (!t) return "";
	let r = [t];
	return typeof e.lineno == "number" && (r.push(String(e.lineno)), typeof e.colno == "number" && r.push(String(e.colno))), ` (${r.join(":")})`;
}
function a(e) {
	if (e instanceof Error) return e;
	if (typeof e != "object" || !e) return /* @__PURE__ */ Error("Worker error");
	let t = e;
	if (t.error instanceof Error) return t.error;
	let a = r(t.error);
	if (a) return a;
	let o = n(t.message) ?? "Worker error";
	return /* @__PURE__ */ Error(`${o}${i(t)}`);
}
var o = class {
	worker = null;
	status = "unloaded";
	enginePath;
	texliveUrl;
	pendingResponses = /* @__PURE__ */ new Map();
	onProgress;
	constructor(e, t) {
		this.enginePath = e, this.texliveUrl = t;
	}
	getStatus() {
		return this.status;
	}
	terminate() {
		this.worker && (this.worker.terminate(), this.worker = null, this.status = "unloaded", this.rejectAllPending("Engine disposed while a request was in flight"));
	}
	postMessageWithResponse(e, t, n) {
		return new Promise((r, i) => {
			let a = {
				resolve: r,
				reject: i
			}, o = this.pendingResponses.get(t);
			o ? o.push(a) : this.pendingResponses.set(t, [a]), n?.length ? this.worker.postMessage(e, n) : this.worker.postMessage(e);
		});
	}
	deliverResponse(e, t) {
		let n = this.pendingResponses.get(e);
		if (!n || n.length === 0) return !1;
		let r = n.shift();
		return n.length === 0 && this.pendingResponses.delete(e), r.resolve(t), !0;
	}
	rejectAllPending(e) {
		if (this.pendingResponses.size === 0) return;
		let n = e instanceof Error ? e : t(e);
		for (let e of this.pendingResponses.values()) for (let t of e) t.reject(n);
		this.pendingResponses.clear();
	}
	handleWorkerError(e) {
		let t = a(e);
		return this.status = "error", this.rejectAllPending(t), t;
	}
};
function s(e, t) {
	let n = new URL(e, "https://wasmtex.invalid").pathname.split("/").filter(Boolean).filter((e) => e === "2025" || e === "2026");
	if (n.some((e) => e !== t)) throw Error(`TeX Live ${t} engine cannot use a ${n.join("/")} mirror URL`);
}
function c(t, n = "2025") {
	return t ? (s(t, n), t.endsWith("/") ? t : `${t}/`) : e(n);
}
//#endregion
export { o as BaseWorkerEngine, c as resolveTexliveUrl };
