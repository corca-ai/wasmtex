import * as u from "monaco-editor";
import { modelToDoc as i } from "./monaco-doc.js";
import { provideCompletionResult as d } from "./neutral-providers.js";
const r = u.languages.CompletionItemKind, c = {
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
    provideCompletionItems(t, m, f, l) {
      if (l?.isCancellationRequested) return { suggestions: [] };
      const a = d(
        i(t),
        { line: m.lineNumber, column: m.column },
        e,
        o,
        {
          ...l ? { cancellationToken: l } : {},
          ...n ? { registry: n } : {}
        }
      );
      return {
        suggestions: a.items.map((s) => p(s, m)),
        incomplete: a.isIncomplete
      };
    }
  };
}
function p(e, o) {
  const n = e.replacementRange, t = {
    label: e.label,
    kind: c[e.kind],
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
  return e.snippet && (t.insertTextRules = u.languages.CompletionItemInsertTextRule.InsertAsSnippet), e.detail && (t.detail = e.detail), e.documentation && (t.documentation = { value: e.documentation }), e.sortText && (t.sortText = e.sortText), e.data && (t.data = e.data), t;
}
export {
  b as createCompletionProvider
};
