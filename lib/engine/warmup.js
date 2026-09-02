import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { KNOWN_404S as t, PRELOAD_FILES as n } from "./texlive-manifest.js";
//#region src/engine/warmup.ts
async function r(t) {
	let n = t?.texliveVersion ?? "2025", r = t?.concurrency ?? 6, o = t?.signal, s = t?.onProgress, c = e(t?.texliveUrl ?? null, n), { entries: l, notFound: u } = i(n, t);
	a(c);
	let d = [], f = l.length, p = 0, m = [...l];
	async function h() {
		for (; m.length > 0;) {
			if (o?.aborted) return;
			let e = m.shift();
			try {
				let t = `${c}pdftex/${e.format}/${e.candidate ?? e.filename}`, n = await fetch(t, o ? { signal: o } : {});
				if (n.ok) {
					let t = await n.arrayBuffer();
					d.push({
						format: e.format,
						filename: e.filename,
						data: t
					});
				}
			} catch {}
			p++, s?.(p, f);
		}
	}
	let g = fetch(`${c}bloom-filter.bin`, o ? { signal: o } : {}).then((e) => e.ok ? e.arrayBuffer() : null).catch(() => null), _ = Array.from({ length: Math.min(r, f) }, () => h());
	await Promise.all(_);
	let v = await g;
	if (o?.aborted) throw new DOMException("Warmup aborted", "AbortError");
	let y = {
		files: d,
		notFound: u
	};
	return v && (y.bloomFilter = v), y;
}
function i(e, r) {
	let i = r?.dependencies && r.dependencies.texliveVersion === e ? r.dependencies : void 0, a = r?.files ?? i?.files ?? n, o = r?.notFound ?? i?.notFound ?? t;
	return {
		entries: a.map((e) => ({ ...e })),
		notFound: o.map((e) => ({
			format: e.format,
			filename: e.filename
		}))
	};
}
function a(e) {
	try {
		let t = new URL(e).origin;
		if (document.querySelector(`link[rel="preconnect"][href="${t}"]`)) return;
		let n = document.createElement("link");
		n.rel = "preconnect", n.href = t, document.head.appendChild(n);
	} catch {}
}
//#endregion
export { r as warmup };
