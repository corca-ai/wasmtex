import { defaultTexliveUrl as e } from "./default-texlive-mirrors.js";
//#region src/engine/persistent-cache.ts
function t() {
	return typeof indexedDB < "u";
}
var n = class {
	map = /* @__PURE__ */ new Map();
	async get(e) {
		return this.map.get(e) ?? null;
	}
	async set(e, t) {
		this.map.set(e, t);
	}
	async delete(e) {
		this.map.delete(e);
	}
	async keys() {
		return [...this.map.keys()];
	}
};
function r(e) {
	return new Promise((t, n) => {
		e.onsuccess = () => t(e.result), e.onerror = () => n(e.error);
	});
}
var i = class {
	dbName;
	storeName = "files";
	dbPromise = null;
	constructor(e = "wasmtex-texlive-cache") {
		this.dbName = e;
	}
	open() {
		if (this.dbPromise) return this.dbPromise;
		let e = new Promise((e, t) => {
			let n;
			try {
				n = indexedDB.open(this.dbName, 1);
			} catch (e) {
				t(e);
				return;
			}
			n.onupgradeneeded = () => {
				let e = n.result;
				e.objectStoreNames.contains(this.storeName) || e.createObjectStore(this.storeName);
			}, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
		});
		return this.dbPromise = e, e.catch(() => {
			this.dbPromise === e && (this.dbPromise = null);
		}), e;
	}
	async get(e) {
		return await r((await this.open()).transaction(this.storeName, "readonly").objectStore(this.storeName).get(e)) ?? null;
	}
	async set(e, t) {
		await r((await this.open()).transaction(this.storeName, "readwrite").objectStore(this.storeName).put(t, e));
	}
	async delete(e) {
		await r((await this.open()).transaction(this.storeName, "readwrite").objectStore(this.storeName).delete(e));
	}
	async keys() {
		return (await r((await this.open()).transaction(this.storeName, "readonly").objectStore(this.storeName).getAllKeys())).map(String);
	}
}, a = 2, o = 157286400;
function s(t, n) {
	let r = t.texliveUrl ?? (n === "2025" || n === "2026" ? e(n) : void 0);
	if (typeof r != "string" || !/^https?:\/\//i.test(r) || r.trim() !== r) return null;
	let i = t.mirrorRevision ?? null;
	if (i !== null && (typeof i != "string" || !i.trim() || i.trim() !== i)) return null;
	try {
		let e = new URL(r);
		return !["https:", "http:"].includes(e.protocol) || e.username || e.password || e.search || e.hash ? null : (e.pathname.endsWith("/") || (e.pathname += "/"), JSON.stringify([e.href, i]));
	} catch {
		return null;
	}
}
function c(e) {
	return `tl:${encodeURIComponent(e)}:`;
}
async function l(e, t) {
	for (let n of await e.keys()) n.startsWith(t) && await e.delete(n);
}
var u = class {
	store;
	version;
	identity;
	prefix;
	maxBytes;
	now;
	writeChain = Promise.resolve();
	generation = 0;
	constructor(e = {}) {
		this.version = e.version ?? "2025", this.identity = s(e, this.version), this.prefix = `${c(this.version)}v2:${encodeURIComponent(this.identity ?? "")}:`, this.store = e.store ?? (t() ? new i() : new n()), this.maxBytes = e.maxBytes ?? o, this.now = e.now ?? (() => Date.now());
	}
	metaKey() {
		return `${this.prefix}meta`;
	}
	fileKey(e, t) {
		return `${this.prefix}f:${e}/${t}`;
	}
	bloomKey() {
		return `${this.prefix}bloom`;
	}
	async readMeta() {
		if (!this.identity) return null;
		let e = await this.store.get(this.metaKey());
		if (!e) return null;
		try {
			let t = JSON.parse(new TextDecoder().decode(e));
			return t.schema !== a || t.version !== this.version || t.identity !== this.identity ? null : t;
		} catch {
			return null;
		}
	}
	async writeMeta(e) {
		let t = new TextEncoder().encode(JSON.stringify(e));
		await this.store.set(this.metaKey(), t.buffer);
	}
	async load() {
		let e = await this.readMeta();
		if (!e) return null;
		e.entries ??= {};
		let t = [], n = /* @__PURE__ */ new Set(), r = !1;
		for (let i of Object.keys(e.entries)) {
			let a = e.entries[i], o = await this.store.get(this.fileKey(a.format, a.filename));
			if (!o) {
				delete e.entries[i], r = !0;
				continue;
			}
			t.push({
				format: a.format,
				filename: a.filename,
				data: o
			}), n.add(i);
		}
		let i = e.notFound ?? [], a = i.filter((e) => !n.has(`${e.format}/${e.filename}`));
		a.length !== i.length && (r = !0);
		let o = {
			files: t,
			notFound: a
		};
		if (e.hasBloom) {
			let e = await this.store.get(this.bloomKey());
			e && (o.bloomFilter = e);
		}
		return r && await this.reconcileMeta(), o;
	}
	reconcileMeta() {
		let e = this.writeChain.then(async () => {
			let e = await this.readMeta();
			if (!e) return;
			e.entries ??= {}, e.notFound ??= [];
			let t = !1, n = /* @__PURE__ */ new Set();
			for (let r of Object.keys(e.entries)) {
				let i = e.entries[r];
				await this.store.get(this.fileKey(i.format, i.filename)) ? n.add(r) : (delete e.entries[r], t = !0);
			}
			let r = e.notFound.filter((e) => !n.has(`${e.format}/${e.filename}`));
			r.length !== e.notFound.length && (e.notFound = r, t = !0), t && await this.writeMeta(e);
		});
		return this.writeChain = e.catch(() => {}), e;
	}
	save(e) {
		let t = this.writeChain.then(() => this.doSave(e));
		return this.writeChain = t.catch(() => {}), t;
	}
	async saveFrom(e) {
		let t = this.generation, n = await e();
		t === this.generation && await this.save(n);
	}
	async doSave(e) {
		if (!this.identity) return;
		let t = await this.readMeta() ?? {
			schema: a,
			version: this.version,
			identity: this.identity,
			entries: {},
			notFound: [],
			hasBloom: !1
		};
		t.entries ??= {}, t.notFound ??= [];
		let n = this.now(), r = new Set(e.files.map((e) => `${e.format}/${e.filename}`));
		for (let r of e.files) {
			let e = `${r.format}/${r.filename}`;
			await this.store.set(this.fileKey(r.format, r.filename), r.data), t.entries[e] = {
				format: r.format,
				filename: r.filename,
				size: r.data.byteLength,
				lastAccess: n
			};
		}
		t.notFound = t.notFound.filter((e) => !r.has(`${e.format}/${e.filename}`));
		let i = new Set(t.notFound.map((e) => `${e.format}/${e.filename}`));
		for (let n of e.notFound) {
			let e = `${n.format}/${n.filename}`, r = t.entries[e];
			if (r) {
				if (await this.store.get(this.fileKey(r.format, r.filename))) continue;
				delete t.entries[e];
			}
			i.has(e) || (i.add(e), t.notFound.push(n));
		}
		e.bloomFilter && (await this.store.set(this.bloomKey(), e.bloomFilter), t.hasBloom = !0), await this.evict(t, r), await this.writeMeta(t);
	}
	async evict(e, t = /* @__PURE__ */ new Set()) {
		let n = 0;
		for (let t of Object.keys(e.entries)) n += e.entries[t].size;
		if (n <= this.maxBytes) return;
		let r = Object.keys(e.entries).sort((t, n) => e.entries[t].lastAccess - e.entries[n].lastAccess);
		for (let i of r) {
			if (n <= this.maxBytes) break;
			if (t.has(i)) continue;
			let r = e.entries[i];
			await this.store.delete(this.fileKey(r.format, r.filename)), n -= r.size, delete e.entries[i];
		}
	}
	clear() {
		this.generation += 1;
		let e = this.writeChain.then(async () => {
			this.identity && await l(this.store, this.prefix);
		});
		return this.writeChain = e.catch(() => {}), e;
	}
};
async function d(e) {
	t() && await l(new i(), c(e?.version ?? "2025"));
}
//#endregion
export { i as IndexedDbBinaryStore, n as MemoryBinaryStore, u as PersistentCache, d as clearTexliveCache, t as isIndexedDbSupported };
