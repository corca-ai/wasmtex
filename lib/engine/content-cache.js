class u {
  map = /* @__PURE__ */ new Map();
  get(t) {
    return this.map.get(t);
  }
  set(t, o) {
    this.map.set(t, o);
  }
}
function s(n) {
  if (n === void 0) return "undefined";
  if (n === null || typeof n != "object") return JSON.stringify(n) ?? "null";
  if (Array.isArray(n))
    return `[${Array.from(
      { length: n.length },
      (e, i) => i in n && n[i] !== void 0 ? s(n[i]) : "null"
    ).join(",")}]`;
  const t = n;
  return `{${Object.keys(t).filter((e) => t[e] !== void 0).sort().map((e) => `${JSON.stringify(e)}:${s(t[e])}`).join(",")}}`;
}
async function y(n) {
  const t = new TextEncoder().encode(s(n)), o = await crypto.subtle.digest("SHA-256", t);
  return Array.from(new Uint8Array(o)).map((e) => e.toString(16).padStart(2, "0")).join("");
}
function g(n, t) {
  return y({
    schema: "wasmtex-tool-cache",
    schemaVersion: 1,
    stage: n.stage ?? null,
    backendId: n.backendId,
    backendVersion: n.backendVersion ?? null,
    backendOptions: n.backendOptions ?? null,
    requestKey: t
  });
}
function b(n, t, o = {}) {
  const e = typeof o == "function" ? { keyOf: o } : o, i = e.keyOf ?? y, r = {
    backendId: n.id,
    stage: e.stage ?? n.stage,
    backendVersion: e.backendVersion ?? n.version,
    backendOptions: e.backendOptions
  };
  return {
    id: `${n.id}+cache`,
    stage: n.stage,
    ...r.backendVersion ? { version: r.backendVersion } : {},
    location: n.location,
    async run(a) {
      const c = await g(r, await i(a)), d = await t.get(c);
      if (d !== void 0) return d;
      const f = await n.run(a);
      return await t.set(c, f), f;
    }
  };
}
export {
  u as MemoryCacheStore,
  g as backendCacheKey,
  y as contentKey,
  b as withCache
};
