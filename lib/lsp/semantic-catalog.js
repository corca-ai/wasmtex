import { getCommandSignature as e } from "./package-db.js";
import { CatalogIdentityError as t, readCatalogText as n, sameCatalogIdentity as r, validCatalogIdentity as i } from "./catalog-transport.js";
//#region src/lsp/semantic-catalog.ts
var a = 1;
function o(e) {
	return i(e, 1);
}
function s(e, t) {
	return r(e, t);
}
function c(e) {
	return /^(?:class|package)\/[A-Za-z0-9._+-]+$/.test(e);
}
function l(e, n) {
	if (!o(e) || !s(e, n)) throw new t("semantic catalog index does not match the selected compile profile");
	let r = e;
	if (!r.scopes || typeof r.scopes != "object") throw Error("semantic catalog index has no scopes");
	for (let [e, t] of Object.entries(r.scopes)) if (!c(e) || !t || !/^(?:classes|packages)\/[^/]+\.json$/.test(t.path) || t.path.includes("..") || !/^[a-f0-9]{64}$/.test(t.sha256)) throw Error("semantic catalog index contains an invalid scope descriptor");
	return e;
}
function u(e, n, r) {
	if (!o(e) || !s(e, r)) throw new t(`${n} semantic shard does not match the selected compile profile`);
	let i = e;
	if (i.scope?.id !== n || !Array.isArray(i.keyFamilies) || !Array.isArray(i.commands) || !Array.isArray(i.environments) || !Array.isArray(i.colors) || !Array.isArray(i.dependencies)) throw Error(`${n} semantic shard has an invalid shape`);
	return e;
}
var d = class {
	identity;
	baseUrl;
	fetchImpl;
	store;
	states = /* @__PURE__ */ new Map();
	pending = /* @__PURE__ */ new Map();
	indexPromise;
	listeners = /* @__PURE__ */ new Set();
	constructor(e) {
		if (!o(e.identity)) throw Error("invalid expected semantic identity");
		this.identity = e.identity, this.baseUrl = `${e.baseUrl.replace(/\/$/, "")}/semantic/${this.identity.mirrorRevision}`, this.fetchImpl = (e.fetchImpl ?? globalThis.fetch).bind(globalThis), this.store = e.store;
	}
	getState(e) {
		return this.states.get(e) ?? { status: "idle" };
	}
	load(e, t) {
		if (!c(e)) return Promise.resolve({
			status: "error",
			message: `invalid semantic scope: ${e}`
		});
		if (t?.isCancellationRequested) return Promise.resolve(this.getState(e));
		let n = this.getState(e);
		if (n.status === "ready" || n.status === "absent" || n.status === "mismatch") return Promise.resolve(n);
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
	async loadShard(e) {
		try {
			let t = (await this.loadIndex()).scopes[e];
			if (!t) return this.setState(e, {
				status: "absent",
				message: `${e} is absent from the semantic catalog`
			});
			let n = await this.read(t.path, t.sha256), r = u(JSON.parse(n), e, this.identity);
			return this.setState(e, {
				status: "ready",
				shard: r
			});
		} catch (n) {
			let r = n instanceof Error ? n.message : String(n);
			return this.setState(e, {
				status: n instanceof t ? "mismatch" : "error",
				message: r
			});
		}
	}
	loadIndex() {
		return this.indexPromise ??= this.read("index.json").then((e) => l(JSON.parse(e), this.identity)).catch((e) => {
			throw this.indexPromise = void 0, e;
		}), this.indexPromise;
	}
	async read(e, t) {
		return n({
			baseUrl: this.baseUrl,
			cacheNamespace: "texsemantic",
			identity: this.identity,
			path: e,
			fetchImpl: this.fetchImpl,
			...this.store ? { store: this.store } : {},
			...t ? { expectedSha256: t } : {},
			errorLabel: "semantic catalog"
		});
	}
}, f = class {
	identity;
	shards = /* @__PURE__ */ new Map();
	constructor(e, t) {
		if (!o(e)) throw Error("invalid semantic catalog identity");
		this.identity = e;
		for (let n of t) {
			if (!s(e, n)) throw Error(`${n.scope.id} identity mismatch`);
			this.shards.set(n.scope.id, n);
		}
	}
	getState(e) {
		let t = this.shards.get(e);
		return t ? {
			status: "ready",
			shard: t
		} : {
			status: "absent",
			message: `${e} is unavailable`
		};
	}
	async load(e) {
		return this.getState(e);
	}
};
function p(t, n) {
	for (let r of n.commands) {
		let n = e(r.name);
		t.registerCommand(r.name, n?.some((e) => e.valueKind) ? n : r.args);
	}
}
//#endregion
export { d as HttpTexSemanticCatalogProvider, f as InMemoryTexSemanticCatalogProvider, a as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION, p as registerTexSemanticShard };
