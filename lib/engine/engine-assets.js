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
//#endregion
export { n as engineFormatUrl, t as engineWorkerUrl };
