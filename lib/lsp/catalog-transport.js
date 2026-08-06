//#region src/lsp/catalog-transport.ts
var e = class extends Error {};
function t(e, t) {
	if (!e || typeof e != "object") return !1;
	let n = e;
	return n.schemaVersion === t && /^\d{4}$/.test(n.texliveYear ?? "") && /^\d{4}-[a-f0-9]{16}$/.test(n.mirrorRevision ?? "");
}
function n(e, t) {
	return e.schemaVersion === t.schemaVersion && e.texliveYear === t.texliveYear && e.mirrorRevision === t.mirrorRevision;
}
async function r(e) {
	let t = new TextEncoder().encode(e), n = await crypto.subtle.digest("SHA-256", t);
	return [...new Uint8Array(n)].map((e) => e.toString(16).padStart(2, "0")).join("");
}
async function i(e) {
	let { identity: t, path: n, expectedSha256: i } = e, a = `${e.cacheNamespace}:${t.schemaVersion}:${t.texliveYear}:${t.mirrorRevision}:${n}`, o = await e.store?.get(a).catch(() => null);
	if (o && (!i || await r(o) === i)) return o;
	let s = await e.fetchImpl(`${e.baseUrl}/${n}`);
	if (!s.ok) throw Error(`${e.errorLabel} fetch failed (${s.status}) for ${n}`);
	let c = await s.text();
	if (i && await r(c) !== i) throw Error(`${n} failed SHA-256 verification`);
	return await e.store?.set(a, c).catch(() => {}), c;
}
//#endregion
export { e as CatalogIdentityError, i as readCatalogText, n as sameCatalogIdentity, t as validCatalogIdentity };
