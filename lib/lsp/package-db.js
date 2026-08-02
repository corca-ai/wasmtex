import { getCommandByName as u } from "./latex-commands.js";
const o = (e, n, i = {}) => ({ kind: "optional", placeholder: e, valueKind: n, ...i }), t = (e, n, i = {}) => ({ kind: "required", placeholder: e, valueKind: n, ...i }), f = /* @__PURE__ */ new Map([
  [
    "documentclass",
    [
      o("options", "key-value", {
        keyFamily: "class-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      t("class", "tex-class")
    ]
  ],
  [
    "LoadClass",
    [
      o("options", "key-value", {
        keyFamily: "class-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      t("class", "tex-class")
    ]
  ],
  [
    "usepackage",
    [
      o("options", "key-value", {
        keyFamily: "package-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      t("packages", "tex-package", { list: !0 })
    ]
  ],
  [
    "RequirePackage",
    [
      o("options", "key-value", {
        keyFamily: "package-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      t("packages", "tex-package", { list: !0 })
    ]
  ],
  ["begin", [t("environment", "environment")]],
  ["end", [t("environment", "environment")]],
  ["ref", [t("label", "label", { list: !0 })]],
  ["eqref", [t("label", "label", { list: !0 })]],
  ["pageref", [t("label", "label", { list: !0 })]],
  ["autoref", [t("label", "label", { list: !0 })]],
  ["cref", [t("labels", "label", { list: !0 })]],
  ["Cref", [t("labels", "label", { list: !0 })]],
  ["nameref", [t("label", "label", { list: !0 })]],
  [
    "cite",
    [
      o("prenote", "free-text"),
      o("postnote", "free-text"),
      t("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citep",
    [
      o("prenote", "free-text"),
      o("postnote", "free-text"),
      t("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citet",
    [
      o("prenote", "free-text"),
      o("postnote", "free-text"),
      t("keys", "citation", { list: !0 })
    ]
  ],
  [
    "parencite",
    [
      o("prenote", "free-text"),
      o("postnote", "free-text"),
      t("keys", "citation", { list: !0 })
    ]
  ],
  [
    "textcite",
    [
      o("prenote", "free-text"),
      o("postnote", "free-text"),
      t("keys", "citation", { list: !0 })
    ]
  ],
  [
    "autocite",
    [
      o("prenote", "free-text"),
      o("postnote", "free-text"),
      t("keys", "citation", { list: !0 })
    ]
  ],
  ["nocite", [t("keys", "citation", { list: !0 })]],
  ["input", [t("file", "project-tex")]],
  ["include", [t("file", "project-tex")]],
  ["subfile", [t("file", "project-tex")]],
  ["bibliography", [t("files", "project-bib", { list: !0 })]],
  ["bibliographystyle", [t("style", "bib-style")]],
  [
    "setmainfont",
    [
      o("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      t("font", "font-family")
    ]
  ],
  [
    "setsansfont",
    [
      o("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      t("font", "font-family")
    ]
  ],
  [
    "setmonofont",
    [
      o("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      t("font", "font-family")
    ]
  ],
  [
    "includegraphics",
    [
      o("options", "key-value", { keyFamily: "graphicx/includegraphics", list: !0 }),
      t("image", "project-image")
    ]
  ],
  [
    "hypersetup",
    [t("options", "key-value", { keyFamily: "hyperref/hypersetup", list: !0 })]
  ],
  ["geometry", [t("options", "key-value", { keyFamily: "geometry/geometry", list: !0 })]],
  ["tikzset", [t("options", "key-value", { keyFamily: "tikz/tikzset", list: !0 })]],
  [
    "pgfplotsset",
    [t("options", "key-value", { keyFamily: "pgfplots/pgfplotsset", list: !0 })]
  ],
  ["sisetup", [t("options", "key-value", { keyFamily: "siunitx/sisetup", list: !0 })]],
  ["lstset", [t("options", "key-value", { keyFamily: "listings/lstset", list: !0 })]],
  ["setminted", [t("options", "key-value", { keyFamily: "minted/setminted", list: !0 })]],
  [
    "printbibliography",
    [o("options", "key-value", { keyFamily: "biblatex/printbibliography", list: !0 })]
  ],
  [
    "setdefaultlanguage",
    [
      o("options", "key-value", {
        keyFamily: "polyglossia/setdefaultlanguage",
        list: !0
      }),
      t("language", "free-text")
    ]
  ],
  [
    "newglossaryentry",
    [
      t("key", "glossary-key"),
      t("fields", "key-value", {
        keyFamily: "glossaries/newglossaryentry",
        list: !0
      })
    ]
  ]
]);
function g(e) {
  const n = [];
  let i = e.startsWith("\\") ? 1 : 0;
  for (; i < e.length && /[a-zA-Z@*]/.test(e[i]); ) i++;
  for (; i < e.length; ) {
    for (; i < e.length && /\s/.test(e[i]); ) i++;
    const r = e[i];
    if (r !== "{" && r !== "[") break;
    const { content: s, end: a } = m(e, i);
    s.includes("$") && n.push({
      kind: r === "{" ? "required" : "optional",
      placeholder: k(s)
    }), i = a;
  }
  return n;
}
function m(e, n) {
  if (e[n] === "[") {
    const s = e.indexOf("]", n + 1), a = s < 0 ? e.length : s, p = s < 0 ? e.length : s + 1;
    return { content: e.slice(n + 1, a), end: p };
  }
  let r = 0;
  for (let s = n; s < e.length; s++)
    if (e[s] === "{") r++;
    else if (e[s] === "}" && --r === 0)
      return { content: e.slice(n + 1, s), end: s + 1 };
  return { content: e.slice(n + 1), end: e.length };
}
function k(e) {
  const n = e.match(/\$\{\d+:([^}]*)\}/);
  return n ? n[1] : "";
}
const l = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Set(), c = /* @__PURE__ */ new Map();
function d(e, n) {
  for (const i of n) {
    if (!i || typeof i.name != "string" || l.has(i.name)) continue;
    const r = { args: i.args ?? [], package: e };
    i.doc && (r.doc = i.doc), l.set(i.name, r);
  }
}
function h(e) {
  d(e.package, Array.isArray(e.commands) ? e.commands : []);
  for (const n of Array.isArray(e.environments) ? e.environments : []) {
    if (!n || typeof n.name != "string" || (y.add(n.name), c.has(n.name))) continue;
    const i = { args: n.args ?? [], package: e.package };
    n.doc && (i.doc = n.doc), c.set(n.name, i);
  }
}
function v() {
  return y;
}
function x(e) {
  const n = f.get(e);
  if (n) return n;
  const i = u(e);
  return i ? g(i.snippet) : l.get(e)?.args;
}
function F(e) {
  return c.get(e)?.args;
}
function w(e) {
  const n = u(e);
  return n ? n.package : l.get(e)?.package;
}
function A(e, n) {
  const i = n.map(
    (r) => r.kind === "required" ? `{${r.placeholder ?? ""}}` : `[${r.placeholder ?? ""}]`
  );
  return `\\${e}${i.join("")}`;
}
export {
  A as formatSignature,
  w as getCommandPackage,
  x as getCommandSignature,
  F as getEnvironmentSignature,
  v as getShardEnvironments,
  g as parseSignature,
  h as registerShard
};
