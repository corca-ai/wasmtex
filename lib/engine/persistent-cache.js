//#region src/engine/persistent-cache.ts
function e() {
	return typeof indexedDB < "u";
}
var t = class {
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
function n(e) {
	return new Promise((t, n) => {
		e.onsuccess = () => t(e.result), e.onerror = () => n(e.error);
	});
}
var r = class {
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
		return await n((await this.open()).transaction(this.storeName, "readonly").objectStore(this.storeName).get(e)) ?? null;
	}
	async set(e, t) {
		await n((await this.open()).transaction(this.storeName, "readwrite").objectStore(this.storeName).put(t, e));
	}
	async delete(e) {
		await n((await this.open()).transaction(this.storeName, "readwrite").objectStore(this.storeName).delete(e));
	}
	async keys() {
		return (await n((await this.open()).transaction(this.storeName, "readonly").objectStore(this.storeName).getAllKeys())).map(String);
	}
}, i = 1, a = 157286400, o = class {
	store;
	version;
	maxBytes;
	now;
	writeChain = Promise.resolve();
	constructor(n = {}) {
		this.version = n.version ?? "2025", this.store = n.store ?? (e() ? new r() : new t()), this.maxBytes = n.maxBytes ?? a, this.now = n.now ?? (() => Date.now());
	}
	metaKey() {
		return `tl:${this.version}:meta`;
	}
	fileKey(e, t) {
		return `tl:${this.version}:f:${e}/${t}`;
	}
	bloomKey() {
		return `tl:${this.version}:bloom`;
	}
	async readMeta() {
		let e = await this.store.get(this.metaKey());
		if (!e) return null;
		try {
			let t = JSON.parse(new TextDecoder().decode(e));
			return t.schema !== i || t.version !== this.version ? null : t;
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
	async doSave(e) {
		let t = await this.readMeta() ?? {
			schema: i,
			version: this.version,
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
		let a = new Set(t.notFound.map((e) => `${e.format}/${e.filename}`));
		for (let n of e.notFound) {
			let e = `${n.format}/${n.filename}`, r = t.entries[e];
			if (r) {
				if (await this.store.get(this.fileKey(r.format, r.filename))) continue;
				delete t.entries[e];
			}
			a.has(e) || (a.add(e), t.notFound.push(n));
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
	async clear() {
		let e = `tl:${this.version}:`;
		for (let t of await this.store.keys()) t.startsWith(e) && await this.store.delete(t);
	}
};
async function s(t) {
	if (!e()) return;
	let n = {};
	t?.version && (n.version = t.version), await new o(n).clear();
}
//#endregion
export { r as IndexedDbBinaryStore, t as MemoryBinaryStore, o as PersistentCache, s as clearTexliveCache, e as isIndexedDbSupported };
