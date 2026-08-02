import { CatalogIdentityError as o, readCatalogText as d, validCatalogIdentity as l, sameCatalogIdentity as m } from "./catalog-transport.js";
const f = 1;
function n(r) {
  return l(r, f);
}
function c(r, t) {
  return m(r, t);
}
function h(r) {
  return /^(?:class|package)\/[A-Za-z0-9._+-]+$/.test(r);
}
function u(r, t) {
  if (!n(r) || !c(r, t))
    throw new o(
      "semantic catalog index does not match the selected compile profile"
    );
  const e = r;
  if (!e.scopes || typeof e.scopes != "object")
    throw new Error("semantic catalog index has no scopes");
  for (const [s, i] of Object.entries(e.scopes))
    if (!h(s) || !i || !/^(?:classes|packages)\/[^/]+\.json$/.test(i.path) || i.path.includes("..") || !/^[a-f0-9]{64}$/.test(i.sha256))
      throw new Error("semantic catalog index contains an invalid scope descriptor");
  return r;
}
function y(r, t, e) {
  if (!n(r) || !c(r, e))
    throw new o(
      `${t} semantic shard does not match the selected compile profile`
    );
  const s = r;
  if (s.scope?.id !== t || !Array.isArray(s.keyFamilies) || !Array.isArray(s.commands) || !Array.isArray(s.environments) || !Array.isArray(s.colors) || !Array.isArray(s.dependencies))
    throw new Error(`${t} semantic shard has an invalid shape`);
  return r;
}
class p {
  identity;
  baseUrl;
  fetchImpl;
  store;
  states = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  indexPromise;
  listeners = /* @__PURE__ */ new Set();
  constructor(t) {
    if (!n(t.identity)) throw new Error("invalid expected semantic identity");
    this.identity = t.identity, this.baseUrl = `${t.baseUrl.replace(/\/$/, "")}/semantic/${this.identity.mirrorRevision}`, this.fetchImpl = t.fetchImpl ?? fetch, this.store = t.store;
  }
  getState(t) {
    return this.states.get(t) ?? { status: "idle" };
  }
  load(t, e) {
    if (!h(t))
      return Promise.resolve({ status: "error", message: `invalid semantic scope: ${t}` });
    if (e?.isCancellationRequested) return Promise.resolve(this.getState(t));
    const s = this.getState(t);
    if (s.status === "ready" || s.status === "absent" || s.status === "mismatch")
      return Promise.resolve(s);
    const i = this.pending.get(t);
    if (i) return i;
    this.setState(t, { status: "loading" });
    const a = this.loadShard(t).finally(() => this.pending.delete(t));
    return this.pending.set(t, a), a;
  }
  subscribe(t) {
    return this.listeners.add(t), () => this.listeners.delete(t);
  }
  setState(t, e) {
    this.states.set(t, e);
    for (const s of this.listeners) s();
    return e;
  }
  async loadShard(t) {
    try {
      const s = (await this.loadIndex()).scopes[t];
      if (!s)
        return this.setState(t, {
          status: "absent",
          message: `${t} is absent from the semantic catalog`
        });
      const i = await this.read(s.path, s.sha256), a = y(JSON.parse(i), t, this.identity);
      return this.setState(t, { status: "ready", shard: a });
    } catch (e) {
      const s = e instanceof Error ? e.message : String(e);
      return this.setState(t, {
        status: e instanceof o ? "mismatch" : "error",
        message: s
      });
    }
  }
  loadIndex() {
    return this.indexPromise ??= this.read("index.json").then((t) => u(JSON.parse(t), this.identity)).catch((t) => {
      throw this.indexPromise = void 0, t;
    }), this.indexPromise;
  }
  async read(t, e) {
    return d({
      baseUrl: this.baseUrl,
      cacheNamespace: "texsemantic",
      identity: this.identity,
      path: t,
      fetchImpl: this.fetchImpl,
      ...this.store ? { store: this.store } : {},
      ...e ? { expectedSha256: e } : {},
      errorLabel: "semantic catalog"
    });
  }
}
class S {
  identity;
  shards = /* @__PURE__ */ new Map();
  constructor(t, e) {
    if (!n(t)) throw new Error("invalid semantic catalog identity");
    this.identity = t;
    for (const s of e) {
      if (!c(t, s)) throw new Error(`${s.scope.id} identity mismatch`);
      this.shards.set(s.scope.id, s);
    }
  }
  getState(t) {
    const e = this.shards.get(t);
    return e ? { status: "ready", shard: e } : { status: "absent", message: `${t} is unavailable` };
  }
  async load(t) {
    return this.getState(t);
  }
}
function w(r, t) {
  for (const e of t.commands) r.registerCommand(e.name, e.args);
}
export {
  p as HttpTexSemanticCatalogProvider,
  S as InMemoryTexSemanticCatalogProvider,
  f as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION,
  w as registerTexSemanticShard
};
