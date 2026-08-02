import { getCommandByName as u } from "./latex-commands.js";
const n = (t, o, i = {}) => ({ kind: "optional", placeholder: t, valueKind: o, ...i }), e = (t, o, i = {}) => ({ kind: "required", placeholder: t, valueKind: o, ...i }), p = /* @__PURE__ */ new Map([
  [
    "documentclass",
    [
      n("options", "key-value", {
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
      n("options", "key-value", {
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
      n("options", "key-value", {
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
      n("options", "key-value", {
        keyFamily: "package-options",
        list: !0,
        selectorArgumentIndex: 1
      }),
      e("packages", "tex-package", { list: !0 })
    ]
  ],
  ["begin", [e("environment", "environment")]],
  ["end", [e("environment", "environment")]],
  ["color", [n("model", "free-text"), e("color", "color")]],
  [
    "textcolor",
    [n("model", "free-text"), e("color", "color"), e("text", "free-text")]
  ],
  [
    "colorbox",
    [n("model", "free-text"), e("color", "color"), e("text", "free-text")]
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
      n("prenote", "free-text"),
      n("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citep",
    [
      n("prenote", "free-text"),
      n("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "citet",
    [
      n("prenote", "free-text"),
      n("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "parencite",
    [
      n("prenote", "free-text"),
      n("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "textcite",
    [
      n("prenote", "free-text"),
      n("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  [
    "autocite",
    [
      n("prenote", "free-text"),
      n("postnote", "free-text"),
      e("keys", "citation", { list: !0 })
    ]
  ],
  ["nocite", [e("keys", "citation", { list: !0 })]],
  ["input", [e("file", "project-tex")]],
  ["include", [e("file", "project-tex")]],
  ["subfile", [e("file", "project-tex")]],
  ["bibliography", [e("files", "project-bib", { list: !0 })]],
  ["addbibresource", [n("options", "key-value"), e("file", "project-bib")]],
  ["addglobalbib", [n("options", "key-value"), e("file", "project-bib")]],
  ["addsectionbib", [n("options", "key-value"), e("file", "project-bib")]],
  ["bibliographystyle", [e("style", "bib-style")]],
  [
    "setmainfont",
    [
      n("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      e("font", "font-family")
    ]
  ],
  [
    "setsansfont",
    [
      n("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      e("font", "font-family")
    ]
  ],
  [
    "setmonofont",
    [
      n("options", "key-value", { keyFamily: "fontspec/font", list: !0 }),
      e("font", "font-family")
    ]
  ],
  [
    "includegraphics",
    [
      n("options", "key-value", { keyFamily: "graphicx/includegraphics", list: !0 }),
      e("image", "project-image")
    ]
  ],
  ["includesvg", [n("options", "key-value"), e("image", "project-image")]],
  ["lstinputlisting", [n("options", "key-value"), e("file", "project-listing")]],
  [
    "inputminted",
    [
      n("options", "key-value"),
      e("language", "free-text"),
      e("file", "project-listing")
    ]
  ],
  ["VerbatimInput", [n("options", "key-value"), e("file", "project-listing")]],
  ["verbatiminput", [e("file", "project-listing")]],
  [
    "csvreader",
    [
      n("options", "key-value"),
      e("file", "project-data"),
      e("assignments", "free-text"),
      e("command", "free-text")
    ]
  ],
  [
    "DTLloaddb",
    [
      n("options", "key-value"),
      e("database", "free-text"),
      e("file", "project-data")
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
    [n("options", "key-value", { keyFamily: "biblatex/printbibliography", list: !0 })]
  ],
  [
    "setdefaultlanguage",
    [
      n("options", "key-value", {
        keyFamily: "polyglossia/setdefaultlanguage",
        list: !0
      }),
      e("language", "free-text")
    ]
  ],
  [
    "newglossaryentry",
    [
      e("key", "free-text"),
      e("fields", "key-value", {
        keyFamily: "glossaries/newglossaryentry",
        list: !0
      })
    ]
  ],
  [
    "longnewglossaryentry",
    [
      e("key", "free-text"),
      e("fields", "key-value"),
      e("description", "free-text")
    ]
  ],
  [
    "newacronym",
    [
      n("options", "key-value"),
      e("key", "free-text"),
      e("abbreviation", "free-text"),
      e("long form", "free-text")
    ]
  ],
  ["gls", [e("key", "glossary-key")]],
  ["Gls", [e("key", "glossary-key")]],
  ["glspl", [e("key", "glossary-key")]],
  ["Glspl", [e("key", "glossary-key")]],
  ["glsadd", [e("key", "glossary-key")]],
  ["acrshort", [e("key", "acronym-key")]],
  ["acrlong", [e("key", "acronym-key")]],
  ["acrfull", [e("key", "acronym-key")]],
  ["ac", [e("key", "acronym-key")]],
  ["setcounter", [e("counter", "counter"), e("value", "number")]],
  ["addtocounter", [e("counter", "counter"), e("value", "number")]],
  ["stepcounter", [e("counter", "counter")]],
  ["refstepcounter", [e("counter", "counter")]],
  ["value", [e("counter", "counter")]],
  ["counterwithin", [e("counter", "counter"), e("within", "counter")]],
  ["counterwithout", [e("counter", "counter"), e("within", "counter")]],
  ["setlength", [e("length", "length"), e("value", "dimension")]],
  ["addtolength", [e("length", "length"), e("value", "dimension")]],
  ["settowidth", [e("length", "length"), e("text", "free-text")]],
  ["settoheight", [e("length", "length"), e("text", "free-text")]],
  ["settodepth", [e("length", "length"), e("text", "free-text")]],
  ["fontspec", [n("options", "key-value"), e("font", "font-family")]],
  ["fontfamily", [e("font", "font-family")]],
  [
    "setkeys",
    [
      e("family", "key-family"),
      e("options", "key-value", { keyFamilySelectorArgumentIndex: 0, list: !0 })
    ]
  ],
  [
    "SetKeys",
    [
      n("family", "key-family"),
      e("options", "key-value", { keyFamilySelectorArgumentIndex: 0, list: !0 })
    ]
  ],
  ["pgfkeys", [e("options", "key-value", { keyFamily: "pgfkeys", list: !0 })]]
]);
function g(t) {
  const o = [];
  let i = t.startsWith("\\") ? 1 : 0;
  for (; i < t.length && /[a-zA-Z@*]/.test(t[i]); ) i++;
  for (; i < t.length; ) {
    for (; i < t.length && /\s/.test(t[i]); ) i++;
    const l = t[i];
    if (l !== "{" && l !== "[") break;
    const { content: r, end: a } = k(t, i);
    r.includes("$") && o.push({
      kind: l === "{" ? "required" : "optional",
      placeholder: m(r)
    }), i = a;
  }
  return o;
}
function k(t, o) {
  if (t[o] === "[") {
    const r = t.indexOf("]", o + 1), a = r < 0 ? t.length : r, f = r < 0 ? t.length : r + 1;
    return { content: t.slice(o + 1, a), end: f };
  }
  let l = 0;
  for (let r = o; r < t.length; r++)
    if (t[r] === "{") l++;
    else if (t[r] === "}" && --l === 0)
      return { content: t.slice(o + 1, r), end: r + 1 };
  return { content: t.slice(o + 1), end: t.length };
}
function m(t) {
  const o = t.match(/\$\{\d+:([^}]*)\}/);
  return o ? o[1] : "";
}
const s = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Set(), c = /* @__PURE__ */ new Map();
function d(t, o) {
  for (const i of o) {
    if (!i || typeof i.name != "string" || s.has(i.name)) continue;
    const l = { args: i.args ?? [], package: t };
    i.doc && (l.doc = i.doc), s.set(i.name, l);
  }
}
function h(t) {
  d(t.package, Array.isArray(t.commands) ? t.commands : []);
  for (const o of Array.isArray(t.environments) ? t.environments : []) {
    if (!o || typeof o.name != "string" || (y.add(o.name), c.has(o.name))) continue;
    const i = { args: o.args ?? [], package: t.package };
    o.doc && (i.doc = o.doc), c.set(o.name, i);
  }
}
function v() {
  return y;
}
function x(t) {
  const o = p.get(t);
  if (o) return o;
  const i = u(t);
  return i ? g(i.snippet) : s.get(t)?.args;
}
function F(t) {
  return c.get(t)?.args;
}
function j(t) {
  const o = u(t);
  return o ? o.package : s.get(t)?.package;
}
function w(t, o) {
  const i = o.map(
    (l) => l.kind === "required" ? `{${l.placeholder ?? ""}}` : `[${l.placeholder ?? ""}]`
  );
  return `\\${t}${i.join("")}`;
}
export {
  w as formatSignature,
  j as getCommandPackage,
  x as getCommandSignature,
  F as getEnvironmentSignature,
  v as getShardEnvironments,
  g as parseSignature,
  h as registerShard
};
