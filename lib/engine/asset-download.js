import { isAssetResponse as e } from "./asset-response.js";
import { readResponseWithProgress as t } from "./fetch-gz.js";
//#region src/engine/asset-download.ts
var n = class extends Error {
	failure;
	status;
	constructor(e, t) {
		super(`TeX asset download failed: ${e}${t ? ` (${t})` : ""}`), this.failure = e, this.status = t, this.name = "AssetDownloadError";
	}
}, r = 0, i = class {
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
		let n = this.workerRequests.get(e);
		n || (n = /* @__PURE__ */ new Map(), this.workerRequests.set(e, n));
		let i = n.get(t.requestId);
		if (i === void 0) {
			if (t.phase !== "start") return;
			i = ++r, n.set(t.requestId, i);
		}
		t.phase === "end" && n.delete(t.requestId);
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
	async read(e, t) {
		let i = this.generation, c = {
			requestId: ++r,
			asset: t.asset,
			receivedBytes: 0,
			lastByteAt: null,
			retryCount: 0
		};
		try {
			for (;;) {
				t.signal?.throwIfAborted();
				try {
					return await this.transfer(e, t, c);
				} catch (e) {
					if (t.signal?.throwIfAborted(), o(e)) throw e;
					let n = a(e);
					if (!this.canRetry(t, i, n, c)) throw this.emit(c, "end", n), n;
					this.remainingRetries--, c.retryCount++, this.emit(c, "retry", n), await s([
						2e3,
						8e3,
						2e4
					][c.retryCount - 1] ?? 2e4, t.signal);
				}
			}
		} catch (e) {
			throw (t.signal?.aborted || o(e)) && this.emit(c, "end", new n("cancelled")), e;
		}
	}
	canRetry(e, t, n, r) {
		return e.retry !== !1 && t === this.generation && this.retryable(n) && r.retryCount < 3 && this.remainingRetries > 0;
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
	async validate(e, t, r) {
		try {
			let n = t.validate ? await t.validate(e) : e;
			return r.throwIfAborted(), n;
		} catch {
			throw r.throwIfAborted(), new n("invalid");
		}
	}
	async transfer(r, i, a) {
		let o = new AbortController(), s = i.signal ? AbortSignal.any([i.signal, o.signal]) : o.signal, c = () => o.abort(new n("stalled")), l = setTimeout(c, 3e4);
		a.receivedBytes = 0, a.lastByteAt = null, this.emit(a, "start");
		try {
			let o = await this.fetchImpl(r, {
				signal: s,
				cache: a.retryCount ? "reload" : "default"
			});
			if (o.status === 404) return await o.body?.cancel(), this.emit(a, "end", new n("http", 404)), null;
			if (!e(o)) throw await o.body?.cancel(), new n(o.ok ? "invalid" : "http", o.status);
			let u = await t(o, i.onPercent, (e) => {
				a.receivedBytes = e, a.lastByteAt = Date.now(), clearTimeout(l), l = setTimeout(c, 3e4), this.emit(a, "bytes");
			}, s);
			clearTimeout(l);
			let d = await this.validate(u, i, s);
			return this.emit(a, "end"), d;
		} catch (e) {
			throw o.signal.aborted ? o.signal.reason : e;
		} finally {
			clearTimeout(l);
		}
	}
};
function a(e) {
	return e instanceof n ? e : new n("network");
}
function o(e) {
	return e instanceof DOMException && e.name === "AbortError";
}
function s(e, t) {
	return new Promise((n, r) => {
		let i = setTimeout(() => {
			t?.removeEventListener("abort", a), n();
		}, e), a = () => {
			clearTimeout(i), t?.removeEventListener("abort", a), r(t?.reason);
		};
		t?.addEventListener("abort", a, { once: !0 }), t?.aborted && a();
	});
}
function c(e) {
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
		"invalid",
		"cancelled"
	].includes(t.failure)) && (t.status === void 0 || Number.isInteger(t.status) && t.status >= 100 && t.status <= 599);
}
//#endregion
export { n as AssetDownloadError, i as AssetDownloadSession, c as isAssetDownloadEvent };
