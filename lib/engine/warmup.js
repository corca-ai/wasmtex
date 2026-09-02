import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { KNOWN_404S as t, PRELOAD_FILES as n } from "./texlive-manifest.js";
//#region src/engine/warmup.ts
async function r(t) {
	let n = t?.texliveVersion ?? "2025", r = t?.concurrency ?? 6, a = t?.signal, s = t?.onProgress, c = e(t?.texliveUrl ?? null, n), { entries: l, notFound: u } = i(n, t);
	o(c);
	let d = [], f = l.length, p = 0, m = [...l];
	async function h() {
		for (; m.length > 0;) {
			if (a?.aborted) return;
			let e = m.shift();
			try {
				let t = `${c}pdftex/${e.format}/${e.candidate ?? e.filename}`, n = await fetch(t, a ? { signal: a } : {});
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
	let g = fetch(`${c}bloom-filter.bin`, a ? { signal: a } : {}).then((e) => e.ok ? e.arrayBuffer() : null).catch(() => null), _ = Array.from({ length: Math.min(r, f) }, () => h());
	await Promise.all(_);
	let v = await g;
	if (a?.aborted) throw new DOMException("Warmup aborted", "AbortError");
	let y = {
		files: d,
		notFound: u
	};
	return v && (y.bloomFilter = v), y;
}
function i(e, r) {
	let i = r?.dependencies && r.dependencies.texliveVersion === e ? r.dependencies : void 0, o = r?.files ?? (i ? a(n, i.files) : n), s = r?.notFound ?? (i ? a(t, i.notFound) : t), c = new Set(o.map((e) => `${e.format}/${e.filename}`));
	return {
		entries: o.map((e) => ({ ...e })),
		notFound: s.filter((e) => !c.has(`${e.format}/${e.filename}`)).map((e) => ({
			format: e.format,
			filename: e.filename
		}))
	};
}
function a(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e) n.set(`${t.format}/${t.filename}`, t);
	for (let e of t) n.set(`${e.format}/${e.filename}`, e);
	return [...n.values()];
}
function o(e) {
	try {
		let t = new URL(e).origin;
		if (document.querySelector(`link[rel="preconnect"][href="${t}"]`)) return;
		let n = document.createElement("link");
		n.rel = "preconnect", n.href = t, document.head.appendChild(n);
	} catch {}
}
//#endregion
export { r as warmup };
