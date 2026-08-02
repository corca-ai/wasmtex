import { CatalogIdentityError as n, readCatalogText as c, validCatalogIdentity as d, sameCatalogIdentity as l } from "./catalog-transport.js";
const f = 1;
function o(s) {
  return d(s, f);
}
function h(s, t) {
  return l(s, t);
}
function u(s, t) {
  if (!o(s) || !h(s, t))
    throw new n("catalog index does not match the selected compile profile");
  const e = s;
  if (!e.shards || typeof e.shards != "object")
    throw new Error("catalog index has no shards");
  for (const r of Object.values(e.shards))
    if (!r || typeof r.path != "string" || r.path.includes("/") || !Number.isSafeInteger(r.count) || r.count < 0 || !/^[a-f0-9]{64}$/.test(r.sha256))
      throw new Error("catalog index contains an invalid shard descriptor");
  return s;
}
function g(s, t, e, r) {
  if (!o(s) || !h(s, e))
    throw new n(`${t} shard does not match the selected compile profile`);
  const a = s;
  if (a.kind !== t || !Array.isArray(a.resources) || a.resources.length !== r)
    throw new Error(`${t} shard has an invalid kind or resource count`);
  for (const i of a.resources)
    if (!i || typeof i.name != "string" || typeof i.fileName != "string" || typeof i.key != "string" || typeof i.sourcePath != "string" || typeof i.texlivePackage != "string" || i.texliveYear !== e.texliveYear || i.mirrorRevision !== e.mirrorRevision)
      throw new Error(`${t} shard contains an invalid resource`);
  return s;
}
class y {
  identity;
  baseUrl;
  fetchImpl;
  store;
  states = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  indexPromise;
  listeners = /* @__PURE__ */ new Set();
  constructor(t) {
    if (!o(t.identity)) throw new Error("invalid expected catalog identity");
    this.identity = t.identity, this.baseUrl = `${t.baseUrl.replace(/\/$/, "")}/catalog/${this.identity.mirrorRevision}`, this.fetchImpl = (t.fetchImpl ?? globalThis.fetch).bind(globalThis), this.store = t.store;
  }
  getState(t) {
    return this.states.get(t) ?? { status: "idle" };
  }
  load(t, e) {
    if (e?.isCancellationRequested) return Promise.resolve(this.getState(t));
    const r = this.getState(t);
    if (r.status === "ready" || r.status === "mismatch") return Promise.resolve(r);
    const a = this.pending.get(t);
    if (a) return a;
    this.setState(t, { status: "loading" });
    const i = this.loadShard(t).finally(() => this.pending.delete(t));
    return this.pending.set(t, i), i;
  }
  subscribe(t) {
    return this.listeners.add(t), () => this.listeners.delete(t);
  }
  setState(t, e) {
    this.states.set(t, e);
    for (const r of this.listeners) r();
    return e;
  }
  async loadShard(t) {
    try {
      const r = (await this.loadIndex()).shards[t];
      if (!r) throw new Error(`${t} shard is absent from the catalog index`);
      const a = await this.read(`${r.path}`, r.sha256), i = g(JSON.parse(a), t, this.identity, r.count);
      return this.setState(t, { status: "ready", shard: i });
    } catch (e) {
      const r = e instanceof Error ? e.message : String(e);
      return this.setState(t, {
        status: e instanceof n ? "mismatch" : "error",
        message: r
      });
    }
  }
  loadIndex() {
    return this.indexPromise ??= this.read("index.json").then((t) => u(JSON.parse(t), this.identity)).catch((t) => {
      throw this.indexPromise = void 0, t;
    }), this.indexPromise;
  }
  async read(t, e) {
    return c({
      baseUrl: this.baseUrl,
      cacheNamespace: "texcatalog",
      identity: this.identity,
      path: t,
      fetchImpl: this.fetchImpl,
      ...this.store ? { store: this.store } : {},
      ...e ? { expectedSha256: e } : {},
      errorLabel: "catalog"
    });
  }
}
class p {
  identity;
  shards = /* @__PURE__ */ new Map();
  constructor(t, e) {
    if (!o(t)) throw new Error("invalid catalog identity");
    this.identity = t;
    for (const r of e) {
      if (!h(t, r)) throw new Error(`${r.kind} shard identity mismatch`);
      this.shards.set(r.kind, r);
    }
  }
  getState(t) {
    const e = this.shards.get(t);
    return e ? { status: "ready", shard: e } : { status: "error", message: `${t} is unavailable` };
  }
  async load(t) {
    return this.getState(t);
  }
}
export {
  y as HttpTexResourceCatalogProvider,
  p as InMemoryTexResourceCatalogProvider,
  f as TEX_RESOURCE_CATALOG_SCHEMA_VERSION
};
