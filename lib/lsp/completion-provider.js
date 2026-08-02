import * as u from "monaco-editor";
import { modelToDoc as i } from "./monaco-doc.js";
import { provideCompletions as s } from "./neutral-providers.js";
const r = u.languages.CompletionItemKind, d = {
  command: r.Function,
  reference: r.Reference,
  module: r.Module,
  file: r.File,
  keyword: r.Keyword,
  text: r.Text,
  variable: r.Variable
};
function b(e, o, n) {
  return {
    triggerCharacters: ["\\", "{", "[", ",", "="],
    provideCompletionItems(t, m, p, l) {
      return l?.isCancellationRequested ? { suggestions: [] } : { suggestions: s(
        i(t),
        { line: m.lineNumber, column: m.column },
        e,
        o,
        {
          ...l ? { cancellationToken: l } : {},
          ...n ? { registry: n } : {}
        }
      ).map((a) => c(a, m)) };
    }
  };
}
function c(e, o) {
  const n = e.replacementRange, t = {
    label: e.label,
    kind: d[e.kind],
    insertText: e.insertText,
    range: n ? {
      startLineNumber: n.startLine,
      startColumn: n.startColumn,
      endLineNumber: n.endLine,
      endColumn: n.endColumn
    } : {
      startLineNumber: o.lineNumber,
      startColumn: o.column - e.replaceLength,
      endLineNumber: o.lineNumber,
      endColumn: o.column
    }
  };
  return e.snippet && (t.insertTextRules = u.languages.CompletionItemInsertTextRule.InsertAsSnippet), e.detail && (t.detail = e.detail), e.documentation && (t.documentation = { value: e.documentation }), e.sortText && (t.sortText = e.sortText), t;
}
export {
  b as createCompletionProvider
};
