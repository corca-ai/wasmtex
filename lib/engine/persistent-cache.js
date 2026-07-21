function h() {
  return typeof indexedDB < "u";
}
class f {
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
}
function c(o) {
  return new Promise((e, t) => {
    o.onsuccess = () => e(o.result), o.onerror = () => t(o.error);
  });
}
class m {
  constructor(e = "wasmtex-texlive-cache") {
    this.dbName = e;
  }
  storeName = "files";
  dbPromise = null;
  open() {
    if (this.dbPromise) return this.dbPromise;
    const e = new Promise((t, i) => {
      let r;
      try {
        r = indexedDB.open(this.dbName, 1);
      } catch (n) {
        i(n);
        return;
      }
      r.onupgradeneeded = () => {
        const n = r.result;
        n.objectStoreNames.contains(this.storeName) || n.createObjectStore(this.storeName);
      }, r.onsuccess = () => t(r.result), r.onerror = () => i(r.error);
    });
    return this.dbPromise = e, e.catch(() => {
      this.dbPromise === e && (this.dbPromise = null);
    }), e;
  }
  async get(e) {
    const i = (await this.open()).transaction(this.storeName, "readonly").objectStore(this.storeName);
    return await c(i.get(e)) ?? null;
  }
  async set(e, t) {
    const r = (await this.open()).transaction(this.storeName, "readwrite").objectStore(this.storeName);
    await c(r.put(t, e));
  }
  async delete(e) {
    const i = (await this.open()).transaction(this.storeName, "readwrite").objectStore(this.storeName);
    await c(i.delete(e));
  }
  async keys() {
    const t = (await this.open()).transaction(this.storeName, "readonly").objectStore(this.storeName);
    return (await c(t.getAllKeys())).map(String);
  }
}
const l = 1, u = 150 * 1024 * 1024;
class d {
  store;
  version;
  maxBytes;
  now;
  /** Serializes save() so overlapping persists can't lose-update the meta. */
  writeChain = Promise.resolve();
  constructor(e = {}) {
    this.version = e.version ?? "2025", this.store = e.store ?? (h() ? new m() : new f()), this.maxBytes = e.maxBytes ?? u, this.now = e.now ?? (() => Date.now());
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
    const e = await this.store.get(this.metaKey());
    if (!e) return null;
    try {
      const t = JSON.parse(new TextDecoder().decode(e));
      return t.schema !== l || t.version !== this.version ? null : t;
    } catch {
      return null;
    }
  }
  async writeMeta(e) {
    const t = new TextEncoder().encode(JSON.stringify(e));
    await this.store.set(this.metaKey(), t.buffer);
  }
  /** Rehydrate the cached WarmupCache, or null if nothing is stored for this version. */
  async load() {
    const e = await this.readMeta();
    if (!e) return null;
    const t = [];
    let i = !1;
    for (const n of Object.keys(e.entries)) {
      const s = e.entries[n], a = await this.store.get(this.fileKey(s.format, s.filename));
      if (!a) {
        delete e.entries[n], i = !0;
        continue;
      }
      t.push({ format: s.format, filename: s.filename, data: a });
    }
    const r = { files: t, notFound: e.notFound ?? [] };
    if (e.hasBloom) {
      const n = await this.store.get(this.bloomKey());
      n && (r.bloomFilter = n);
    }
    return i && await this.prunePhantomEntries(), r;
  }
  /** Drop meta entries whose backing blob is missing, serialized behind the writeChain and
   *  re-reading the current meta so it never overwrites a file a concurrent save() recorded. */
  prunePhantomEntries() {
    const e = this.writeChain.then(async () => {
      const t = await this.readMeta();
      if (!t?.entries) return;
      let i = !1;
      for (const r of Object.keys(t.entries)) {
        const n = t.entries[r];
        await this.store.get(this.fileKey(n.format, n.filename)) || (delete t.entries[r], i = !0);
      }
      i && await this.writeMeta(t);
    });
    return this.writeChain = e.catch(() => {
    }), e;
  }
  /**
   * Persist a WarmupCache (merging into any existing entries), then evict past
   * the budget. Saves are serialized so concurrent fire-and-forget persists
   * can't lose-update the shared meta record.
   */
  save(e) {
    const t = this.writeChain.then(() => this.doSave(e));
    return this.writeChain = t.catch(() => {
    }), t;
  }
  async doSave(e) {
    const t = await this.readMeta() ?? {
      schema: l,
      version: this.version,
      entries: {},
      notFound: [],
      hasBloom: !1
    };
    t.entries ??= {}, t.notFound ??= [];
    const i = this.now();
    for (const s of e.files) {
      const a = `${s.format}/${s.filename}`;
      await this.store.set(this.fileKey(s.format, s.filename), s.data), t.entries[a] = {
        format: s.format,
        filename: s.filename,
        size: s.data.byteLength,
        lastAccess: i
      };
    }
    const r = new Set(t.notFound.map((s) => `${s.format}/${s.filename}`));
    for (const s of e.notFound) {
      const a = `${s.format}/${s.filename}`;
      r.has(a) || (r.add(a), t.notFound.push(s));
    }
    e.bloomFilter && (await this.store.set(this.bloomKey(), e.bloomFilter), t.hasBloom = !0);
    const n = new Set(e.files.map((s) => `${s.format}/${s.filename}`));
    await this.evict(t, n), await this.writeMeta(t);
  }
  async evict(e, t = /* @__PURE__ */ new Set()) {
    let i = 0;
    for (const n of Object.keys(e.entries)) i += e.entries[n].size;
    if (i <= this.maxBytes) return;
    const r = Object.keys(e.entries).sort(
      (n, s) => e.entries[n].lastAccess - e.entries[s].lastAccess
    );
    for (const n of r) {
      if (i <= this.maxBytes) break;
      if (t.has(n)) continue;
      const s = e.entries[n];
      await this.store.delete(this.fileKey(s.format, s.filename)), i -= s.size, delete e.entries[n];
    }
  }
  /** Drop everything stored for this version. */
  async clear() {
    const e = `tl:${this.version}:`;
    for (const t of await this.store.keys())
      t.startsWith(e) && await this.store.delete(t);
  }
}
async function y(o) {
  if (!h()) return;
  const e = {};
  o?.version && (e.version = o.version), await new d(e).clear();
}
export {
  m as IndexedDbBinaryStore,
  f as MemoryBinaryStore,
  d as PersistentCache,
  y as clearTexliveCache,
  h as isIndexedDbSupported
};
