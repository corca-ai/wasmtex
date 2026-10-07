//#region src/engine/engine-assets.ts
function e(e, t, n) {
	return `${e}wasmtex/${t}/wasmtex-${n}`;
}
function t(t, n, r) {
	return `${e(t, n, r)}.worker.js`;
}
function n(t, n, r) {
	return `${e(t, n, r)}.fmt`;
}
function r(e, t) {
	return t === void 0 ? e : t.endsWith("/") ? t : `${t}/`;
}
function i(e, t) {
	if (t !== void 0) try {
		return new URL(e, globalThis.document?.baseURI ?? globalThis.location?.href).href;
	} catch {
		return e;
	}
}
//#endregion
export { n as engineFormatUrl, t as engineWorkerUrl, r as formatAssetBase, i as normalizedFormatUrl };
