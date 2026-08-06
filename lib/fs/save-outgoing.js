//#region src/fs/save-outgoing.ts
function e(e, t, n) {
	return e.getFile(t) ? (e.writeFile(t, n), !0) : !1;
}
//#endregion
export { e as saveOutgoingFile };
