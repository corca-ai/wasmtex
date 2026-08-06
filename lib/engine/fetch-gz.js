//#region src/engine/fetch-gz.ts
async function e(e, t) {
	let n = Number.parseInt(e.headers.get("Content-Length") || "0", 10);
	if (!t || !e.body || !n) return new Uint8Array(await e.arrayBuffer());
	let r = e.body.getReader(), i = [], a = 0;
	for (;;) {
		let { done: e, value: o } = await r.read();
		if (e) break;
		i.push(o), a += o.length, t(Math.min(100, Math.round(a / n * 100)));
	}
	let o = new Uint8Array(a), s = 0;
	for (let e of i) o.set(e, s), s += e.length;
	return o;
}
//#endregion
export { e as readResponseWithProgress };
