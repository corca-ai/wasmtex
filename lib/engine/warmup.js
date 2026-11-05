import { AssetDownloadSession as e } from "./asset-download.js";
import { resolveTexliveUrl as t } from "./base-worker-engine.js";
import { fetchBloomFilter as n } from "./bloom-filter.js";
import { KNOWN_404S as r, PRELOAD_FILES as i } from "./texlive-manifest.js";
//#region src/engine/warmup.ts
async function a(r) {
	let i = r?.texliveVersion ?? "2025", a = r?.concurrency ?? 6, s = r?.signal, u = r?.onProgress, d = new e(r?.onAssetDownload), f = t(r?.texliveUrl ?? null, i), { entries: p, notFound: m } = o(i, r);
	c(f);
	let h = [], g = p.length, _ = 0, v = [...p];
	async function y() {
		for (; v.length > 0;) {
			if (s?.aborted) return;
			let e = v.shift();
			try {
				let t = `${f}pdftex/${e.format}/${e.candidate ?? e.filename}`, n = await d.read(t, {
					asset: l(e.format),
					...s ? { signal: s } : {},
					retry: !1
				});
				n && h.push({
					format: e.format,
					filename: e.filename,
					data: new Uint8Array(n).buffer
				});
			} catch {}
			_++, u?.(_, g);
		}
	}
	let b = n(f, s ? { signal: s } : void 0, void 0, r?.onAssetDownload).catch(() => null), x = Array.from({ length: Math.min(a, g) }, () => y());
	await Promise.all(x);
	let S = await b;
	if (s?.aborted) throw new DOMException("Warmup aborted", "AbortError");
	let C = {
		files: h,
		notFound: m
	};
	return S && (C.bloomFilter = S), C;
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
function l(e) {
	return e === 26 ? "package" : [
		3,
		4,
		32,
		33,
		36,
		47
	].includes(e) ? "font" : "data";
}
//#endregion
export { a as warmup };
