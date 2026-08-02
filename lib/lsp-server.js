import { LatexLanguageService as g } from "./lsp.js";
const x = {
  text: 1,
  command: 3,
  // Function
  variable: 6,
  module: 9,
  keyword: 14,
  file: 17,
  reference: 18
}, v = { error: 1, warning: 2, info: 3 };
function c(t, e) {
  return { line: t - 1, character: e - 1 };
}
function h(t) {
  return { start: c(t.startLine, t.startColumn), end: c(t.endLine, t.endColumn) };
}
function l(t) {
  const e = t.replace(/^file:\/\//, "").replace(/^\//, "");
  try {
    return decodeURIComponent(e);
  } catch {
    return e;
  }
}
function d(t) {
  return `file:///${t.split("/").map(encodeURIComponent).join("/")}`;
}
class C {
  constructor(e, n) {
    this.send = e, this.service = new g(n);
  }
  service;
  /** Feed one incoming JSON-RPC message. Responses/notifications go to `send`. */
  handle(e) {
    if (e.method)
      try {
        this.dispatch(e);
      } catch (n) {
        if (e.id != null) {
          const r = n instanceof Error ? n.message : String(n);
          this.respondError(e.id, -32603, `Internal error: ${r}`);
        }
      }
  }
  dispatch(e) {
    const { id: n, method: r, params: s } = e, i = s;
    switch (r) {
      case "initialize":
        this.respond(n, { capabilities: w() });
        break;
      case "initialized":
      case "shutdown":
        this.respond(n, null);
        break;
      case "textDocument/didOpen":
        this.didOpen(s);
        break;
      case "textDocument/didChange":
        this.didChange(s);
        break;
      case "textDocument/completion":
        this.respond(n, this.completion(i));
        break;
      case "textDocument/hover":
        this.respond(n, this.hover(i));
        break;
      case "textDocument/definition":
        this.respond(n, this.definition(i));
        break;
      case "textDocument/references":
        this.respond(n, this.references(i));
        break;
      case "textDocument/rename":
        this.respond(n, this.rename(s));
        break;
      default:
        n != null && this.respondError(n, -32601, `Unknown method: ${r}`);
    }
  }
  respond(e, n) {
    e != null && this.send({ jsonrpc: "2.0", id: e, result: n });
  }
  respondError(e, n, r) {
    this.send({ jsonrpc: "2.0", id: e, error: { code: n, message: r } });
  }
  didOpen(e) {
    const n = e?.textDocument ?? {};
    this.service.updateFile(l(n.uri), n.text ?? ""), this.publishAllDiagnostics();
  }
  didChange(e) {
    const n = e?.textDocument ?? {}, r = e?.contentChanges ?? [];
    r.length && (this.service.updateFile(l(n.uri), r[r.length - 1].text), this.publishAllDiagnostics());
  }
  completion(e) {
    const { path: n, line: r, column: s } = u(e), i = this.service.getCompletionResult(n, r, s);
    return {
      isIncomplete: i.isIncomplete,
      items: i.items.map((a) => b(a, e.position))
    };
  }
  hover(e) {
    const { path: n, line: r, column: s } = u(e), i = this.service.getHover(n, r, s);
    return i ? D(i) : null;
  }
  definition(e) {
    const { path: n, line: r, column: s } = u(e), i = this.service.getDefinition(n, r, s);
    return i ? f(i) : null;
  }
  references(e) {
    const { path: n, line: r, column: s } = u(e);
    return this.service.getReferences(n, r, s).map(f);
  }
  rename(e) {
    const n = e?.textDocument ?? {}, r = e?.position ?? { line: 0, character: 0 }, s = String(e?.newName ?? ""), i = this.service.getRenameEdits(
      l(n.uri),
      r.line + 1,
      r.character + 1,
      s
    );
    if (!i) return null;
    const a = {};
    for (const o of i.edits) {
      const p = d(o.file), m = a[p] ?? [];
      a[p] = m, m.push({
        range: {
          start: c(o.range.startLineNumber, o.range.startColumn),
          end: c(o.range.endLineNumber, o.range.endColumn)
        },
        newText: o.newText
      });
    }
    return { changes: a };
  }
  /** URIs that currently carry diagnostics — so the next publish can clear them. */
  publishedUris = /* @__PURE__ */ new Set();
  /**
   * Publish diagnostics project-wide. Diagnostics are computed across the whole
   * project, so a change in one file can fix (or introduce) markers in another;
   * publishing only the changed file would leave stale cross-file diagnostics.
   * Files that previously had diagnostics but no longer do are sent an empty array
   * so their markers clear.
   */
  publishAllDiagnostics() {
    const e = /* @__PURE__ */ new Map();
    for (const r of this.service.getDiagnostics()) {
      const s = d(r.file), i = e.get(s) ?? [];
      i.push(L(r)), e.set(s, i);
    }
    const n = new Set(this.publishedUris);
    for (const r of e.keys()) n.add(r);
    this.publishedUris = new Set(e.keys());
    for (const r of n)
      this.send({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: { uri: r, diagnostics: e.get(r) ?? [] }
      });
  }
}
function u(t) {
  return {
    path: l(t.textDocument.uri),
    line: t.position.line + 1,
    column: t.position.character + 1
  };
}
function b(t, e) {
  const n = t.replacementRange ? h(t.replacementRange) : {
    start: { line: e.line, character: Math.max(0, e.character - t.replaceLength) },
    end: e
  }, r = {
    label: t.label,
    kind: x[t.kind],
    insertTextFormat: t.snippet ? 2 : 1,
    // 2 = snippet
    textEdit: {
      range: n,
      newText: t.insertText
    }
  };
  return t.detail && (r.detail = t.detail), t.documentation && (r.documentation = t.documentation), t.sortText && (r.sortText = t.sortText), r;
}
function D(t) {
  return {
    contents: { kind: "markdown", value: t.contents.join(`

`) },
    range: h(t.range)
  };
}
function f(t) {
  return { uri: d(t.file), range: h(t.range) };
}
function L(t) {
  return {
    range: {
      start: c(t.line, t.column),
      end: c(t.line, t.endColumn)
    },
    severity: v[t.severity],
    code: t.code,
    message: t.message,
    source: "wasmtex"
  };
}
function w() {
  return {
    textDocumentSync: 1,
    // full
    completionProvider: { triggerCharacters: ["\\", "{", "[", ",", "="] },
    hoverProvider: !0,
    definitionProvider: !0,
    referencesProvider: !0,
    renameProvider: !0
  };
}
export {
  C as LatexLspServer,
  l as pathFromUri,
  d as uriFromPath
};
