import { registerShard as e } from "./package-db.js";
//#region src/lsp/package-shard-loader.ts
function t(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	return typeof t.package != "string" || !Array.isArray(t.commands) || t.environments !== void 0 && !Array.isArray(t.environments) ? null : e;
}
var n = class {
	baseUrl;
	fetchImpl;
	store;
	resolved = /* @__PURE__ */ new Map();
	constructor(e) {
		this.baseUrl = e.baseUrl.replace(/\/$/, ""), this.fetchImpl = (e.fetchImpl ?? globalThis.fetch).bind(globalThis), this.store = e.store;
	}
	async loadAll(e) {
		await Promise.all([...e].map((e) => this.load(e)));
	}
	load(e) {
		let t = this.resolved.get(e);
		if (t) return t;
		let n = this.resolve(e);
		return this.resolved.set(e, n), n.then((t) => {
			t === null && this.resolved.delete(e);
		}, () => this.resolved.delete(e)), n;
	}
	async resolve(t) {
		let n = await this.fromStore(t) ?? await this.fromNetwork(t);
		return n && e(n), n;
	}
	async fromStore(e) {
		if (!this.store) return null;
		try {
			let n = await this.store.get(this.key(e));
			return n ? t(JSON.parse(n)) : null;
		} catch {
			return null;
		}
	}
	async fromNetwork(e) {
		try {
			let n = await this.fetchImpl(`${this.baseUrl}/${e}.json`);
			if (!n.ok) return null;
			let r = await n.text(), i = t(JSON.parse(r));
			return i ? (await this.store?.set(this.key(e), r).catch(() => {}), i) : null;
		} catch {
			return null;
		}
	}
	key(e) {
		return `pkgshard:${e}`;
	}
};
//#endregion
export { n as PackageShardLoader };
