import * as s from "monaco-editor";
const i = s.languages.SymbolKind, u = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5
};
function l(o, n, e, t) {
  return {
    name: o,
    detail: n,
    kind: e,
    range: new s.Range(t, 1, t, 1),
    selectionRange: new s.Range(t, 1, t, 1),
    tags: [],
    children: []
  };
}
function h(o) {
  const n = [];
  for (const e of o.sections)
    n.push({
      line: e.location.line,
      type: "section",
      level: e.level,
      title: e.title
    });
  for (const e of o.labels)
    n.push({
      line: e.location.line,
      type: "other",
      sym: l(`\\label{${e.name}}`, "label", i.Key, e.location.line)
    });
  for (const e of o.commands)
    n.push({
      line: e.location.line,
      type: "other",
      sym: l(`\\${e.name}`, "command", i.Function, e.location.line)
    });
  for (const e of o.environments)
    n.push({
      line: e.location.line,
      type: "other",
      sym: l(e.name, "environment", i.Struct, e.location.line)
    });
  return n.sort((e, t) => e.line - t.line), n;
}
function a(o, n, e) {
  n.length > 0 ? n[n.length - 1].sym.children.push(o) : e.push(o);
}
function p(o) {
  const n = [], e = [];
  for (const t of o)
    if (t.type === "section") {
      const r = u[t.level], c = l(t.title, t.level, i.Module, t.line);
      for (; e.length > 0 && e[e.length - 1].depth >= r; )
        e.pop();
      a(c, e, n), e.push({ sym: c, depth: r });
    } else
      a(t.sym, e, n);
  return n;
}
function m(o) {
  return {
    provideDocumentSymbols(n) {
      const e = n.uri.path.startsWith("/") ? n.uri.path.slice(1) : n.uri.path, t = o.getFileSymbols(e);
      return t ? p(h(t)) : [];
    }
  };
}
export {
  m as createDocumentSymbolProvider
};
