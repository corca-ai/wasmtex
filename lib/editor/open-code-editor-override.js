//#region src/editor/open-code-editor-override.ts
function e(e, t) {
	let n = e.openCodeEditor, r = (t, r, i) => n.call(e, t, r, i), i = (e, n, i) => t(e, n, i, r);
	return e.openCodeEditor = i, { dispose() {
		e.openCodeEditor === i && (e.openCodeEditor = n);
	} };
}
//#endregion
export { e as installOpenCodeEditorOverride };
