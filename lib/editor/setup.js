import * as n from "monaco-editor";
import { bibLanguage as c, bibLanguageConfig as f } from "./bib-language.js";
import { latexLanguage as d, latexLanguageConfig as m } from "./latex-language.js";
let a = !1, i = !1;
const b = globalThis;
function s() {
  a || (a = !0, n.languages.register({ id: "latex" }), n.languages.setMonarchTokensProvider("latex", d), n.languages.setLanguageConfiguration("latex", m), n.languages.register({ id: "bibtex" }), n.languages.setMonarchTokensProvider("bibtex", c), n.languages.setLanguageConfiguration("bibtex", f));
}
function x() {
  i || (i = !0, !b.MonacoEnvironment?.getWorker && console.warn(
    "[WasmTex] MonacoEnvironment.getWorker is not configured. Monaco editor workers may fail to load. Set self.MonacoEnvironment before creating WasmTex. See the Integration Guide (docs/howto.md) for a ready-to-use snippet."
  ));
}
function L() {
  x(), s();
}
function W(o, e, u = !0) {
  s();
  const g = e.endsWith(".tex") ? "latex" : e.endsWith(".bib") ? "bibtex" : "plaintext", l = e.startsWith("/") ? e : `/${e}`, t = n.Uri.file(l), r = n.editor.getModel(t);
  return r ? (u && r.getValue() !== o && r.setValue(o), r) : n.editor.createModel(o, g, t);
}
function k(o, e) {
  return L(), n.editor.create(o, {
    model: e,
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
function v(o, e) {
  o.revealLineInCenter(e), o.setPosition({ lineNumber: e, column: 1 }), o.focus();
}
export {
  k as createEditor,
  W as createFileModel,
  s as ensureLanguagesRegistered,
  v as revealLine
};
