//#region src/engine/content-cache.ts
var e = class {
	map = /* @__PURE__ */ new Map();
	get(e) {
		return this.map.get(e);
	}
	set(e, t) {
		this.map.set(e, t);
	}
};
function t(e) {
	if (e === void 0) return "undefined";
	if (typeof e != "object" || !e) return JSON.stringify(e) ?? "null";
	if (Array.isArray(e)) return `[${Array.from({ length: e.length }, (n, r) => r in e && e[r] !== void 0 ? t(e[r]) : "null").join(",")}]`;
	let n = e;
	return `{${Object.keys(n).filter((e) => n[e] !== void 0).sort().map((e) => `${JSON.stringify(e)}:${t(n[e])}`).join(",")}}`;
}
async function n(e) {
	let n = new TextEncoder().encode(t(e)), r = await crypto.subtle.digest("SHA-256", n);
	return Array.from(new Uint8Array(r)).map((e) => e.toString(16).padStart(2, "0")).join("");
}
function r(e, t) {
	return n({
		schema: "wasmtex-tool-cache",
		schemaVersion: 1,
		stage: e.stage ?? null,
		backendId: e.backendId,
		backendVersion: e.backendVersion ?? null,
		backendOptions: e.backendOptions ?? null,
		requestKey: t
	});
}
function i(e, t, i = {}) {
	let a = typeof i == "function" ? { keyOf: i } : i, o = a.keyOf ?? n, s = {
		backendId: e.id,
		stage: a.stage ?? e.stage,
		backendVersion: a.backendVersion ?? e.version,
		backendOptions: a.backendOptions
	};
	return {
		id: `${e.id}+cache`,
		stage: e.stage,
		...s.backendVersion ? { version: s.backendVersion } : {},
		location: e.location,
		async run(n) {
			let i = await r(s, await o(n)), a = await t.get(i);
			if (a !== void 0) return a;
			let c = await e.run(n);
			return await t.set(i, c), c;
		}
	};
}
//#endregion
export { e as MemoryCacheStore, r as backendCacheKey, n as contentKey, i as withCache };
