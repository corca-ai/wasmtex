function S(e) {
  const t = [];
  return u(e, t), m(e, t), f(e, t), b(e, t), g(e, t), h(e, t), p(e, t), t;
}
function f(e, t) {
  const i = e.getBibEntries();
  if (i.length === 0) return;
  const l = new Set(e.getAuxCitations());
  for (const n of e.getFiles()) {
    const s = e.getFileSymbols(n);
    if (s)
      for (const o of s.citations) l.add(o.key);
  }
  if (!l.has("*"))
    for (const n of i)
      l.has(n.key) || t.push({
        file: n.location.file,
        line: n.location.line,
        column: n.location.column,
        endColumn: n.location.column + n.key.length,
        message: `Unused bibliography entry '${n.key}'`,
        severity: "info",
        code: "unused-bib-entry"
      });
}
function u(e, t) {
  const i = new Set(e.getAllLabels().map((s) => s.name)), l = e.getAuxLabels(), n = e.getSemanticTrace();
  for (const s of e.getFiles()) {
    const o = e.getFileSymbols(s);
    if (o)
      for (const c of o.labelRefs)
        n?.labels.has(c.name) || !i.has(c.name) && !l.has(c.name) && t.push({
          file: s,
          line: c.location.line,
          column: c.location.column,
          endColumn: c.location.column + c.name.length,
          // covers the name; column is the name start
          message: `Undefined reference '${c.name}'`,
          severity: "warning",
          code: "undefined-ref"
        });
  }
}
function r(e) {
  const t = /* @__PURE__ */ new Set();
  for (const i of e.getFiles()) {
    const l = e.getFileSymbols(i);
    if (l)
      for (const n of l.bibItems) t.add(n.key);
  }
  return t;
}
function m(e, t) {
  const i = e.getAuxCitations(), l = new Set(e.getBibEntries().map((s) => s.key)), n = r(e);
  for (const s of e.getFiles()) {
    const o = e.getFileSymbols(s);
    if (o)
      for (const c of o.citations)
        c.key === "*" || i.has(c.key) || l.has(c.key) || n.has(c.key) || t.push({
          file: s,
          line: c.location.line,
          column: c.location.column,
          endColumn: c.location.column + c.key.length,
          // covers the key; column is the key start
          message: `Undefined citation '${c.key}'`,
          severity: "warning",
          code: "undefined-cite"
        });
  }
}
function b(e, t) {
  const i = e.getAllLabels(), l = /* @__PURE__ */ new Map();
  for (const n of i) {
    const s = l.get(n.name);
    s ? t.push({
      file: n.location.file,
      line: n.location.line,
      column: n.location.column,
      endColumn: n.location.column + n.name.length,
      // covers the name; column is the name start
      message: `Duplicate label '${n.name}' (first defined at ${s.file}:${s.line})`,
      severity: "warning",
      code: "duplicate-label"
    }) : l.set(n.name, { file: n.location.file, line: n.location.line });
  }
}
function g(e, t) {
  const i = /* @__PURE__ */ new Set();
  for (const n of e.getFiles()) {
    const s = e.getFileSymbols(n);
    if (s)
      for (const o of s.labelRefs) i.add(o.name);
  }
  const l = e.getSemanticTrace();
  if (l)
    for (const n of l.refs) i.add(n);
  for (const n of e.getAllLabels())
    i.has(n.name) || t.push({
      file: n.location.file,
      line: n.location.line,
      column: n.location.column,
      endColumn: n.location.column + n.name.length,
      // covers the name; column is the name start
      message: `Label '${n.name}' is never referenced`,
      severity: "info",
      code: "unreferenced-label"
    });
}
function y(e) {
  return /\.[^./]+$/.test(e) ? [e] : [e, `${e}.tex`];
}
function d(e, t, i) {
  return y(t).some(
    (l) => !!(e.getFileSymbols(l) || i && e.getFileSymbols(i + l))
  );
}
function h(e, t) {
  for (const i of e.getFiles()) {
    const l = e.getFileSymbols(i);
    if (!l) continue;
    const n = i.lastIndexOf("/"), s = n >= 0 ? i.slice(0, n + 1) : "";
    for (const o of l.includes) {
      if (d(e, o.path, s)) continue;
      const c = /\.[^./]+$/.test(o.path) ? o.path : `${o.path}.tex`;
      t.push({
        file: i,
        line: o.location.line,
        column: o.location.column,
        // column sits at the backslash; cover `\<cmd>{` (= type.length + 2) + the path.
        endColumn: o.location.column + o.type.length + 2 + o.path.length,
        message: `Included file '${c}' not found in project`,
        severity: "warning",
        code: "missing-include"
      });
    }
  }
}
function p(e, t) {
  const i = e.getSemanticTrace();
  if (!i) return;
  const l = e.getFiles()[0];
  if (!l) return;
  const n = new Set(e.getAllLabels().map((o) => o.name)), s = /* @__PURE__ */ new Set();
  for (const o of e.getFiles()) {
    const c = e.getFileSymbols(o);
    if (c)
      for (const a of c.labelRefs) s.add(a.name);
  }
  for (const o of i.labels)
    n.has(o) || e.getAuxLabels().has(o) || s.has(o) || i.refs.has(o) || t.push({
      file: l,
      line: 1,
      column: 1,
      endColumn: 1,
      message: `Label '${o}' defined by macro expansion (not visible in source)`,
      severity: "info",
      code: "engine-only-label"
    });
}
export {
  S as computeDiagnostics
};
