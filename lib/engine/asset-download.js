import { readResponseWithProgress as e } from "./fetch-gz.js";
//#region src/engine/asset-download.ts
var t = class extends Error {
	failure;
	status;
	constructor(e, t) {
		super(`TeX asset download failed: ${e}${t ? ` (${t})` : ""}`), this.failure = e, this.status = t, this.name = "AssetDownloadError";
	}
}, n = 0, r = class {
	onEvent;
	fetchImpl;
	remainingRetries = 8;
	generation = 0;
	workerRequests = /* @__PURE__ */ new WeakMap();
	constructor(e, t = (...e) => fetch(...e)) {
		this.onEvent = e, this.fetchImpl = t;
	}
	beginAttempt() {
		this.generation++, this.remainingRetries = 8;
	}
	recordWorkerEvent(e, t) {
		let r = this.workerRequests.get(e);
		r || (r = /* @__PURE__ */ new Map(), this.workerRequests.set(e, r));
		let i = r.get(t.requestId);
		if (i === void 0) {
			if (t.phase !== "start") return;
			i = ++n, r.set(t.requestId, i);
		}
		t.phase === "end" && r.delete(t.requestId);
		let { asset: a, phase: o, receivedBytes: s, lastByteAgeMs: c, retryCount: l, failure: u, status: d } = t;
		try {
			this.onEvent?.({
				requestId: i,
				asset: a,
				phase: o,
				receivedBytes: s,
				lastByteAgeMs: c,
				retryCount: l,
				...u === void 0 ? {} : { failure: u },
				...d === void 0 ? {} : { status: d }
			});
		} catch {}
	}
	reserveRetries() {
		let e = this.generation, t = this.remainingRetries;
		this.remainingRetries = 0;
		let n = !1;
		return {
			limit: t,
			settle: (r) => {
				n || e !== this.generation || (n = !0, r === void 0 ? this.remainingRetries += t : typeof r == "number" && Number.isInteger(r) && r >= 0 && r <= t && (this.remainingRetries += r));
			}
		};
	}
	async read(e, r) {
		let a = this.generation, o = {
			requestId: ++n,
			asset: r.asset,
			receivedBytes: 0,
			lastByteAt: null,
			retryCount: 0
		};
		try {
			for (;;) {
				r.signal?.throwIfAborted();
				try {
					return await this.transfer(e, r, o);
				} catch (e) {
					r.signal?.throwIfAborted();
					let n = e instanceof t ? e : new t("network");
					if (a !== this.generation || !this.retryable(n) || o.retryCount >= 3 || !this.remainingRetries) throw this.emit(o, "end", n), n;
					this.remainingRetries--, o.retryCount++, this.emit(o, "retry", n), await i([
						2e3,
						8e3,
						2e4
					][o.retryCount - 1] ?? 2e4, r.signal);
				}
			}
		} catch (e) {
			throw r.signal?.aborted && this.emit(o, "end"), e;
		}
	}
	retryable(e) {
		return e.failure === "network" || e.failure === "stalled" || e.failure === "http" && (e.status === 408 || e.status === 429 || e.status !== void 0 && e.status >= 500);
	}
	emit(e, t, n) {
		let { lastByteAt: r, ...i } = e;
		try {
			this.onEvent?.({
				...i,
				phase: t,
				lastByteAgeMs: r === null ? null : Math.max(0, Date.now() - r),
				...n ? { failure: n.failure } : {},
				...n?.status === void 0 ? {} : { status: n.status }
			});
		} catch {}
	}
	async validate(e, n, r) {
		try {
			let t = n.validate ? await n.validate(e) : e;
			return r.throwIfAborted(), t;
		} catch {
			throw r.throwIfAborted(), new t("invalid");
		}
	}
	async transfer(n, r, i) {
		let a = new AbortController(), o = r.signal ? AbortSignal.any([r.signal, a.signal]) : a.signal, s = () => a.abort(new t("stalled")), c = setTimeout(s, 3e4);
		i.receivedBytes = 0, i.lastByteAt = null, this.emit(i, "start");
		try {
			let a = await this.fetchImpl(n, {
				signal: o,
				cache: i.retryCount ? "reload" : "default"
			});
			if (a.status === 404) return await a.body?.cancel(), this.emit(i, "end", new t("http", 404)), null;
			if (!a.ok || a.headers.get("content-type")?.includes("text/html")) throw await a.body?.cancel(), new t(a.ok ? "invalid" : "http", a.status);
			let l = await e(a, r.onPercent, (e) => {
				i.receivedBytes = e, i.lastByteAt = Date.now(), clearTimeout(c), c = setTimeout(s, 3e4), this.emit(i, "bytes");
			}, o);
			clearTimeout(c);
			let u = await this.validate(l, r, o);
			return this.emit(i, "end"), u;
		} catch (e) {
			throw a.signal.aborted ? a.signal.reason : e;
		} finally {
			clearTimeout(c);
		}
	}
};
function i(e, t) {
	return new Promise((n, r) => {
		let i = setTimeout(() => {
			t?.removeEventListener("abort", a), n();
		}, e), a = () => {
			clearTimeout(i), t?.removeEventListener("abort", a), r(t?.reason);
		};
		t?.addEventListener("abort", a, { once: !0 }), t?.aborted && a();
	});
}
function a(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return typeof t.requestId == "number" && Number.isSafeInteger(t.requestId) && t.requestId > 0 && [
		"format",
		"package",
		"font",
		"data"
	].includes(t.asset ?? "") && [
		"start",
		"bytes",
		"retry",
		"end"
	].includes(t.phase ?? "") && typeof t.receivedBytes == "number" && Number.isSafeInteger(t.receivedBytes) && t.receivedBytes >= 0 && (t.lastByteAgeMs === null || typeof t.lastByteAgeMs == "number" && Number.isFinite(t.lastByteAgeMs) && t.lastByteAgeMs >= 0) && typeof t.retryCount == "number" && Number.isInteger(t.retryCount) && t.retryCount >= 0 && t.retryCount <= 3 && (t.failure === void 0 || [
		"stalled",
		"network",
		"http",
		"invalid"
	].includes(t.failure)) && (t.status === void 0 || Number.isInteger(t.status) && t.status >= 100 && t.status <= 599);
}
//#endregion
export { t as AssetDownloadError, r as AssetDownloadSession, a as isAssetDownloadEvent };
