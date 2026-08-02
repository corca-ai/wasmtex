import { getCommandByName as u } from "./latex-commands.js";
const i = (e, t, n = {}) => ({ kind: "optional", placeholder: e, valueKind: t, ...n }), o = (e, t, n = {}) => ({ kind: "required", placeholder: e, valueKind: t, ...n }), g = /* @__PURE__ */ new Map([
  [
    "documentclass",
    [
      i("options", "key-value", {
        keyFamily: "class-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      o("class", "tex-class")
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
      o("class", "tex-class")
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
      o("packages", "tex-package", { list: !0 })
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
      o("packages", "tex-package", { list: !0 })
    ]
  ],
  ["begin", [o("environment", "environment")]],
  ["end", [o("environment", "environment")]],
  ["ref", [o("label", "label", { list: !0 })]],
  ["eqref", [o("label", "label", { list: !0 })]],
  ["pageref", [o("label", "label", { list: !0 })]],
  ["autoref", [o("label", "label", { list: !0 })]],
  ["cref", [o("labels", "label", { list: !0 })]],
  ["Cref", [o("labels", "label", { list: !0 })]],
  ["nameref", [o("label", "label", { list: !0 })]],
  [
    "cite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      o("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citep",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      o("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citet",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      o("keys", "citation", { list: !0 })
    ]
  ],
  [
    "parencite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      o("keys", "citation", { list: !0 })
    ]
  ],
  [
    "textcite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      o("keys", "citation", { list: !0 })
    ]
  ],
  [
    "autocite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      o("keys", "citation", { list: !0 })
    ]
  ],
  ["nocite", [o("keys", "citation", { list: !0 })]],
  ["input", [o("file", "project-tex")]],
  ["include", [o("file", "project-tex")]],
  ["subfile", [o("file", "project-tex")]],
  ["bibliography", [o("files", "project-bib", { list: !0 })]],
  ["bibliographystyle", [o("style", "bib-style")]],
  [
    "setmainfont",
    [
      i("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      o("font", "font-family")
    ]
  ],
  [
    "setsansfont",
    [
      i("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      o("font", "font-family")
    ]
  ],
  [
    "setmonofont",
    [
      i("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      o("font", "font-family")
    ]
  ],
  [
    "includegraphics",
    [
      i("options", "key-value", { keyFamily: "graphicx/includegraphics", list: !0 }),
      o("image", "project-image")
    ]
  ]
]);
function m(e) {
  const t = [];
  let n = e.startsWith("\\") ? 1 : 0;
  for (; n < e.length && /[a-zA-Z@*]/.test(e[n]); ) n++;
  for (; n < e.length; ) {
    for (; n < e.length && /\s/.test(e[n]); ) n++;
    const s = e[n];
    if (s !== "{" && s !== "[") break;
    const { content: r, end: l } = d(e, n);
    r.includes("$") && t.push({
      kind: s === "{" ? "required" : "optional",
      placeholder: y(r)
    }), n = l;
  }
  return t;
}
function d(e, t) {
  if (e[t] === "[") {
    const r = e.indexOf("]", t + 1), l = r < 0 ? e.length : r, p = r < 0 ? e.length : r + 1;
    return { content: e.slice(t + 1, l), end: p };
  }
  let s = 0;
  for (let r = t; r < e.length; r++)
    if (e[r] === "{") s++;
    else if (e[r] === "}" && --s === 0)
      return { content: e.slice(t + 1, r), end: r + 1 };
  return { content: e.slice(t + 1), end: e.length };
}
function y(e) {
  const t = e.match(/\$\{\d+:([^}]*)\}/);
  return t ? t[1] : "";
}
const a = /* @__PURE__ */ new Map(), f = /* @__PURE__ */ new Set(), c = /* @__PURE__ */ new Map();
function k(e, t) {
  for (const n of t) {
    if (!n || typeof n.name != "string" || a.has(n.name)) continue;
    const s = { args: n.args ?? [], package: e };
    n.doc && (s.doc = n.doc), a.set(n.name, s);
  }
}
function h(e) {
  k(e.package, Array.isArray(e.commands) ? e.commands : []);
  for (const t of Array.isArray(e.environments) ? e.environments : []) {
    if (!t || typeof t.name != "string" || (f.add(t.name), c.has(t.name))) continue;
    const n = { args: t.args ?? [], package: e.package };
    t.doc && (n.doc = t.doc), c.set(t.name, n);
  }
}
function v() {
  return f;
}
function x(e) {
  const t = g.get(e);
  if (t) return t;
  const n = u(e);
  return n ? m(n.snippet) : a.get(e)?.args;
}
function A(e) {
  return c.get(e)?.args;
}
function S(e) {
  const t = u(e);
  return t ? t.package : a.get(e)?.package;
}
function F(e, t) {
  const n = t.map(
    (s) => s.kind === "required" ? `{${s.placeholder ?? ""}}` : `[${s.placeholder ?? ""}]`
  );
  return `\\${e}${n.join("")}`;
}
export {
  F as formatSignature,
  S as getCommandPackage,
  x as getCommandSignature,
  A as getEnvironmentSignature,
  v as getShardEnvironments,
  m as parseSignature,
  h as registerShard
};
