const u = 1;
class c extends Error {
}
function n(s) {
  if (!s || typeof s != "object") return !1;
  const t = s;
  return t.schemaVersion === 1 && /^\d{4}$/.test(t.texliveYear ?? "") && /^\d{4}-[a-f0-9]{16}$/.test(t.mirrorRevision ?? "");
}
function h(s, t) {
  return s.schemaVersion === t.schemaVersion && s.texliveYear === t.texliveYear && s.mirrorRevision === t.mirrorRevision;
}
function l(s, t) {
  if (!n(s) || !h(s, t))
    throw new c("catalog index does not match the selected compile profile");
  const r = s;
  if (!r.shards || typeof r.shards != "object")
    throw new Error("catalog index has no shards");
  for (const e of Object.values(r.shards))
    if (!e || typeof e.path != "string" || e.path.includes("/") || !Number.isSafeInteger(e.count) || e.count < 0 || !/^[a-f0-9]{64}$/.test(e.sha256))
      throw new Error("catalog index contains an invalid shard descriptor");
  return s;
}
function f(s, t, r, e) {
  if (!n(s) || !h(s, r))
    throw new c(`${t} shard does not match the selected compile profile`);
  const a = s;
  if (a.kind !== t || !Array.isArray(a.resources) || a.resources.length !== e)
    throw new Error(`${t} shard has an invalid kind or resource count`);
  for (const i of a.resources)
    if (!i || typeof i.name != "string" || typeof i.fileName != "string" || typeof i.key != "string" || typeof i.sourcePath != "string" || typeof i.texlivePackage != "string" || i.texliveYear !== r.texliveYear || i.mirrorRevision !== r.mirrorRevision)
      throw new Error(`${t} shard contains an invalid resource`);
  return s;
}
async function d(s) {
  const t = new TextEncoder().encode(s), r = await crypto.subtle.digest("SHA-256", t);
  return [...new Uint8Array(r)].map((e) => e.toString(16).padStart(2, "0")).join("");
}
class g {
  identity;
  baseUrl;
  fetchImpl;
  store;
  states = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  indexPromise;
  listeners = /* @__PURE__ */ new Set();
  constructor(t) {
    if (!n(t.identity)) throw new Error("invalid expected catalog identity");
    this.identity = t.identity, this.baseUrl = `${t.baseUrl.replace(/\/$/, "")}/catalog/${this.identity.mirrorRevision}`, this.fetchImpl = t.fetchImpl ?? fetch, this.store = t.store;
  }
  getState(t) {
    return this.states.get(t) ?? { status: "idle" };
  }
  load(t, r) {
    if (r?.isCancellationRequested) return Promise.resolve(this.getState(t));
    const e = this.getState(t);
    if (e.status === "ready" || e.status === "mismatch") return Promise.resolve(e);
    const a = this.pending.get(t);
    if (a) return a;
    this.setState(t, { status: "loading" });
    const i = this.loadShard(t).finally(() => this.pending.delete(t));
    return this.pending.set(t, i), i;
  }
  subscribe(t) {
    return this.listeners.add(t), () => this.listeners.delete(t);
  }
  setState(t, r) {
    this.states.set(t, r);
    for (const e of this.listeners) e();
    return r;
  }
  async loadShard(t) {
    try {
      const e = (await this.loadIndex()).shards[t];
      if (!e) throw new Error(`${t} shard is absent from the catalog index`);
      const a = await this.read(`${e.path}`, e.sha256), i = f(JSON.parse(a), t, this.identity, e.count);
      return this.setState(t, { status: "ready", shard: i });
    } catch (r) {
      const e = r instanceof Error ? r.message : String(r);
      return this.setState(t, {
        status: r instanceof c ? "mismatch" : "error",
        message: e
      });
    }
  }
  loadIndex() {
    return this.indexPromise ??= this.read("index.json").then((t) => l(JSON.parse(t), this.identity)).catch((t) => {
      throw this.indexPromise = void 0, t;
    }), this.indexPromise;
  }
  async read(t, r) {
    const e = `texcatalog:${this.identity.schemaVersion}:${this.identity.texliveYear}:${this.identity.mirrorRevision}:${t}`, a = await this.store?.get(e).catch(() => null);
    if (a && (!r || await d(a) === r)) return a;
    const i = await this.fetchImpl(`${this.baseUrl}/${t}`);
    if (!i.ok) throw new Error(`catalog fetch failed (${i.status}) for ${t}`);
    const o = await i.text();
    if (r && await d(o) !== r)
      throw new Error(`${t} failed SHA-256 verification`);
    return await this.store?.set(e, o).catch(() => {
    }), o;
  }
}
class y {
  identity;
  shards = /* @__PURE__ */ new Map();
  constructor(t, r) {
    if (!n(t)) throw new Error("invalid catalog identity");
    this.identity = t;
    for (const e of r) {
      if (!h(t, e)) throw new Error(`${e.kind} shard identity mismatch`);
      this.shards.set(e.kind, e);
    }
  }
  getState(t) {
    const r = this.shards.get(t);
    return r ? { status: "ready", shard: r } : { status: "error", message: `${t} is unavailable` };
  }
  async load(t) {
    return this.getState(t);
  }
}
export {
  g as HttpTexResourceCatalogProvider,
  y as InMemoryTexResourceCatalogProvider,
  u as TEX_RESOURCE_CATALOG_SCHEMA_VERSION
};
