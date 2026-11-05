import { defaultTexliveUrl as e } from "./default-texlive-mirrors.js";
import { AssetDownloadError as t, AssetDownloadSession as n, isAssetDownloadEvent as r } from "./asset-download.js";
//#region src/engine/base-worker-engine.ts
function i(e) {
	let t = Error(e);
	return t.name = "AbortError", t;
}
function a(e) {
	return typeof e == "string" && e ? e : null;
}
function o(e) {
	if (typeof e != "object" || !e) return null;
	let t = e, n = a(t.message);
	if (!n) return null;
	let r = Error(n), i = a(t.name);
	i && (r.name = i);
	let o = a(t.stack);
	return o && (r.stack = o), r;
}
function s(e) {
	let t = a(e.filename);
	if (!t) return "";
	let n = [t];
	return typeof e.lineno == "number" && (n.push(String(e.lineno)), typeof e.colno == "number" && n.push(String(e.colno))), ` (${n.join(":")})`;
}
function c(e) {
	if (e instanceof Error) return e;
	if (typeof e != "object" || !e) return /* @__PURE__ */ Error("Worker error");
	let t = e;
	if (t.error instanceof Error) return t.error;
	let n = o(t.error);
	if (n) return n;
	let r = a(t.message) ?? "Worker error";
	return /* @__PURE__ */ Error(`${r}${s(t)}`);
}
var l = class {
	worker = null;
	status = "unloaded";
	enginePath;
	texliveUrl;
	pendingResponses = /* @__PURE__ */ new Map();
	onProgress;
	onAssetDownload;
	assetDownloadFailure = null;
	assetDownloads = new n((e) => this.onAssetDownload?.(e));
	setAssetDownloadSession(e) {
		this.assetDownloads = e;
	}
	handleAssetDownloadMessage(e) {
		return typeof e != "object" || !e || !("cmd" in e) || e.cmd !== "assetdownload" ? !1 : (r(e) && (this.assetDownloads.recordWorkerEvent(this, e), e.phase === "end" && e.failure && e.status !== 404 && (this.assetDownloadFailure = new t(e.failure, e.status))), !0);
	}
	constructor(e, t) {
		this.enginePath = e, this.texliveUrl = t;
	}
	getStatus() {
		return this.status;
	}
	terminate() {
		this.worker && (this.worker.terminate(), this.worker = null, this.status = "unloaded", this.rejectAllPending("Engine disposed while a request was in flight"), this.assetDownloadFailure = null);
	}
	postMessageWithResponse(e, t, n) {
		return new Promise((r, i) => {
			let a = this.assetDownloads.reserveRetries(), o = {
				resolve: (e) => {
					if (a.settle(typeof e == "object" && e && "assetRetriesRemaining" in e ? e.assetRetriesRemaining : void 0), this.assetDownloadFailure) {
						let e = this.assetDownloadFailure;
						this.assetDownloadFailure = null, this.status === "compiling" && (this.status = "ready"), i(e);
					} else r(e);
				},
				reject: i
			}, s = typeof e == "object" && e ? {
				...e,
				assetRetryBudget: a.limit
			} : e, c = this.pendingResponses.get(t) ?? [];
			c.push(o), this.pendingResponses.set(t, c);
			try {
				n?.length ? this.worker.postMessage(s, n) : this.worker.postMessage(s);
			} catch (e) {
				a.settle();
				let n = c.indexOf(o);
				n !== -1 && c.splice(n, 1), c.length === 0 && this.pendingResponses.get(t) === c && this.pendingResponses.delete(t), i(e);
			}
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
		let t = e instanceof Error ? e : i(e);
		for (let e of this.pendingResponses.values()) for (let n of e) n.reject(t);
		this.pendingResponses.clear();
	}
	handleWorkerError(e) {
		let t = this.assetDownloadFailure ?? c(e);
		return this.assetDownloadFailure = null, this.status = "error", this.rejectAllPending(t), t;
	}
};
function u(e, t) {
	let n = new URL(e, "https://wasmtex.invalid").pathname.split("/").filter(Boolean).filter((e) => e === "2025" || e === "2026");
	if (n.some((e) => e !== t)) throw Error(`TeX Live ${t} engine cannot use a ${n.join("/")} mirror URL`);
}
function d(t, n = "2025") {
	return t ? (u(t, n), t.endsWith("/") ? t : `${t}/`) : e(n);
}
//#endregion
export { l as BaseWorkerEngine, d as resolveTexliveUrl };
