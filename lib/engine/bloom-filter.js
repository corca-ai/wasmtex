//#region src/engine/bloom-filter.ts
var e = ["bloom-filter.v2.bin", "bloom-filter.bin"];
async function t(t, n, r = fetch) {
	for (let i of e) try {
		let e = await r(`${t}${i}`, n);
		if (e.ok) return await e.arrayBuffer();
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError") throw e;
	}
	return null;
}
//#endregion
export { e as BLOOM_FILTER_OBJECTS, t as fetchBloomFilter };
