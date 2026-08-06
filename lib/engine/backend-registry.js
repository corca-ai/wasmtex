//#region src/engine/backend-registry.ts
var e = "bibliography:bibtex", t = "bibliography:biber", n = "index", r = class {
	defaults;
	overrides = {};
	constructor(e) {
		this.defaults = e;
	}
	register(e, t) {
		if (t.stage !== e) throw Error(`backend "${t.id}" declares stage "${t.stage}" but was registered for "${e}"`);
		this.overrides[e] = t;
	}
	resolve(e) {
		let t = this.overrides[e] ?? this.defaults?.[e] ?? null;
		if (t && t.stage !== e) throw Error(`backend "${t.id}" declares stage "${t.stage}" but was resolved for "${e}"`);
		return t;
	}
	isRemote(e) {
		return this.resolve(e)?.location === "server";
	}
};
function i(e) {
	return {
		id: e.id,
		stage: e.stage,
		...e.version ? { version: e.version } : {},
		location: "server",
		async run(t) {
			let n = e.fetchImpl ?? fetch, r = { "x-wasmtex-stage": e.stage }, i = e.cacheKey?.(t);
			i && (r["x-wasmtex-cache-key"] = i);
			let a = await n(e.endpoint, {
				method: "POST",
				headers: r,
				body: e.encodeRequest(t)
			});
			if (!a.ok) throw Error(`remote backend "${e.id}" failed: HTTP ${a.status}`);
			return e.decodeResponse(a);
		}
	};
}
function a(e) {
	return i({
		id: e.id,
		stage: e.stage,
		...e.version ? { version: e.version } : {},
		endpoint: e.endpoint,
		encodeRequest: (e) => JSON.stringify(e),
		decodeResponse: (e) => e.text(),
		...e.fetchImpl ? { fetchImpl: e.fetchImpl } : {},
		...e.cacheKey ? { cacheKey: e.cacheKey } : {}
	});
}
//#endregion
export { t as BIBER_STAGE, e as BIBTEX_STAGE, r as BackendRegistry, n as INDEX_STAGE, a as createJsonTextBackend, i as createRemoteBackend };
