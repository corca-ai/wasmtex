import * as o from "monaco-editor";
import { getSignatureHelp as d, getFoldingRanges as m, getDocumentHighlights as p, getInlayHints as f, getDocumentLinks as v, getSemanticTokens as k, getCodeActions as h } from "./language-features.js";
function c(t) {
  return new o.Range(t.startLine, t.startColumn, t.endLine, t.endColumn);
}
function b() {
  return {
    signatureHelpTriggerCharacters: ["{", "[", ","],
    signatureHelpRetriggerCharacters: ["}", "]"],
    provideSignatureHelp(t, n) {
      const e = d(t.getValue(), n.lineNumber, n.column);
      return e ? {
        value: {
          signatures: [
            {
              label: e.label,
              parameters: e.parameters.map((r) => ({ label: r }))
            }
          ],
          activeSignature: 0,
          activeParameter: e.activeParameter
        },
        dispose() {
        }
      } : null;
    }
  };
}
function P() {
  return {
    provideFoldingRanges(t) {
      return m(t.getValue()).map((n) => {
        const e = { start: n.startLine, end: n.endLine };
        return n.kind === "region" ? e.kind = o.languages.FoldingRangeKind.Region : n.kind === "comment" && (e.kind = o.languages.FoldingRangeKind.Comment), e;
      });
    }
  };
}
function S(t) {
  return {
    provideDocumentHighlights(n, e) {
      const r = n.uri.path.replace(/^\//, "");
      return p(r, e.lineNumber, e.column, t).map((i) => ({
        range: c(i),
        kind: o.languages.DocumentHighlightKind.Text
      }));
    }
  };
}
function x(t) {
  return {
    provideInlayHints(n) {
      return { hints: f(n.getValue(), t).map((r) => ({
        position: { lineNumber: r.line, column: r.column },
        label: r.label,
        kind: o.languages.InlayHintKind.Type,
        paddingLeft: !0
      })), dispose() {
      } };
    }
  };
}
function D() {
  return {
    provideLinks(t) {
      return { links: v(t.getValue()).map((e) => {
        const r = c(e.range);
        if (e.kind === "url") return { range: r, url: e.target };
        const i = t.uri.path.replace(/[^/]*$/, ""), s = /\.[^./]+$/.test(e.target) ? e.target : `${e.target}.tex`;
        return { range: r, url: o.Uri.file(`${i}${s}`) };
      }) };
    }
  };
}
const C = {
  tokenTypes: ["macro", "comment", "string", "operator"],
  tokenModifiers: []
}, H = {
  command: 0,
  comment: 1,
  verbatim: 2,
  math: 3
};
function E() {
  return {
    getLegend: () => C,
    provideDocumentSemanticTokens(t) {
      const n = k(t.getValue()), e = [];
      let r = 0, i = 0;
      for (const a of n) {
        const s = a.line - 1, u = a.startColumn - 1, l = s - r, g = l === 0 ? u - i : u;
        e.push(l, g, a.length, H[a.type] ?? 0, 0), r = s, i = u;
      }
      return { data: new Uint32Array(e) };
    },
    releaseDocumentSemanticTokens() {
    }
  };
}
function R(t) {
  return {
    provideCodeActions(n, e) {
      const r = n.uri.path.replace(/^\//, "");
      return {
        actions: h(n.getValue(), r, e.startLineNumber, t).map((a) => L(a)),
        dispose() {
        }
      };
    }
  };
}
function L(t) {
  return {
    title: t.title,
    kind: "quickfix",
    edit: {
      edits: t.edits.map((n) => ({
        resource: o.Uri.file(`/${n.file}`),
        textEdit: { range: c(n.edit.range), text: n.edit.newText },
        versionId: void 0
      }))
    }
  };
}
export {
  R as createCodeActionProvider,
  S as createDocumentHighlightProvider,
  P as createFoldingRangeProvider,
  x as createInlayHintsProvider,
  D as createLinkProvider,
  E as createSemanticTokensProvider,
  b as createSignatureHelpProvider
};
