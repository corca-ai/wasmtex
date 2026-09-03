import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { fetchBloomFilter as t } from "./bloom-filter.js";
import { KNOWN_404S as n, PRELOAD_FILES as r } from "./texlive-manifest.js";
//#region src/engine/warmup.ts
async function i(n) {
	let r = n?.texliveVersion ?? "2025", i = n?.concurrency ?? 6, o = n?.signal, c = n?.onProgress, l = e(n?.texliveUrl ?? null, r), { entries: u, notFound: d } = a(r, n);
	s(l);
	let f = [], p = u.length, m = 0, h = [...u];
	async function g() {
		for (; h.length > 0;) {
			if (o?.aborted) return;
			let e = h.shift();
			try {
				let t = `${l}pdftex/${e.format}/${e.candidate ?? e.filename}`, n = await fetch(t, o ? { signal: o } : {});
				if (n.ok) {
					let t = await n.arrayBuffer();
					f.push({
						format: e.format,
						filename: e.filename,
						data: t
					});
				}
			} catch {}
			m++, c?.(m, p);
		}
	}
	let _ = t(l, o ? { signal: o } : void 0).catch(() => null), v = Array.from({ length: Math.min(i, p) }, () => g());
	await Promise.all(v);
	let y = await _;
	if (o?.aborted) throw new DOMException("Warmup aborted", "AbortError");
	let b = {
		files: f,
		notFound: d
	};
	return y && (b.bloomFilter = y), b;
}
function a(e, t) {
	let i = t?.dependencies && t.dependencies.texliveVersion === e ? t.dependencies : void 0, a = t?.files ?? (i ? o(r, i.files) : r), s = t?.notFound ?? (i ? o(n, i.notFound) : n), c = new Set(a.map((e) => `${e.format}/${e.filename}`));
	return {
		entries: a.map((e) => ({ ...e })),
		notFound: s.filter((e) => !c.has(`${e.format}/${e.filename}`)).map((e) => ({
			format: e.format,
			filename: e.filename
		}))
	};
}
function o(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e) n.set(`${t.format}/${t.filename}`, t);
	for (let e of t) n.set(`${e.format}/${e.filename}`, e);
	return [...n.values()];
}
function s(e) {
	try {
		let t = new URL(e).origin;
		if (document.querySelector(`link[rel="preconnect"][href="${t}"]`)) return;
		let n = document.createElement("link");
		n.rel = "preconnect", n.href = t, document.head.appendChild(n);
	} catch {}
}
//#endregion
export { i as warmup };
