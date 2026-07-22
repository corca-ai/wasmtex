const o = "bibliography:bibtex", a = "bibliography:biber", d = "index";
class h {
  constructor(r) {
    this.defaults = r;
  }
  overrides = {};
  register(r, n) {
    if (n.stage !== r)
      throw new Error(
        `backend "${n.id}" declares stage "${n.stage}" but was registered for "${r}"`
      );
    this.overrides[r] = n;
  }
  resolve(r) {
    const n = this.overrides[r] ?? this.defaults?.[r] ?? null;
    if (n && n.stage !== r)
      throw new Error(
        `backend "${n.id}" declares stage "${n.stage}" but was resolved for "${r}"`
      );
    return n;
  }
  /** True if the resolved backend for `stage` runs off-device (a server backend). */
  isRemote(r) {
    return this.resolve(r)?.location === "server";
  }
}
function s(e) {
  return {
    id: e.id,
    stage: e.stage,
    ...e.version ? { version: e.version } : {},
    location: "server",
    async run(r) {
      const n = e.fetchImpl ?? fetch, i = { "x-wasmtex-stage": e.stage }, c = e.cacheKey?.(r);
      c && (i["x-wasmtex-cache-key"] = c);
      const t = await n(e.endpoint, {
        method: "POST",
        headers: i,
        body: e.encodeRequest(r)
      });
      if (!t.ok)
        throw new Error(`remote backend "${e.id}" failed: HTTP ${t.status}`);
      return e.decodeResponse(t);
    }
  };
}
function l(e) {
  return s({
    id: e.id,
    stage: e.stage,
    ...e.version ? { version: e.version } : {},
    endpoint: e.endpoint,
    encodeRequest: (r) => JSON.stringify(r),
    decodeResponse: (r) => r.text(),
    ...e.fetchImpl ? { fetchImpl: e.fetchImpl } : {},
    ...e.cacheKey ? { cacheKey: e.cacheKey } : {}
  });
}
export {
  a as BIBER_STAGE,
  o as BIBTEX_STAGE,
  h as BackendRegistry,
  d as INDEX_STAGE,
  l as createJsonTextBackend,
  s as createRemoteBackend
};
