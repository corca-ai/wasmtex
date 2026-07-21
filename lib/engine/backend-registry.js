class d {
  constructor(t = {}) {
    this.defaults = t;
  }
  overrides = /* @__PURE__ */ new Map();
  register(t, c) {
    this.overrides.set(t, c);
  }
  resolve(t) {
    return this.overrides.get(t) ?? this.defaults[t] ?? null;
  }
  /** True if the resolved backend for `stage` runs off-device (a server backend). */
  isRemote(t) {
    return this.resolve(t)?.location === "server";
  }
}
function a(e) {
  return {
    id: e.id,
    location: "server",
    async run(t) {
      const c = e.fetchImpl ?? fetch, r = { "x-wasmtex-stage": e.stage }, s = e.cacheKey?.(t);
      s && (r["x-wasmtex-cache-key"] = s);
      const n = await c(e.endpoint, {
        method: "POST",
        headers: r,
        body: e.encodeRequest(t)
      });
      if (!n.ok)
        throw new Error(`remote backend "${e.id}" failed: HTTP ${n.status}`);
      return e.decodeResponse(n);
    }
  };
}
function i(e) {
  return a({
    id: e.id,
    stage: e.stage,
    endpoint: e.endpoint,
    encodeRequest: (t) => JSON.stringify(t),
    decodeResponse: (t) => t.text(),
    ...e.fetchImpl ? { fetchImpl: e.fetchImpl } : {},
    ...e.cacheKey ? { cacheKey: e.cacheKey } : {}
  });
}
export {
  d as BackendRegistry,
  i as createJsonTextBackend,
  a as createRemoteBackend
};
