class d extends Error {
}
function f(e, t) {
  if (!e || typeof e != "object") return !1;
  const r = e;
  return r.schemaVersion === t && /^\d{4}$/.test(r.texliveYear ?? "") && /^\d{4}-[a-f0-9]{16}$/.test(r.mirrorRevision ?? "");
}
function l(e, t) {
  return e.schemaVersion === t.schemaVersion && e.texliveYear === t.texliveYear && e.mirrorRevision === t.mirrorRevision;
}
async function c(e) {
  const t = new TextEncoder().encode(e), r = await crypto.subtle.digest("SHA-256", t);
  return [...new Uint8Array(r)].map((a) => a.toString(16).padStart(2, "0")).join("");
}
async function h(e) {
  const { identity: t, path: r, expectedSha256: a } = e, s = `${e.cacheNamespace}:${t.schemaVersion}:${t.texliveYear}:${t.mirrorRevision}:${r}`, i = await e.store?.get(s).catch(() => null);
  if (i && (!a || await c(i) === a)) return i;
  const n = await e.fetchImpl(`${e.baseUrl}/${r}`);
  if (!n.ok)
    throw new Error(`${e.errorLabel} fetch failed (${n.status}) for ${r}`);
  const o = await n.text();
  if (a && await c(o) !== a)
    throw new Error(`${r} failed SHA-256 verification`);
  return await e.store?.set(s, o).catch(() => {
  }), o;
}
export {
  d as CatalogIdentityError,
  h as readCatalogText,
  l as sameCatalogIdentity,
  f as validCatalogIdentity
};
