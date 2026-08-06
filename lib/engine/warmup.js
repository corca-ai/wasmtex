import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { KNOWN_404S as t, PRELOAD_FILES as n } from "./texlive-manifest.js";
//#region src/engine/warmup.ts
async function r(r) {
	let a = r?.texliveVersion ?? "2025", o = r?.concurrency ?? 6, s = r?.signal, c = r?.onProgress, l = e(r?.texliveUrl ?? null, a);
	i(l);
	let u = [], d = n.length, f = 0, p = [...n];
	async function m() {
		for (; p.length > 0;) {
			if (s?.aborted) return;
			let e = p.shift();
			try {
				let t = `${l}pdftex/${e.format}/${e.filename}`, n = await fetch(t, s ? { signal: s } : {});
				if (n.ok) {
					let t = await n.arrayBuffer();
					u.push({
						format: e.format,
						filename: e.filename,
						data: t
					});
				}
			} catch {}
			f++, c?.(f, d);
		}
	}
	let h = fetch(`${l}bloom-filter.bin`, s ? { signal: s } : {}).then((e) => e.ok ? e.arrayBuffer() : null).catch(() => null), g = Array.from({ length: Math.min(o, d) }, () => m());
	await Promise.all(g);
	let _ = await h;
	if (s?.aborted) throw new DOMException("Warmup aborted", "AbortError");
	let v = {
		files: u,
		notFound: [...t]
	};
	return _ && (v.bloomFilter = _), v;
}
function i(e) {
	try {
		let t = new URL(e).origin;
		if (document.querySelector(`link[rel="preconnect"][href="${t}"]`)) return;
		let n = document.createElement("link");
		n.rel = "preconnect", n.href = t, document.head.appendChild(n);
	} catch {}
}
//#endregion
export { r as warmup };
