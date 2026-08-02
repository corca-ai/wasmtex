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
function p(n) {
  return { start: a(n.startLine, n.startColumn), end: a(n.endLine, n.endColumn) };
}
function h(n) {
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
          return t.catch((i) => this.respondDispatchError(e, i));
      } catch (t) {
        this.respondDispatchError(e, t);
      }
  }
  dispatch(e) {
    const { id: t, method: i, params: r } = e, s = r;
    switch (i) {
      case "initialize":
        this.respond(t, { capabilities: C() });
        break;
      case "initialized":
      case "shutdown":
        this.respond(t, null);
        break;
      case "textDocument/didOpen":
        this.didOpen(r);
        break;
      case "textDocument/didChange":
        this.didChange(r);
        break;
      case "textDocument/completion":
        {
          const o = this.completion(s);
          if (o instanceof Promise)
            return o.then((c) => this.respond(t, c));
          this.respond(t, o);
        }
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
        this.respond(t, this.rename(r));
        break;
      case "wasmtex/updateCompletionSnapshot":
        return this.service.updateCompletionSnapshot(r?.snapshot).then((o) => this.respond(t, o));
      case "wasmtex/setMainFile":
        this.service.setMainFile(String(r?.path ?? "")), this.respond(t, null);
        break;
      case "wasmtex/completionSnapshotState":
        this.respond(t, this.service.getCompletionSnapshotState());
        break;
      default:
        t != null && this.respondError(t, -32601, `Unknown method: ${i}`);
    }
  }
  respondDispatchError(e, t) {
    if (e.id == null) return;
    const i = t instanceof Error ? t.message : String(t);
    this.respondError(e.id, -32603, `Internal error: ${i}`);
  }
  respond(e, t) {
    e != null && this.send({ jsonrpc: "2.0", id: e, result: t });
  }
  respondError(e, t, i) {
    this.send({ jsonrpc: "2.0", id: e, error: { code: t, message: i } });
  }
  didOpen(e) {
    const t = e?.textDocument ?? {};
    this.service.updateFile(h(t.uri), t.text ?? ""), this.publishAllDiagnostics();
  }
  didChange(e) {
    const t = e?.textDocument ?? {}, i = e?.contentChanges ?? [];
    i.length && (this.service.updateFile(h(t.uri), i[i.length - 1].text), this.publishAllDiagnostics());
  }
  completion(e) {
    const { path: t, line: i, column: r } = u(e), s = this.service.getCompletionResult(t, i, r), o = (c) => ({
      isIncomplete: c.isIncomplete,
      items: c.items.map((l) => b(l, e.position))
    });
    return s.isIncomplete ? this.service.getCompletionResultAsync(t, i, r).then(o) : o(s);
  }
  hover(e) {
    const { path: t, line: i, column: r } = u(e), s = this.service.getHover(t, i, r);
    return s ? D(s) : null;
  }
  definition(e) {
    const { path: t, line: i, column: r } = u(e), s = this.service.getDefinition(t, i, r);
    return s ? f(s) : null;
  }
  references(e) {
    const { path: t, line: i, column: r } = u(e);
    return this.service.getReferences(t, i, r).map(f);
  }
  rename(e) {
    const t = e?.textDocument ?? {}, i = e?.position ?? { line: 0, character: 0 }, r = String(e?.newName ?? ""), s = this.service.getRenameEdits(
      h(t.uri),
      i.line + 1,
      i.character + 1,
      r
    );
    if (!s) return null;
    const o = {};
    for (const c of s.edits) {
      const l = d(c.file), m = o[l] ?? [];
      o[l] = m, m.push({
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
    for (const i of this.service.getDiagnostics()) {
      const r = d(i.file), s = e.get(r) ?? [];
      s.push(w(i)), e.set(r, s);
    }
    const t = new Set(this.publishedUris);
    for (const i of e.keys()) t.add(i);
    this.publishedUris = new Set(e.keys());
    for (const i of t)
      this.send({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: { uri: i, diagnostics: e.get(i) ?? [] }
      });
  }
}
function u(n) {
  return {
    path: h(n.textDocument.uri),
    line: n.position.line + 1,
    column: n.position.character + 1
  };
}
function b(n, e) {
  const t = n.replacementRange ? p(n.replacementRange) : {
    start: { line: e.line, character: Math.max(0, e.character - n.replaceLength) },
    end: e
  }, i = {
    label: n.label,
    kind: x[n.kind],
    insertTextFormat: n.snippet ? 2 : 1,
    // 2 = snippet
    textEdit: {
      range: t,
      newText: n.insertText
    }
  };
  return n.detail && (i.detail = n.detail), n.documentation && (i.documentation = n.documentation), n.sortText && (i.sortText = n.sortText), n.data && (i.data = n.data), i;
}
function D(n) {
  return {
    contents: { kind: "markdown", value: n.contents.join(`

`) },
    range: p(n.range)
  };
}
function f(n) {
  return { uri: d(n.file), range: p(n.range) };
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
function C() {
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
  h as pathFromUri,
  d as uriFromPath
};
