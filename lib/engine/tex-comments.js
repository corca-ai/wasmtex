//#region src/engine/tex-comments.ts
function e(e) {
	return e.replace(/(^|[^\\])((?:\\\\)*)%.*$/gm, "$1$2");
}
//#endregion
export { e as stripTexComments };
