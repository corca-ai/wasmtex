import { bibLanguage as e, bibLanguageConfig as t } from "./bib-language.js";
import { latexLanguage as n, latexLanguageConfig as r } from "./latex-language.js";
import * as i from "monaco-editor";
//#region src/editor/setup.ts
var a = !1, o = !1, s = globalThis;
function c() {
	a || (a = !0, i.languages.register({ id: "latex" }), i.languages.setMonarchTokensProvider("latex", n), i.languages.setLanguageConfiguration("latex", r), i.languages.register({ id: "bibtex" }), i.languages.setMonarchTokensProvider("bibtex", e), i.languages.setLanguageConfiguration("bibtex", t));
}
function l() {
	o || (o = !0, !s.MonacoEnvironment?.getWorker && console.warn("[WasmTex] MonacoEnvironment.getWorker is not configured. Monaco editor workers may fail to load. Set self.MonacoEnvironment before creating WasmTex. See the Integration Guide (docs/howto.md) for a ready-to-use snippet."));
}
function u() {
	l(), c();
}
function d(e, t, n = !0) {
	c();
	let r = t.endsWith(".tex") ? "latex" : t.endsWith(".bib") ? "bibtex" : "plaintext", a = t.startsWith("/") ? t : `/${t}`, o = i.Uri.file(a), s = i.editor.getModel(o);
	return s ? (n && s.getValue() !== e && s.setValue(e), s) : i.editor.createModel(e, r, o);
}
function f(e, t) {
	return u(), i.editor.create(e, {
		model: t,
		theme: "vs-dark",
		fontSize: 14,
		lineNumbers: "on",
		minimap: { enabled: !1 },
		wordWrap: "on",
		automaticLayout: !0,
		scrollBeyondLastLine: !1,
		renderWhitespace: "none",
		tabSize: 2
	});
}
function p(e, t) {
	e.revealLineInCenter(t), e.setPosition({
		lineNumber: t,
		column: 1
	}), e.focus();
}
//#endregion
export { f as createEditor, d as createFileModel, c as ensureLanguagesRegistered, p as revealLine };
