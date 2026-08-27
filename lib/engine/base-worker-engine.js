//#region src/engine/base-worker-engine.ts
function e(e) {
	let t = Error(e);
	return t.name = "AbortError", t;
}
function t(e) {
	return typeof e == "string" && e ? e : null;
}
function n(e) {
	if (typeof e != "object" || !e) return null;
	let n = e, r = t(n.message);
	if (!r) return null;
	let i = Error(r), a = t(n.name);
	a && (i.name = a);
	let o = t(n.stack);
	return o && (i.stack = o), i;
}
function r(e) {
	let n = t(e.filename);
	if (!n) return "";
	let r = [n];
	return typeof e.lineno == "number" && (r.push(String(e.lineno)), typeof e.colno == "number" && r.push(String(e.colno))), ` (${r.join(":")})`;
}
function i(e) {
	if (e instanceof Error) return e;
	if (typeof e != "object" || !e) return /* @__PURE__ */ Error("Worker error");
	let i = e;
	if (i.error instanceof Error) return i.error;
	let a = n(i.error);
	if (a) return a;
	let o = t(i.message) ?? "Worker error";
	return /* @__PURE__ */ Error(`${o}${r(i)}`);
}
var a = class {
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
	rejectAllPending(t) {
		if (this.pendingResponses.size === 0) return;
		let n = t instanceof Error ? t : e(t);
		for (let e of this.pendingResponses.values()) for (let t of e) t.reject(n);
		this.pendingResponses.clear();
	}
	handleWorkerError(e) {
		let t = i(e);
		return this.status = "error", this.rejectAllPending(t), t;
	}
}, o = "https://d1jectpaw0dlvl.cloudfront.net/";
function s(e, t) {
	let n = new URL(e, "https://wasmtex.invalid").pathname.split("/").filter(Boolean).filter((e) => e === "2025" || e === "2026");
	if (n.some((e) => e !== t)) throw Error(`TeX Live ${t} engine cannot use a ${n.join("/")} mirror URL`);
}
function c(e, t = "2025") {
	return e ? (s(e, t), e.endsWith("/") ? e : `${e}/`) : `${o}${t}/`;
}
//#endregion
export { a as BaseWorkerEngine, c as resolveTexliveUrl };
