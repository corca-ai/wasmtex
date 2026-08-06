import { CatalogIdentityError as e, readCatalogText as t, sameCatalogIdentity as n, validCatalogIdentity as r } from "./catalog-transport.js";
//#region src/lsp/resource-catalog.ts
var i = 1;
function a(e) {
	return r(e, 1);
}
function o(e, t) {
	return n(e, t);
}
function s(t, n) {
	if (!a(t) || !o(t, n)) throw new e("catalog index does not match the selected compile profile");
	let r = t;
	if (!r.shards || typeof r.shards != "object") throw Error("catalog index has no shards");
	for (let e of Object.values(r.shards)) if (!e || typeof e.path != "string" || e.path.includes("/") || !Number.isSafeInteger(e.count) || e.count < 0 || !/^[a-f0-9]{64}$/.test(e.sha256)) throw Error("catalog index contains an invalid shard descriptor");
	return t;
}
function c(t, n, r, i) {
	if (!a(t) || !o(t, r)) throw new e(`${n} shard does not match the selected compile profile`);
	let s = t;
	if (s.kind !== n || !Array.isArray(s.resources) || s.resources.length !== i) throw Error(`${n} shard has an invalid kind or resource count`);
	for (let e of s.resources) if (!e || typeof e.name != "string" || typeof e.fileName != "string" || typeof e.key != "string" || typeof e.sourcePath != "string" || typeof e.texlivePackage != "string" || e.texliveYear !== r.texliveYear || e.mirrorRevision !== r.mirrorRevision) throw Error(`${n} shard contains an invalid resource`);
	return t;
}
var l = class {
	identity;
	baseUrl;
	fetchImpl;
	store;
	states = /* @__PURE__ */ new Map();
	pending = /* @__PURE__ */ new Map();
	indexPromise;
	listeners = /* @__PURE__ */ new Set();
	constructor(e) {
		if (!a(e.identity)) throw Error("invalid expected catalog identity");
		this.identity = e.identity, this.baseUrl = `${e.baseUrl.replace(/\/$/, "")}/catalog/${this.identity.mirrorRevision}`, this.fetchImpl = (e.fetchImpl ?? globalThis.fetch).bind(globalThis), this.store = e.store;
	}
	getState(e) {
		return this.states.get(e) ?? { status: "idle" };
	}
	load(e, t) {
		if (t?.isCancellationRequested) return Promise.resolve(this.getState(e));
		let n = this.getState(e);
		if (n.status === "ready" || n.status === "mismatch") return Promise.resolve(n);
		let r = this.pending.get(e);
		if (r) return r;
		this.setState(e, { status: "loading" });
		let i = this.loadShard(e).finally(() => this.pending.delete(e));
		return this.pending.set(e, i), i;
	}
	subscribe(e) {
		return this.listeners.add(e), () => this.listeners.delete(e);
	}
	setState(e, t) {
		this.states.set(e, t);
		for (let e of this.listeners) e();
		return t;
	}
	async loadShard(t) {
		try {
			let e = (await this.loadIndex()).shards[t];
			if (!e) throw Error(`${t} shard is absent from the catalog index`);
			let n = await this.read(`${e.path}`, e.sha256), r = c(JSON.parse(n), t, this.identity, e.count);
			return this.setState(t, {
				status: "ready",
				shard: r
			});
		} catch (n) {
			let r = n instanceof Error ? n.message : String(n);
			return this.setState(t, {
				status: n instanceof e ? "mismatch" : "error",
				message: r
			});
		}
	}
	loadIndex() {
		return this.indexPromise ??= this.read("index.json").then((e) => s(JSON.parse(e), this.identity)).catch((e) => {
			throw this.indexPromise = void 0, e;
		}), this.indexPromise;
	}
	async read(e, n) {
		return t({
			baseUrl: this.baseUrl,
			cacheNamespace: "texcatalog",
			identity: this.identity,
			path: e,
			fetchImpl: this.fetchImpl,
			...this.store ? { store: this.store } : {},
			...n ? { expectedSha256: n } : {},
			errorLabel: "catalog"
		});
	}
}, u = class {
	identity;
	shards = /* @__PURE__ */ new Map();
	constructor(e, t) {
		if (!a(e)) throw Error("invalid catalog identity");
		this.identity = e;
		for (let n of t) {
			if (!o(e, n)) throw Error(`${n.kind} shard identity mismatch`);
			this.shards.set(n.kind, n);
		}
	}
	getState(e) {
		let t = this.shards.get(e);
		return t ? {
			status: "ready",
			shard: t
		} : {
			status: "error",
			message: `${e} is unavailable`
		};
	}
	async load(e) {
		return this.getState(e);
	}
};
//#endregion
export { l as HttpTexResourceCatalogProvider, u as InMemoryTexResourceCatalogProvider, i as TEX_RESOURCE_CATALOG_SCHEMA_VERSION };
