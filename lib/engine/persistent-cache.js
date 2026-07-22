function m() {
  return typeof indexedDB < "u";
}
class u {
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
function h(c) {
  return new Promise((e, t) => {
    c.onsuccess = () => e(c.result), c.onerror = () => t(c.error);
  });
}
class y {
  constructor(e = "wasmtex-texlive-cache") {
    this.dbName = e;
  }
  storeName = "files";
  dbPromise = null;
  open() {
    if (this.dbPromise) return this.dbPromise;
    const e = new Promise((t, n) => {
      let i;
      try {
        i = indexedDB.open(this.dbName, 1);
      } catch (o) {
        n(o);
        return;
      }
      i.onupgradeneeded = () => {
        const o = i.result;
        o.objectStoreNames.contains(this.storeName) || o.createObjectStore(this.storeName);
      }, i.onsuccess = () => t(i.result), i.onerror = () => n(i.error);
    });
    return this.dbPromise = e, e.catch(() => {
      this.dbPromise === e && (this.dbPromise = null);
    }), e;
  }
  async get(e) {
    const n = (await this.open()).transaction(this.storeName, "readonly").objectStore(this.storeName);
    return await h(n.get(e)) ?? null;
  }
  async set(e, t) {
    const i = (await this.open()).transaction(this.storeName, "readwrite").objectStore(this.storeName);
    await h(i.put(t, e));
  }
  async delete(e) {
    const n = (await this.open()).transaction(this.storeName, "readwrite").objectStore(this.storeName);
    await h(n.delete(e));
  }
  async keys() {
    const t = (await this.open()).transaction(this.storeName, "readonly").objectStore(this.storeName);
    return (await h(t.getAllKeys())).map(String);
  }
}
const d = 1, w = 150 * 1024 * 1024;
class b {
  store;
  version;
  maxBytes;
  now;
  /** Serializes save() so overlapping persists can't lose-update the meta. */
  writeChain = Promise.resolve();
  constructor(e = {}) {
    this.version = e.version ?? "2025", this.store = e.store ?? (m() ? new y() : new u()), this.maxBytes = e.maxBytes ?? w, this.now = e.now ?? (() => Date.now());
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
      return t.schema !== d || t.version !== this.version ? null : t;
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
    e.entries ??= {};
    const t = [], n = /* @__PURE__ */ new Set();
    let i = !1;
    for (const r of Object.keys(e.entries)) {
      const l = e.entries[r], f = await this.store.get(this.fileKey(l.format, l.filename));
      if (!f) {
        delete e.entries[r], i = !0;
        continue;
      }
      t.push({ format: l.format, filename: l.filename, data: f }), n.add(r);
    }
    const o = e.notFound ?? [], s = o.filter(
      (r) => !n.has(`${r.format}/${r.filename}`)
    );
    s.length !== o.length && (i = !0);
    const a = { files: t, notFound: s };
    if (e.hasBloom) {
      const r = await this.store.get(this.bloomKey());
      r && (a.bloomFilter = r);
    }
    return i && await this.reconcileMeta(), a;
  }
  /** Reconcile metadata with backing blobs, serialized behind the writeChain and
   *  re-reading current state so it never overwrites a concurrent save(). */
  reconcileMeta() {
    const e = this.writeChain.then(async () => {
      const t = await this.readMeta();
      if (!t) return;
      t.entries ??= {}, t.notFound ??= [];
      let n = !1;
      const i = /* @__PURE__ */ new Set();
      for (const s of Object.keys(t.entries)) {
        const a = t.entries[s];
        await this.store.get(this.fileKey(a.format, a.filename)) ? i.add(s) : (delete t.entries[s], n = !0);
      }
      const o = t.notFound.filter(
        (s) => !i.has(`${s.format}/${s.filename}`)
      );
      o.length !== t.notFound.length && (t.notFound = o, n = !0), n && await this.writeMeta(t);
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
      schema: d,
      version: this.version,
      entries: {},
      notFound: [],
      hasBloom: !1
    };
    t.entries ??= {}, t.notFound ??= [];
    const n = this.now(), i = new Set(e.files.map((s) => `${s.format}/${s.filename}`));
    for (const s of e.files) {
      const a = `${s.format}/${s.filename}`;
      await this.store.set(this.fileKey(s.format, s.filename), s.data), t.entries[a] = {
        format: s.format,
        filename: s.filename,
        size: s.data.byteLength,
        lastAccess: n
      };
    }
    t.notFound = t.notFound.filter(
      (s) => !i.has(`${s.format}/${s.filename}`)
    );
    const o = new Set(t.notFound.map((s) => `${s.format}/${s.filename}`));
    for (const s of e.notFound) {
      const a = `${s.format}/${s.filename}`, r = t.entries[a];
      if (r) {
        if (await this.store.get(this.fileKey(r.format, r.filename))) continue;
        delete t.entries[a];
      }
      o.has(a) || (o.add(a), t.notFound.push(s));
    }
    e.bloomFilter && (await this.store.set(this.bloomKey(), e.bloomFilter), t.hasBloom = !0), await this.evict(t, i), await this.writeMeta(t);
  }
  async evict(e, t = /* @__PURE__ */ new Set()) {
    let n = 0;
    for (const o of Object.keys(e.entries)) n += e.entries[o].size;
    if (n <= this.maxBytes) return;
    const i = Object.keys(e.entries).sort(
      (o, s) => e.entries[o].lastAccess - e.entries[s].lastAccess
    );
    for (const o of i) {
      if (n <= this.maxBytes) break;
      if (t.has(o)) continue;
      const s = e.entries[o];
      await this.store.delete(this.fileKey(s.format, s.filename)), n -= s.size, delete e.entries[o];
    }
  }
  /** Drop everything stored for this version. */
  async clear() {
    const e = `tl:${this.version}:`;
    for (const t of await this.store.keys())
      t.startsWith(e) && await this.store.delete(t);
  }
}
async function v(c) {
  if (!m()) return;
  const e = {};
  c?.version && (e.version = c.version), await new b(e).clear();
}
export {
  y as IndexedDbBinaryStore,
  u as MemoryBinaryStore,
  b as PersistentCache,
  v as clearTexliveCache,
  m as isIndexedDbSupported
};
