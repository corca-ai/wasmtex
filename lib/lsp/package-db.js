import { getCommandByName as u } from "./latex-commands.js";
const i = (t, n, o = {}) => ({ kind: "optional", placeholder: t, valueKind: n, ...o }), e = (t, n, o = {}) => ({ kind: "required", placeholder: t, valueKind: n, ...o }), p = /* @__PURE__ */ new Map([
  [
    "documentclass",
    [
      i("options", "key-value", {
        keyFamily: "class-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      e("class", "tex-class")
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
      e("class", "tex-class")
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
      e("packages", "tex-package", { list: !0 })
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
      e("packages", "tex-package", { list: !0 })
    ]
  ],
  ["begin", [e("environment", "environment")]],
  ["end", [e("environment", "environment")]],
  ["color", [i("model", "free-text"), e("color", "color")]],
  [
    "textcolor",
    [i("model", "free-text"), e("color", "color"), e("text", "free-text")]
  ],
  [
    "colorbox",
    [i("model", "free-text"), e("color", "color"), e("text", "free-text")]
  ],
  [
    "fcolorbox",
    [
      e("frame color", "color"),
      e("background color", "color"),
      e("text", "free-text")
    ]
  ],
  ["ref", [e("label", "label", { list: !0 })]],
  ["eqref", [e("label", "label", { list: !0 })]],
  ["pageref", [e("label", "label", { list: !0 })]],
  ["autoref", [e("label", "label", { list: !0 })]],
  ["cref", [e("labels", "label", { list: !0 })]],
  ["Cref", [e("labels", "label", { list: !0 })]],
  ["nameref", [e("label", "label", { list: !0 })]],
  [
    "cite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citep",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citet",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "parencite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "textcite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "autocite",
    [
      i("prenote", "free-text"),
      i("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  ["nocite", [e("keys", "citation", { list: !0 })]],
  ["input", [e("file", "project-tex")]],
  ["include", [e("file", "project-tex")]],
  ["subfile", [e("file", "project-tex")]],
  ["bibliography", [e("files", "project-bib", { list: !0 })]],
  ["bibliographystyle", [e("style", "bib-style")]],
  [
    "setmainfont",
    [
      i("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      e("font", "font-family")
    ]
  ],
  [
    "setsansfont",
    [
      i("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      e("font", "font-family")
    ]
  ],
  [
    "setmonofont",
    [
      i("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      e("font", "font-family")
    ]
  ],
  [
    "includegraphics",
    [
      i("options", "key-value", { keyFamily: "graphicx/includegraphics", list: !0 }),
      e("image", "project-image")
    ]
  ],
  [
    "hypersetup",
    [e("options", "key-value", { keyFamily: "hyperref/hypersetup", list: !0 })]
  ],
  ["geometry", [e("options", "key-value", { keyFamily: "geometry/geometry", list: !0 })]],
  ["tikzset", [e("options", "key-value", { keyFamily: "tikz/tikzset", list: !0 })]],
  [
    "pgfplotsset",
    [e("options", "key-value", { keyFamily: "pgfplots/pgfplotsset", list: !0 })]
  ],
  ["sisetup", [e("options", "key-value", { keyFamily: "siunitx/sisetup", list: !0 })]],
  ["lstset", [e("options", "key-value", { keyFamily: "listings/lstset", list: !0 })]],
  ["setminted", [e("options", "key-value", { keyFamily: "minted/setminted", list: !0 })]],
  [
    "printbibliography",
    [i("options", "key-value", { keyFamily: "biblatex/printbibliography", list: !0 })]
  ],
  [
    "setdefaultlanguage",
    [
      i("options", "key-value", {
        keyFamily: "polyglossia/setdefaultlanguage",
        list: !0
      }),
      e("language", "free-text")
    ]
  ],
  [
    "newglossaryentry",
    [
      e("key", "glossary-key"),
      e("fields", "key-value", {
        keyFamily: "glossaries/newglossaryentry",
        list: !0
      })
    ]
  ]
]);
function g(t) {
  const n = [];
  let o = t.startsWith("\\") ? 1 : 0;
  for (; o < t.length && /[a-zA-Z@*]/.test(t[o]); ) o++;
  for (; o < t.length; ) {
    for (; o < t.length && /\s/.test(t[o]); ) o++;
    const l = t[o];
    if (l !== "{" && l !== "[") break;
    const { content: r, end: a } = m(t, o);
    r.includes("$") && n.push({
      kind: l === "{" ? "required" : "optional",
      placeholder: k(r)
    }), o = a;
  }
  return n;
}
function m(t, n) {
  if (t[n] === "[") {
    const r = t.indexOf("]", n + 1), a = r < 0 ? t.length : r, f = r < 0 ? t.length : r + 1;
    return { content: t.slice(n + 1, a), end: f };
  }
  let l = 0;
  for (let r = n; r < t.length; r++)
    if (t[r] === "{") l++;
    else if (t[r] === "}" && --l === 0)
      return { content: t.slice(n + 1, r), end: r + 1 };
  return { content: t.slice(n + 1), end: t.length };
}
function k(t) {
  const n = t.match(/\$\{\d+:([^}]*)\}/);
  return n ? n[1] : "";
}
const s = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Set(), c = /* @__PURE__ */ new Map();
function d(t, n) {
  for (const o of n) {
    if (!o || typeof o.name != "string" || s.has(o.name)) continue;
    const l = { args: o.args ?? [], package: t };
    o.doc && (l.doc = o.doc), s.set(o.name, l);
  }
}
function x(t) {
  d(t.package, Array.isArray(t.commands) ? t.commands : []);
  for (const n of Array.isArray(t.environments) ? t.environments : []) {
    if (!n || typeof n.name != "string" || (y.add(n.name), c.has(n.name))) continue;
    const o = { args: n.args ?? [], package: t.package };
    n.doc && (o.doc = n.doc), c.set(n.name, o);
  }
}
function h() {
  return y;
}
function v(t) {
  const n = p.get(t);
  if (n) return n;
  const o = u(t);
  return o ? g(o.snippet) : s.get(t)?.args;
}
function F(t) {
  return c.get(t)?.args;
}
function w(t) {
  const n = u(t);
  return n ? n.package : s.get(t)?.package;
}
function A(t, n) {
  const o = n.map(
    (l) => l.kind === "required" ? `{${l.placeholder ?? ""}}` : `[${l.placeholder ?? ""}]`
  );
  return `\\${t}${o.join("")}`;
}
export {
  A as formatSignature,
  w as getCommandPackage,
  v as getCommandSignature,
  F as getEnvironmentSignature,
  h as getShardEnvironments,
  g as parseSignature,
  x as registerShard
};
