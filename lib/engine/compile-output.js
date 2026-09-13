//#region src/engine/compile-output.ts
function e(e) {
	let t = !1;
	for (let n of e.split(/\r?\n/)) /^![ \t]*==>[ \t]*Fatal error occurred, no output (?:PDF|DVI) file produced![ \t]*$/.test(n) ? t = !0 : /^Output written on /.test(n) && (t = !1);
	return t;
}
function t(e, t) {
	return !t && e ? new Uint8Array(e) : null;
}
//#endregion
export { t as compileArtifact, e as hasFatalNoOutput };
