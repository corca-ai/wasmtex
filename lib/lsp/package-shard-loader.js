import { registerShard as i } from "./package-db.js";
function n(s) {
  if (!s || typeof s != "object") return null;
  const t = s;
  return typeof t.package != "string" || !Array.isArray(t.commands) || t.environments !== void 0 && !Array.isArray(t.environments) ? null : s;
}
class o {
  baseUrl;
  fetchImpl;
  store;
  /** In-flight or completed load per package — cached so each is fetched once. */
  resolved = /* @__PURE__ */ new Map();
  constructor(t) {
    this.baseUrl = t.baseUrl.replace(/\/$/, ""), this.fetchImpl = (t.fetchImpl ?? globalThis.fetch).bind(globalThis), this.store = t.store;
  }
  /** Load shards for the given packages (each fetched at most once). */
  async loadAll(t) {
    await Promise.all([...t].map((r) => this.load(r)));
  }
  /** Load (and register) a single package's shard, from cache or network. */
  load(t) {
    const r = this.resolved.get(t);
    if (r) return r;
    const e = this.resolve(t);
    return this.resolved.set(t, e), e.then(
      (a) => {
        a === null && this.resolved.delete(t);
      },
      () => this.resolved.delete(t)
    ), e;
  }
  async resolve(t) {
    const r = await this.fromStore(t) ?? await this.fromNetwork(t);
    return r && i(r), r;
  }
  async fromStore(t) {
    if (!this.store) return null;
    try {
      const r = await this.store.get(this.key(t));
      return r ? n(JSON.parse(r)) : null;
    } catch {
      return null;
    }
  }
  async fromNetwork(t) {
    try {
      const r = await this.fetchImpl(`${this.baseUrl}/${t}.json`);
      if (!r.ok) return null;
      const e = await r.text(), a = n(JSON.parse(e));
      return a ? (await this.store?.set(this.key(t), e).catch(() => {
      }), a) : null;
    } catch {
      return null;
    }
  }
  key(t) {
    return `pkgshard:${t}`;
  }
}
export {
  o as PackageShardLoader
};
