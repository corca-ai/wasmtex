//#region src/engine/fetch-gz.ts
async function e(e, t, n, r) {
	r?.throwIfAborted();
	let i = Number.parseInt(e.headers.get("Content-Length") || "0", 10);
	if (!e.body) {
		let t = new Uint8Array(await e.arrayBuffer());
		return t.length && n?.(t.length), t;
	}
	let a = e.body.getReader(), o = () => {
		a.cancel(r?.reason).catch(() => void 0);
	};
	r?.addEventListener("abort", o, { once: !0 });
	let s = [], c = 0;
	try {
		for (;;) {
			let { done: e, value: o } = await a.read();
			if (r?.throwIfAborted(), e) break;
			o.length && (s.push(o), c += o.length, n?.(c), Number.isFinite(i) && i > 0 && t?.(Math.min(100, Math.round(c / i * 100))));
		}
	} catch (e) {
		throw await a.cancel(e).catch(() => void 0), e;
	} finally {
		r?.removeEventListener("abort", o), a.releaseLock();
	}
	let l = new Uint8Array(c), u = 0;
	for (let e of s) l.set(e, u), u += e.length;
	return l;
}
//#endregion
export { e as readResponseWithProgress };
