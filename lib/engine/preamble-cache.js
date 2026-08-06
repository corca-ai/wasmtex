import { completionFileDigest as e } from "./completion-snapshot.js";
import { IndexedDbBinaryStore as t, MemoryBinaryStore as n, isIndexedDbSupported as r } from "./persistent-cache.js";
//#region src/engine/preamble-cache.ts
var i = 1, a = `preamble:${i}:`, o = 33554432, s = 67108864, c = 4096, l = e;
async function u(e, t) {
	return l(JSON.stringify({
		schema: i,
		...e,
		preamble: t
	}));
}
function d(e) {
	return typeof e == "string" && /^[a-f0-9]{64}$/.test(e);
}
function f(e, t) {
	return typeof e == "string" && e.length > 0 && e.length <= t && !e.includes("\0");
}
function p(e) {
	if (!e) return null;
	try {
		return JSON.parse(new TextDecoder().decode(e));
	} catch {
		return null;
	}
}
function m(e) {
	return new TextEncoder().encode(JSON.stringify(e)).buffer;
}
var h = class {
	store;
	maxBytes;
	now;
	writeChain = Promise.resolve();
	constructor(e = {}) {
		this.store = e.store ?? (r() ? new t("wasmtex-preamble-cache") : new n()), this.maxBytes = e.maxBytes ?? o, this.now = e.now ?? (() => Date.now());
	}
	indexKey() {
		return `${a}index`;
	}
	metaKey(e) {
		return `${a}${e}:meta`;
	}
	formatKey(e) {
		return `${a}${e}:fmt`;
	}
	async readIndex() {
		let e = p(await this.store.get(this.indexKey())), t = e?.entries && typeof e.entries == "object" && Object.entries(e.entries).every(([e, t]) => d(e) && typeof t?.bytes == "number" && Number.isSafeInteger(t.bytes) && t.bytes > 0 && typeof t.lastAccess == "number" && Number.isFinite(t.lastAccess));
		return e?.schema !== i || !t ? {
			schema: i,
			entries: {}
		} : e;
	}
	writeIndex(e) {
		return this.store.set(this.indexKey(), m(e));
	}
	async load(e) {
		if (!d(e)) return null;
		let [t, n] = await Promise.all([this.store.get(this.metaKey(e)), this.store.get(this.formatKey(e))]), r = p(t), a = Array.isArray(r?.inputFiles) && r.inputFiles.length <= c && r.inputFiles.every((e) => f(e, 1024)), o = Array.isArray(r?.projectDependencies) && r.projectDependencies.length <= c && r.projectDependencies.every((e) => f(e?.path, 1024) && d(e?.sha256));
		if (r?.schema !== i || r.key !== e || !f(r.workerHash, 128) || !n || n.byteLength === 0 || n.byteLength > s || r.formatBytes !== n.byteLength || !d(r.formatSha256) || !a || !o || await l(new Uint8Array(n)) !== r.formatSha256) return await this.delete(e), null;
		let u = await this.readIndex();
		return u.entries[e] && (u.entries[e].lastAccess = this.now(), await this.writeIndex(u)), {
			key: e,
			workerHash: r.workerHash,
			format: n,
			inputFiles: [...r.inputFiles],
			projectDependencies: r.projectDependencies.map((e) => ({ ...e }))
		};
	}
	save(e) {
		let t = this.writeChain.then(() => this.doSave(e));
		return this.writeChain = t.catch(() => {}), t;
	}
	async doSave(e) {
		if (!d(e.key) || !f(e.workerHash, 128) || e.format.byteLength === 0 || e.format.byteLength > s || e.format.byteLength > this.maxBytes || e.inputFiles.length > c || e.projectDependencies.length > c || !e.inputFiles.every((e) => f(e, 1024)) || !e.projectDependencies.every((e) => f(e.path, 1024) && d(e.sha256))) return;
		let t = {
			schema: i,
			key: e.key,
			workerHash: e.workerHash,
			formatBytes: e.format.byteLength,
			formatSha256: await l(new Uint8Array(e.format)),
			inputFiles: [...e.inputFiles],
			projectDependencies: e.projectDependencies.map((e) => ({ ...e }))
		};
		await Promise.all([this.store.set(this.formatKey(e.key), e.format), this.store.set(this.metaKey(e.key), m(t))]);
		let n = await this.readIndex();
		n.entries[e.key] = {
			bytes: e.format.byteLength,
			lastAccess: this.now()
		}, await this.evict(n, e.key), await this.writeIndex(n);
	}
	async evict(e, t) {
		let n = Object.values(e.entries).reduce((e, t) => e + t.bytes, 0), r = Object.entries(e.entries).sort(([, e], [, t]) => e.lastAccess - t.lastAccess);
		for (let [i, a] of r) {
			if (n <= this.maxBytes) break;
			i !== t && (await Promise.all([this.store.delete(this.metaKey(i)), this.store.delete(this.formatKey(i))]), delete e.entries[i], n -= a.bytes);
		}
	}
	async delete(e) {
		await Promise.all([this.store.delete(this.metaKey(e)), this.store.delete(this.formatKey(e))]);
		let t = await this.readIndex();
		t.entries[e] && (delete t.entries[e], await this.writeIndex(t));
	}
	async clear() {
		for (let e of await this.store.keys()) e.startsWith(a) && await this.store.delete(e);
	}
};
//#endregion
export { h as PreambleSnapshotCache, u as durablePreambleKey, l as preambleSha256 };
