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
function c(n, e) {
  return { line: n - 1, character: e - 1 };
}
function f(n) {
  return { start: c(n.startLine, n.startColumn), end: c(n.endLine, n.endColumn) };
}
function u(n) {
  const e = n.replace(/^file:\/\//, "").replace(/^\//, "");
  try {
    return decodeURIComponent(e);
  } catch {
    return e;
  }
}
function d(n) {
  return `file:///${n.split("/").map(encodeURIComponent).join("/")}`;
}
class C {
  constructor(e, t) {
    this.send = e, this.service = new g(t);
  }
  service;
  /** Feed one incoming JSON-RPC message. Responses/notifications go to `send`. */
  handle(e) {
    if (e.method)
      try {
        this.dispatch(e);
      } catch (t) {
        if (e.id != null) {
          const r = t instanceof Error ? t.message : String(t);
          this.respondError(e.id, -32603, `Internal error: ${r}`);
        }
      }
  }
  dispatch(e) {
    const { id: t, method: r, params: o } = e, i = o;
    switch (r) {
      case "initialize":
        this.respond(t, { capabilities: w() });
        break;
      case "initialized":
      case "shutdown":
        this.respond(t, null);
        break;
      case "textDocument/didOpen":
        this.didOpen(o);
        break;
      case "textDocument/didChange":
        this.didChange(o);
        break;
      case "textDocument/completion":
        this.respond(t, this.completion(i));
        break;
      case "textDocument/hover":
        this.respond(t, this.hover(i));
        break;
      case "textDocument/definition":
        this.respond(t, this.definition(i));
        break;
      case "textDocument/references":
        this.respond(t, this.references(i));
        break;
      case "textDocument/rename":
        this.respond(t, this.rename(o));
        break;
      default:
        t != null && this.respondError(t, -32601, `Unknown method: ${r}`);
    }
  }
  respond(e, t) {
    e != null && this.send({ jsonrpc: "2.0", id: e, result: t });
  }
  respondError(e, t, r) {
    this.send({ jsonrpc: "2.0", id: e, error: { code: t, message: r } });
  }
  didOpen(e) {
    const t = e?.textDocument ?? {};
    this.service.updateFile(u(t.uri), t.text ?? ""), this.publishAllDiagnostics();
  }
  didChange(e) {
    const t = e?.textDocument ?? {}, r = e?.contentChanges ?? [];
    r.length && (this.service.updateFile(u(t.uri), r[r.length - 1].text), this.publishAllDiagnostics());
  }
  completion(e) {
    const { path: t, line: r, column: o } = a(e);
    return {
      isIncomplete: !1,
      items: this.service.getCompletions(t, r, o).map((i) => b(i, e.position))
    };
  }
  hover(e) {
    const { path: t, line: r, column: o } = a(e), i = this.service.getHover(t, r, o);
    return i ? D(i) : null;
  }
  definition(e) {
    const { path: t, line: r, column: o } = a(e), i = this.service.getDefinition(t, r, o);
    return i ? m(i) : null;
  }
  references(e) {
    const { path: t, line: r, column: o } = a(e);
    return this.service.getReferences(t, r, o).map(m);
  }
  rename(e) {
    const t = e?.textDocument ?? {}, r = e?.position ?? { line: 0, character: 0 }, o = String(e?.newName ?? ""), i = this.service.getRenameEdits(
      u(t.uri),
      r.line + 1,
      r.character + 1,
      o
    );
    if (!i) return null;
    const l = {};
    for (const s of i.edits) {
      const h = d(s.file), p = l[h] ?? [];
      l[h] = p, p.push({
        range: {
          start: c(s.range.startLineNumber, s.range.startColumn),
          end: c(s.range.endLineNumber, s.range.endColumn)
        },
        newText: s.newText
      });
    }
    return { changes: l };
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
      const o = d(r.file), i = e.get(o) ?? [];
      i.push(L(r)), e.set(o, i);
    }
    const t = new Set(this.publishedUris);
    for (const r of e.keys()) t.add(r);
    this.publishedUris = new Set(e.keys());
    for (const r of t)
      this.send({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: { uri: r, diagnostics: e.get(r) ?? [] }
      });
  }
}
function a(n) {
  return {
    path: u(n.textDocument.uri),
    line: n.position.line + 1,
    column: n.position.character + 1
  };
}
function b(n, e) {
  const t = {
    label: n.label,
    kind: x[n.kind],
    insertTextFormat: n.snippet ? 2 : 1,
    // 2 = snippet
    textEdit: {
      range: {
        start: { line: e.line, character: Math.max(0, e.character - n.replaceLength) },
        end: e
      },
      newText: n.insertText
    }
  };
  return n.detail && (t.detail = n.detail), n.documentation && (t.documentation = n.documentation), n.sortText && (t.sortText = n.sortText), t;
}
function D(n) {
  return {
    contents: { kind: "markdown", value: n.contents.join(`

`) },
    range: f(n.range)
  };
}
function m(n) {
  return { uri: d(n.file), range: f(n.range) };
}
function L(n) {
  return {
    range: {
      start: c(n.line, n.column),
      end: c(n.line, n.endColumn)
    },
    severity: v[n.severity],
    code: n.code,
    message: n.message,
    source: "wasmtex"
  };
}
function w() {
  return {
    textDocumentSync: 1,
    // full
    completionProvider: { triggerCharacters: ["\\", "{"] },
    hoverProvider: !0,
    definitionProvider: !0,
    referencesProvider: !0,
    renameProvider: !0
  };
}
export {
  C as LatexLspServer,
  u as pathFromUri,
  d as uriFromPath
};
