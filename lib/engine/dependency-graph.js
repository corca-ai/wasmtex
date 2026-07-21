import { scanFileEvents as u } from "./parse-errors.js";
const p = {
  tex: "tex",
  ltx: "tex",
  cls: "class",
  sty: "package",
  otf: "font",
  ttf: "font",
  pfb: "font",
  bib: "bib",
  bbl: "bib",
  bst: "bib",
  png: "image",
  jpg: "image",
  jpeg: "image",
  eps: "image",
  pdf: "image"
  // \includegraphics{figure.pdf} — common in pdfLaTeX
};
function r(t) {
  const e = t.slice(t.lastIndexOf(".") + 1).toLowerCase();
  return p[e] ?? "other";
}
function h(t) {
  const e = r(t);
  return e === "tex" ? "includes" : e === "package" || e === "class" ? "loads" : "reads";
}
function a(t) {
  return t.startsWith("./") || t.startsWith("/work/") ? "project" : t.startsWith("/") ? "system" : "project";
}
function l(t) {
  const e = a(t);
  let s = t;
  return s.startsWith("/work/") && (s = s.slice(6)), s = s.replace(/\/\.\//g, "/").replace(/^\.\//, ""), { id: e === "system" ? s.replace(/^.*\//, "") : s, origin: e };
}
class g {
  nodes = /* @__PURE__ */ new Map();
  edges = /* @__PURE__ */ new Map();
  root;
  addNode(e, s, i, o) {
    const n = this.nodes.get(e);
    if (n) {
      n.discoveredBy.includes(o) || n.discoveredBy.push(o);
      return;
    }
    this.nodes.set(e, { id: e, kind: s, origin: i, discoveredBy: [o] });
  }
  addEdge(e, s, i, o) {
    if (e === s) return;
    const n = `${e}	${s}	${i}`, d = this.edges.get(n);
    if (d) {
      d.discoveredBy.includes(o) || d.discoveredBy.push(o);
      return;
    }
    this.edges.set(n, { from: e, to: s, relation: i, discoveredBy: [o] });
  }
  build() {
    this.root && !this.nodes.has(this.root) && this.addNode(this.root, r(this.root), a(this.root), "source");
    const e = {
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()]
    };
    return this.root && (e.root = this.root), e;
  }
}
function f(t) {
  return t.replace(/^.*\//, "").startsWith("__");
}
function m(t, e) {
  const s = [];
  for (const i of u(e.split(`
`)))
    if (i.type === "open") {
      const { id: o, origin: n } = l(i.raw), d = s[s.length - 1];
      f(o) || (t.addNode(o, r(o), n, "log"), t.root ??= o, d && !f(d) && t.addEdge(d, o, h(o), "log")), s.push(o);
    } else i.type === "close" && s.pop();
}
function x(t, e) {
  for (const s of e) {
    if (!s || s.endsWith("/")) continue;
    const { id: i, origin: o } = l(s);
    i && (t.addNode(i, r(i), o, "fls"), t.root && t.addEdge(t.root, i, "reads", "fls"));
  }
}
function b(t, e) {
  for (const s of e)
    t.addNode(s, "font", "system", "xdv"), t.root && t.addEdge(t.root, s, "uses-font", "xdv");
}
const v = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/, y = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g, E = /\\(?:input|include|subfile)\{([^}]+)\}/g;
function c(t, e, s, i) {
  const o = e.trim();
  if (!o) return;
  const n = o.includes(".") ? o : `${o}.${s}`, d = i === "includes" ? "project" : "system";
  t.addNode(n, r(n), d, "source"), t.root && t.addEdge(t.root, n, i, "source");
}
function k(t, e) {
  t.root ??= "main.tex";
  const s = e.match(v);
  s && c(t, s[1], "cls", "loads");
  for (const i of e.matchAll(y))
    for (const o of i[1].split(",")) c(t, o, "sty", "loads");
  for (const i of e.matchAll(E)) c(t, i[1], "tex", "includes");
}
function N(t, e = {}) {
  const s = new g();
  return m(s, t), e.source && k(s, e.source), e.inputFiles?.length && x(s, e.inputFiles), e.fonts?.length && b(s, e.fonts), s.build();
}
export {
  N as buildDependencyGraph
};
