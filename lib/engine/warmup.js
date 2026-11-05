import { isAssetResponse as e } from "./asset-response.js";
import { resolveTexliveUrl as t } from "./base-worker-engine.js";
import { fetchBloomFilter as n } from "./bloom-filter.js";
import { KNOWN_404S as r, PRELOAD_FILES as i } from "./texlive-manifest.js";
//#region src/engine/warmup.ts
async function a(r) {
	let i = r?.texliveVersion ?? "2025", a = r?.concurrency ?? 6, s = r?.signal, l = r?.onProgress, u = t(r?.texliveUrl ?? null, i), { entries: d, notFound: f } = o(i, r);
	c(u);
	let p = [], m = d.length, h = 0, g = [...d];
	async function _() {
		for (; g.length > 0;) {
			if (s?.aborted) return;
			let t = g.shift();
			try {
				let n = `${u}pdftex/${t.format}/${t.candidate ?? t.filename}`, r = await fetch(n, s ? { signal: s } : {});
				if (e(r)) {
					let e = await r.arrayBuffer();
					p.push({
						format: t.format,
						filename: t.filename,
						data: e
					});
				} else await r.body?.cancel();
			} catch {}
			h++, l?.(h, m);
		}
	}
	let v = n(u, s ? { signal: s } : void 0).catch(() => null), y = Array.from({ length: Math.min(a, m) }, () => _());
	await Promise.all(y);
	let b = await v;
	if (s?.aborted) throw new DOMException("Warmup aborted", "AbortError");
	let x = {
		files: p,
		notFound: f
	};
	return b && (x.bloomFilter = b), x;
}
function o(e, t) {
	let n = t?.dependencies && t.dependencies.texliveVersion === e ? t.dependencies : void 0, a = t?.files ?? (n ? s(i, n.files) : i), o = t?.notFound ?? (n ? s(r, n.notFound) : r), c = new Set(a.map((e) => `${e.format}/${e.filename}`));
	return {
		entries: a.map((e) => ({ ...e })),
		notFound: o.filter((e) => !c.has(`${e.format}/${e.filename}`)).map((e) => ({
			format: e.format,
			filename: e.filename
		}))
	};
}
function s(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e) n.set(`${t.format}/${t.filename}`, t);
	for (let e of t) n.set(`${e.format}/${e.filename}`, e);
	return [...n.values()];
}
function c(e) {
	try {
		let t = new URL(e).origin;
		if (document.querySelector(`link[rel="preconnect"][href="${t}"]`)) return;
		let n = document.createElement("link");
		n.rel = "preconnect", n.href = t, document.head.appendChild(n);
	} catch {}
}
//#endregion
export { a as warmup };
