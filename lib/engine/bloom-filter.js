import { AssetDownloadSession as e } from "./asset-download.js";
//#region src/engine/bloom-filter.ts
var t = ["bloom-filter.v2.bin", "bloom-filter.bin"];
async function n(n, r, i = (...e) => fetch(...e), a) {
	let o = new e(a, (e, t) => i(e, {
		...r,
		...t,
		...r?.cache ? { cache: r.cache } : {}
	}));
	for (let e of t) try {
		let t = await o.read(`${n}${e}`, {
			asset: "data",
			...r?.signal ? { signal: r.signal } : {},
			retry: !1
		});
		if (t) return new Uint8Array(t).buffer;
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError") throw e;
	}
	return null;
}
//#endregion
export { t as BLOOM_FILTER_OBJECTS, n as fetchBloomFilter };
