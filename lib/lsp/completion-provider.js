import * as m from "monaco-editor";
import { modelToDoc as a } from "./monaco-doc.js";
import { provideCompletions as i } from "./neutral-providers.js";
const t = m.languages.CompletionItemKind, u = {
  command: t.Function,
  reference: t.Reference,
  module: t.Module,
  file: t.File,
  keyword: t.Keyword,
  text: t.Text,
  variable: t.Variable
};
function p(e, o) {
  return {
    triggerCharacters: ["\\", "{"],
    provideCompletionItems(n, r) {
      return { suggestions: i(
        a(n),
        { line: r.lineNumber, column: r.column },
        e,
        o
      ).map((l) => c(l, r)) };
    }
  };
}
function c(e, o) {
  const n = {
    label: e.label,
    kind: u[e.kind],
    insertText: e.insertText,
    range: {
      startLineNumber: o.lineNumber,
      startColumn: o.column - e.replaceLength,
      endLineNumber: o.lineNumber,
      endColumn: o.column
    }
  };
  return e.snippet && (n.insertTextRules = m.languages.CompletionItemInsertTextRule.InsertAsSnippet), e.detail && (n.detail = e.detail), e.documentation && (n.documentation = { value: e.documentation }), e.sortText && (n.sortText = e.sortText), n;
}
export {
  p as createCompletionProvider
};
