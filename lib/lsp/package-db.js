import { getCommandByName as u } from "./latex-commands.js";
const i = (e, t, n = {}) => ({ kind: "optional", placeholder: e, valueKind: t, ...n }), r = (e, t, n = {}) => ({ kind: "required", placeholder: e, valueKind: t, ...n }), p = /* @__PURE__ */ new Map([
  [
    "documentclass",
    [
      i("options", "key-value", {
        keyFamily: "class-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      r("class", "tex-class")
    ]
  ],
  [
    "LoadClass",
    [
      i("options", "key-value", {
        keyFamily: "class-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      r("class", "tex-class")
    ]
  ],
  [
    "usepackage",
    [
      i("options", "key-value", {
        keyFamily: "package-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      r("packages", "tex-package", { list: !0 })
    ]
  ],
  [
    "RequirePackage",
    [
      i("options", "key-value", {
        keyFamily: "package-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      r("packages", "tex-package", { list: !0 })
    ]
  ],
  ["begin", [r("environment", "environment")]],
  ["end", [r("environment", "environment")]],
  ["ref", [r("label", "label", { list: !0 })]],
  ["eqref", [r("label", "label", { list: !0 })]],
  ["pageref", [r("label", "label", { list: !0 })]],
  ["autoref", [r("label", "label", { list: !0 })]],
  ["cref", [r("labels", "label", { list: !0 })]],
  ["Cref", [r("labels", "label", { list: !0 })]],
  ["nameref", [r("label", "label", { list: !0 })]],
  [
    "cite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      r("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citep",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      r("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citet",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      r("keys", "citation", { list: !0 })
    ]
  ],
  [
    "parencite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      r("keys", "citation", { list: !0 })
    ]
  ],
  [
    "textcite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      r("keys", "citation", { list: !0 })
    ]
  ],
  [
    "autocite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      r("keys", "citation", { list: !0 })
    ]
  ],
  ["nocite", [r("keys", "citation", { list: !0 })]],
  ["input", [r("file", "project-tex")]],
  ["include", [r("file", "project-tex")]],
  ["subfile", [r("file", "project-tex")]],
  ["bibliography", [r("files", "project-bib", { list: !0 })]],
  ["bibliographystyle", [r("style", "bib-style")]],
  [
    "includegraphics",
    [
      i("options", "key-value", { keyFamily: "graphicx/includegraphics", list: !0 }),
      r("image", "project-image")
    ]
  ]
]);
function d(e) {
  const t = [];
  let n = e.startsWith("\\") ? 1 : 0;
  for (; n < e.length && /[a-zA-Z@*]/.test(e[n]); ) n++;
  for (; n < e.length; ) {
    for (; n < e.length && /\s/.test(e[n]); ) n++;
    const a = e[n];
    if (a !== "{" && a !== "[") break;
    const { content: o, end: l } = m(e, n);
    o.includes("$") && t.push({
      kind: a === "{" ? "required" : "optional",
      placeholder: y(o)
    }), n = l;
  }
  return t;
}
function m(e, t) {
  if (e[t] === "[") {
    const o = e.indexOf("]", t + 1), l = o < 0 ? e.length : o, f = o < 0 ? e.length : o + 1;
    return { content: e.slice(t + 1, l), end: f };
  }
  let a = 0;
  for (let o = t; o < e.length; o++)
    if (e[o] === "{") a++;
    else if (e[o] === "}" && --a === 0)
      return { content: e.slice(t + 1, o), end: o + 1 };
  return { content: e.slice(t + 1), end: e.length };
}
function y(e) {
  const t = e.match(/\$\{\d+:([^}]*)\}/);
  return t ? t[1] : "";
}
const s = /* @__PURE__ */ new Map(), g = /* @__PURE__ */ new Set(), c = /* @__PURE__ */ new Map();
function k(e, t) {
  for (const n of t) {
    if (!n || typeof n.name != "string" || s.has(n.name)) continue;
    const a = { args: n.args ?? [], package: e };
    n.doc && (a.doc = n.doc), s.set(n.name, a);
  }
}
function h(e) {
  k(e.package, Array.isArray(e.commands) ? e.commands : []);
  for (const t of Array.isArray(e.environments) ? e.environments : []) {
    if (!t || typeof t.name != "string" || (g.add(t.name), c.has(t.name))) continue;
    const n = { args: t.args ?? [], package: e.package };
    t.doc && (n.doc = t.doc), c.set(t.name, n);
  }
}
function x() {
  return g;
}
function v(e) {
  const t = p.get(e);
  if (t) return t;
  const n = u(e);
  return n ? d(n.snippet) : s.get(e)?.args;
}
function A(e) {
  return c.get(e)?.args;
}
function S(e) {
  const t = u(e);
  return t ? t.package : s.get(e)?.package;
}
function w(e, t) {
  const n = t.map(
    (a) => a.kind === "required" ? `{${a.placeholder ?? ""}}` : `[${a.placeholder ?? ""}]`
  );
  return `\\${e}${n.join("")}`;
}
export {
  w as formatSignature,
  S as getCommandPackage,
  v as getCommandSignature,
  A as getEnvironmentSignature,
  x as getShardEnvironments,
  d as parseSignature,
  h as registerShard
};
