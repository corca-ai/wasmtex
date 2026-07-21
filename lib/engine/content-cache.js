class y {
  map = /* @__PURE__ */ new Map();
  get(n) {
    return this.map.get(n);
  }
  set(n, i) {
    this.map.set(n, i);
  }
}
function e(t) {
  if (t === void 0) return "undefined";
  if (t === null || typeof t != "object") return JSON.stringify(t) ?? "null";
  if (Array.isArray(t))
    return `[${Array.from(
      { length: t.length },
      (r, o) => o in t && t[o] !== void 0 ? e(t[o]) : "null"
    ).join(",")}]`;
  const n = t;
  return `{${Object.keys(n).filter((r) => n[r] !== void 0).sort().map((r) => `${JSON.stringify(r)}:${e(n[r])}`).join(",")}}`;
}
async function c(t) {
  const n = new TextEncoder().encode(e(t)), i = await crypto.subtle.digest("SHA-256", n);
  return Array.from(new Uint8Array(i)).map((r) => r.toString(16).padStart(2, "0")).join("");
}
function f(t, n, i = c) {
  return {
    id: `${t.id}+cache`,
    location: t.location,
    async run(r) {
      const o = await i(r), s = await n.get(o);
      if (s !== void 0) return s;
      const a = await t.run(r);
      return await n.set(o, a), a;
    }
  };
}
export {
  y as MemoryCacheStore,
  c as contentKey,
  f as withCache
};
