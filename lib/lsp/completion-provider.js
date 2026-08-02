import * as l from "monaco-editor";
import { modelToDoc as i } from "./monaco-doc.js";
import { provideCompletionResultAsync as s } from "./neutral-providers.js";
const r = l.languages.CompletionItemKind, c = {
  command: r.Function,
  reference: r.Reference,
  module: r.Module,
  file: r.File,
  keyword: r.Keyword,
  text: r.Text,
  variable: r.Variable
};
function d(e, n) {
  return {
    ...e ? { cancellationToken: e } : {},
    ...n ? { registry: n } : {}
  };
}
function p(e, n) {
  return {
    suggestions: e.items.map((t) => f(t, n)),
    incomplete: e.isIncomplete
  };
}
function x(e, n, t) {
  return {
    triggerCharacters: ["\\", "{", "[", ",", "=", "@"],
    async provideCompletionItems(o, m, C, a) {
      if (a?.isCancellationRequested) return { suggestions: [] };
      const u = await s(
        i(o),
        { line: m.lineNumber, column: m.column },
        e,
        n,
        d(a, t)
      );
      return p(u, m);
    }
  };
}
function f(e, n) {
  const t = e.replacementRange, o = {
    label: e.label,
    kind: c[e.kind],
    insertText: e.insertText,
    range: t ? {
      startLineNumber: t.startLine,
      startColumn: t.startColumn,
      endLineNumber: t.endLine,
      endColumn: t.endColumn
    } : {
      startLineNumber: n.lineNumber,
      startColumn: n.column - e.replaceLength,
      endLineNumber: n.lineNumber,
      endColumn: n.column
    }
  };
  return e.snippet && (o.insertTextRules = l.languages.CompletionItemInsertTextRule.InsertAsSnippet), e.detail && (o.detail = e.detail), e.documentation && (o.documentation = { value: e.documentation }), e.sortText && (o.sortText = e.sortText), e.data && (o.data = e.data), o;
}
export {
  x as createAsyncCompletionProvider
};
