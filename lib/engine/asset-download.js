import { readResponseWithProgress as e } from "./fetch-gz.js";
//#region src/engine/asset-download.ts
var t = class extends Error {
	failure;
	status;
	constructor(e, t) {
		super(`TeX asset download failed: ${e}${t ? ` (${t})` : ""}`), this.failure = e, this.status = t, this.name = "AssetDownloadError";
	}
}, n = class {
	onEvent;
	fetchImpl;
	remainingRetries = 8;
	sequence = 0;
	constructor(e, t = fetch) {
		this.onEvent = e, this.fetchImpl = t;
	}
	async read(e, n) {
		let i = {
			requestId: ++this.sequence,
			asset: n.asset,
			receivedBytes: 0,
			lastByteAt: null,
			retryCount: 0
		};
		try {
			for (;;) {
				n.signal?.throwIfAborted();
				try {
					return await this.transfer(e, n, i);
				} catch (e) {
					n.signal?.throwIfAborted();
					let a = e instanceof t ? e : new t("network");
					if (!this.retryable(a) || i.retryCount >= 3 || !this.remainingRetries) throw this.emit(i, "end", a), a;
					this.remainingRetries--, i.retryCount++, this.emit(i, "retry", a), await r([
						2e3,
						8e3,
						2e4
					][i.retryCount - 1] ?? 2e4, n.signal);
				}
			}
		} catch (e) {
			throw n.signal?.aborted && this.emit(i, "end"), e;
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
function r(e, t) {
	return new Promise((n, r) => {
		let i = setTimeout(() => {
			t?.removeEventListener("abort", a), n();
		}, e), a = () => {
			clearTimeout(i), t?.removeEventListener("abort", a), r(t?.reason);
		};
		t?.addEventListener("abort", a, { once: !0 }), t?.aborted && a();
	});
}
//#endregion
export { t as AssetDownloadError, n as AssetDownloadSession };
