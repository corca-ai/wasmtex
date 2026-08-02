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
function a(n, e) {
  return { line: n - 1, character: e - 1 };
}
function d(n) {
  return { start: a(n.startLine, n.startColumn), end: a(n.endLine, n.endColumn) };
}
function u(n) {
  const e = n.replace(/^file:\/\//, "").replace(/^\//, "");
  try {
    return decodeURIComponent(e);
  } catch {
    return e;
  }
}
function h(n) {
  return `file:///${n.split("/").map(encodeURIComponent).join("/")}`;
}
class L {
  constructor(e, t) {
    this.send = e, this.service = new g(t);
  }
  service;
  /** Feed one incoming JSON-RPC message. Responses/notifications go to `send`. */
  handle(e) {
    if (e.method)
      try {
        const t = this.dispatch(e);
        if (t)
          return t.catch((r) => this.respondDispatchError(e, r));
      } catch (t) {
        this.respondDispatchError(e, t);
      }
  }
  dispatch(e) {
    const { id: t, method: r, params: i } = e, s = i;
    switch (r) {
      case "initialize":
        this.respond(t, { capabilities: k() });
        break;
      case "initialized":
      case "shutdown":
        this.respond(t, null);
        break;
      case "textDocument/didOpen":
        this.didOpen(i);
        break;
      case "textDocument/didChange":
        this.didChange(i);
        break;
      case "textDocument/completion":
        this.respond(t, this.completion(s));
        break;
      case "textDocument/hover":
        this.respond(t, this.hover(s));
        break;
      case "textDocument/definition":
        this.respond(t, this.definition(s));
        break;
      case "textDocument/references":
        this.respond(t, this.references(s));
        break;
      case "textDocument/rename":
        this.respond(t, this.rename(i));
        break;
      case "wasmtex/updateCompletionSnapshot":
        return this.service.updateCompletionSnapshot(i?.snapshot).then((o) => this.respond(t, o));
      case "wasmtex/setMainFile":
        this.service.setMainFile(String(i?.path ?? "")), this.respond(t, null);
        break;
      case "wasmtex/completionSnapshotState":
        this.respond(t, this.service.getCompletionSnapshotState());
        break;
      default:
        t != null && this.respondError(t, -32601, `Unknown method: ${r}`);
    }
  }
  respondDispatchError(e, t) {
    if (e.id == null) return;
    const r = t instanceof Error ? t.message : String(t);
    this.respondError(e.id, -32603, `Internal error: ${r}`);
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
    const { path: t, line: r, column: i } = l(e), s = this.service.getCompletionResult(t, r, i);
    return {
      isIncomplete: s.isIncomplete,
      items: s.items.map((o) => b(o, e.position))
    };
  }
  hover(e) {
    const { path: t, line: r, column: i } = l(e), s = this.service.getHover(t, r, i);
    return s ? D(s) : null;
  }
  definition(e) {
    const { path: t, line: r, column: i } = l(e), s = this.service.getDefinition(t, r, i);
    return s ? f(s) : null;
  }
  references(e) {
    const { path: t, line: r, column: i } = l(e);
    return this.service.getReferences(t, r, i).map(f);
  }
  rename(e) {
    const t = e?.textDocument ?? {}, r = e?.position ?? { line: 0, character: 0 }, i = String(e?.newName ?? ""), s = this.service.getRenameEdits(
      u(t.uri),
      r.line + 1,
      r.character + 1,
      i
    );
    if (!s) return null;
    const o = {};
    for (const c of s.edits) {
      const p = h(c.file), m = o[p] ?? [];
      o[p] = m, m.push({
        range: {
          start: a(c.range.startLineNumber, c.range.startColumn),
          end: a(c.range.endLineNumber, c.range.endColumn)
        },
        newText: c.newText
      });
    }
    return { changes: o };
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
      const i = h(r.file), s = e.get(i) ?? [];
      s.push(w(r)), e.set(i, s);
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
function l(n) {
  return {
    path: u(n.textDocument.uri),
    line: n.position.line + 1,
    column: n.position.character + 1
  };
}
function b(n, e) {
  const t = n.replacementRange ? d(n.replacementRange) : {
    start: { line: e.line, character: Math.max(0, e.character - n.replaceLength) },
    end: e
  }, r = {
    label: n.label,
    kind: x[n.kind],
    insertTextFormat: n.snippet ? 2 : 1,
    // 2 = snippet
    textEdit: {
      range: t,
      newText: n.insertText
    }
  };
  return n.detail && (r.detail = n.detail), n.documentation && (r.documentation = n.documentation), n.sortText && (r.sortText = n.sortText), n.data && (r.data = n.data), r;
}
function D(n) {
  return {
    contents: { kind: "markdown", value: n.contents.join(`

`) },
    range: d(n.range)
  };
}
function f(n) {
  return { uri: h(n.file), range: d(n.range) };
}
function w(n) {
  return {
    range: {
      start: a(n.line, n.column),
      end: a(n.line, n.endColumn)
    },
    severity: v[n.severity],
    code: n.code,
    message: n.message,
    source: "wasmtex"
  };
}
function k() {
  return {
    textDocumentSync: 1,
    // full
    completionProvider: { triggerCharacters: ["\\", "{", "[", ",", "=", "@"] },
    hoverProvider: !0,
    definitionProvider: !0,
    referencesProvider: !0,
    renameProvider: !0
  };
}
export {
  L as LatexLspServer,
  u as pathFromUri,
  h as uriFromPath
};
