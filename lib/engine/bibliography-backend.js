import { stripTexComments as c } from "./tex-comments.js";
function x(t) {
  const e = c(t);
  return /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bbiblatex\b[^}]*\}/.test(e) ? "biblatex" : /\\bibliography\b/.test(e) || /\\bibliographystyle\b/.test(e) || /\\begin\{thebibliography\}/.test(e) ? "bibtex" : "none";
}
const u = "bibliography";
function k(t, e) {
  const n = t.match(/\\bibstyle\{([^}]+)\}/);
  if (!n) return null;
  const o = n[1], i = o.endsWith(".bst") ? o : `${o}.bst`, r = e(i);
  return r != null ? { path: i, content: r } : null;
}
async function w(t, e) {
  const n = t?.resolve(u);
  return !n || n.location !== "server" ? null : n.run(e);
}
function j(t) {
  const n = c(t).match(/\\usepackage\[([^\]]*)\]\{[^}]*\bbiblatex\b[^}]*\}/);
  return n && /\bbackend\s*=\s*bibtex\b/.test(n[1]) ? "bibtex" : "biber";
}
function v(t) {
  return /\bsorting\s*=\s*none\b/.test(c(t)) ? "none" : "nty";
}
function S(t) {
  return [...t.matchAll(/<bcf:citekey\b[^>]*>([^<]*)<\/bcf:citekey>/g)].map((e) => e[1].trim()).filter(Boolean);
}
function b(t) {
  const e = (t.author ?? "").toLowerCase(), n = (t.title ?? "").toLowerCase(), o = t.year ?? "";
  return `${e} ${n} ${o}`;
}
function d(t) {
  return t.split(/\s+and\s+/).map((e) => e.trim()).filter(Boolean).map((e) => {
    const n = e.indexOf(",");
    if (n >= 0)
      return { family: e.slice(0, n).trim(), given: e.slice(n + 1).trim() };
    const o = e.lastIndexOf(" ");
    return o >= 0 ? { family: e.slice(o + 1).trim(), given: e.slice(0, o).trim() } : { family: e, given: "" };
  });
}
function g(t, e) {
  let n = 0;
  for (; e - 1 - n >= 0 && t[e - 1 - n] === "\\"; ) n++;
  return n % 2 === 1;
}
function m(t) {
  const e = /* @__PURE__ */ new Set(), n = [];
  for (let i = 0; i < t.length; i++) {
    const r = t[i];
    r !== "{" && r !== "}" || g(t, i) || (r === "{" ? n.push(i) : n.length > 0 ? n.pop() : e.add(i));
  }
  for (const i of n) e.add(i);
  if (e.size === 0) return t;
  let o = "";
  for (let i = 0; i < t.length; i++) e.has(i) || (o += t[i]);
  return o;
}
function s(t) {
  return m(t).replace(
    /(\\*)([&%#])/g,
    (e, n, o) => n.length % 2 === 0 ? `${n}\\${o}` : `${n}${o}`
  );
}
function p(t) {
  const e = d(t), n = e.map((o) => `    {{family={${s(o.family)}},given={${s(o.given)}}}}%`).join(`
`);
  return `  \\name{author}{${e.length}}{}{%
${n}
  }`;
}
function h(t) {
  const e = [`\\entry{${s(t.key)}}{${s(t.type)}}{}{}`];
  t.author && e.push(p(t.author));
  for (const n of ["title", "year", "journal"]) {
    const o = t[n];
    o && e.push(`  \\field{${n}}{${s(o)}}`);
  }
  return e.push("\\endentry"), e.join(`
`);
}
function y(t) {
  const e = new Map(t.entries.map((r) => [r.key, r])), n = [...new Set(t.citedKeys)].map((r) => e.get(r)).filter((r) => !!r);
  t.sort !== "none" && n.sort((r, f) => {
    const l = b(r), a = b(f);
    return l < a ? -1 : l > a ? 1 : 0;
  });
  const o = t.sort === "none" ? "none/global//global/global" : "nty/global//global/global", i = n.map(h).join(`
`);
  return [
    "\\begin{refsection}",
    `\\datalist[entry]{${o}}`,
    i,
    "\\enddatalist",
    "\\end{refsection}",
    ""
  ].join(`
`);
}
const B = {
  id: "biblatex-lite",
  generateBbl: y
};
function C(t = [], e) {
  return t.find((n) => n.id === e) ?? t[0] ?? B;
}
export {
  u as BIBLIOGRAPHY_STAGE,
  B as biblatexLiteBackend,
  j as detectBiblatexBackend,
  v as detectBiblatexSort,
  x as detectBibliographyMode,
  y as generateBiblatexBbl,
  S as parseBcfCitedKeys,
  k as resolveBstFile,
  w as runRemoteBibliography,
  C as selectBiblatexBackend
};
