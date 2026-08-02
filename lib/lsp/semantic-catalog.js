import { CatalogIdentityError as o, readCatalogText as d, validCatalogIdentity as l, sameCatalogIdentity as m } from "./catalog-transport.js";
import { getCommandSignature as f } from "./package-db.js";
const g = 1;
function n(r) {
  return l(r, g);
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
  const s = r;
  if (!s.scopes || typeof s.scopes != "object")
    throw new Error("semantic catalog index has no scopes");
  for (const [e, i] of Object.entries(s.scopes))
    if (!h(e) || !i || !/^(?:classes|packages)\/[^/]+\.json$/.test(i.path) || i.path.includes("..") || !/^[a-f0-9]{64}$/.test(i.sha256))
      throw new Error("semantic catalog index contains an invalid scope descriptor");
  return r;
}
function y(r, t, s) {
  if (!n(r) || !c(r, s))
    throw new o(
      `${t} semantic shard does not match the selected compile profile`
    );
  const e = r;
  if (e.scope?.id !== t || !Array.isArray(e.keyFamilies) || !Array.isArray(e.commands) || !Array.isArray(e.environments) || !Array.isArray(e.colors) || !Array.isArray(e.dependencies))
    throw new Error(`${t} semantic shard has an invalid shape`);
  return r;
}
class w {
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
    this.identity = t.identity, this.baseUrl = `${t.baseUrl.replace(/\/$/, "")}/semantic/${this.identity.mirrorRevision}`, this.fetchImpl = (t.fetchImpl ?? globalThis.fetch).bind(globalThis), this.store = t.store;
  }
  getState(t) {
    return this.states.get(t) ?? { status: "idle" };
  }
  load(t, s) {
    if (!h(t))
      return Promise.resolve({ status: "error", message: `invalid semantic scope: ${t}` });
    if (s?.isCancellationRequested) return Promise.resolve(this.getState(t));
    const e = this.getState(t);
    if (e.status === "ready" || e.status === "absent" || e.status === "mismatch")
      return Promise.resolve(e);
    const i = this.pending.get(t);
    if (i) return i;
    this.setState(t, { status: "loading" });
    const a = this.loadShard(t).finally(() => this.pending.delete(t));
    return this.pending.set(t, a), a;
  }
  subscribe(t) {
    return this.listeners.add(t), () => this.listeners.delete(t);
  }
  setState(t, s) {
    this.states.set(t, s);
    for (const e of this.listeners) e();
    return s;
  }
  async loadShard(t) {
    try {
      const e = (await this.loadIndex()).scopes[t];
      if (!e)
        return this.setState(t, {
          status: "absent",
          message: `${t} is absent from the semantic catalog`
        });
      const i = await this.read(e.path, e.sha256), a = y(JSON.parse(i), t, this.identity);
      return this.setState(t, { status: "ready", shard: a });
    } catch (s) {
      const e = s instanceof Error ? s.message : String(s);
      return this.setState(t, {
        status: s instanceof o ? "mismatch" : "error",
        message: e
      });
    }
  }
  loadIndex() {
    return this.indexPromise ??= this.read("index.json").then((t) => u(JSON.parse(t), this.identity)).catch((t) => {
      throw this.indexPromise = void 0, t;
    }), this.indexPromise;
  }
  async read(t, s) {
    return d({
      baseUrl: this.baseUrl,
      cacheNamespace: "texsemantic",
      identity: this.identity,
      path: t,
      fetchImpl: this.fetchImpl,
      ...this.store ? { store: this.store } : {},
      ...s ? { expectedSha256: s } : {},
      errorLabel: "semantic catalog"
    });
  }
}
class x {
  identity;
  shards = /* @__PURE__ */ new Map();
  constructor(t, s) {
    if (!n(t)) throw new Error("invalid semantic catalog identity");
    this.identity = t;
    for (const e of s) {
      if (!c(t, e)) throw new Error(`${e.scope.id} identity mismatch`);
      this.shards.set(e.scope.id, e);
    }
  }
  getState(t) {
    const s = this.shards.get(t);
    return s ? { status: "ready", shard: s } : { status: "absent", message: `${t} is unavailable` };
  }
  async load(t) {
    return this.getState(t);
  }
}
function b(r, t) {
  for (const s of t.commands) {
    const e = f(s.name);
    r.registerCommand(
      s.name,
      e?.some((i) => i.valueKind) ? e : s.args
    );
  }
}
export {
  w as HttpTexSemanticCatalogProvider,
  x as InMemoryTexSemanticCatalogProvider,
  g as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION,
  b as registerTexSemanticShard
};
