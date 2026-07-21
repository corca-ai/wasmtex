const u = /%\s*!\s*(?:TEX\s+)?(?:TS-)?(?:program|engine)\s*=\s*([A-Za-z]+)/i, l = /* @__PURE__ */ new Set([
  "luacode",
  "luatextra",
  "luatexbase",
  "luatex85",
  "luaotfload",
  "lua-ul",
  "luamplib",
  "luacolor",
  "luatexja",
  "luatexja-fontspec",
  "luatexja-preset"
]), f = /* @__PURE__ */ new Set(["xeCJK", "xetexko", "xecjk"]), x = /* @__PURE__ */ new Set([
  "fontspec",
  "unicode-math",
  "xltxtra",
  "xunicode",
  "polyglossia",
  "mathspec"
]);
function d(n) {
  const e = n.toLowerCase();
  return e === "xelatex" || e === "xetex" ? "xelatex" : e === "lualatex" || e === "luatex" || e === "dvilualatex" ? "lualatex" : e === "pdflatex" || e === "latex" || e === "pdftex" || e === "pdf" ? "pdflatex" : null;
}
function g(n) {
  return n.replace(/(^|[^\\])((?:\\\\)*)%.*$/gm, "$1$2");
}
function m(n) {
  const e = n.indexOf("\\begin{document}"), t = e >= 0 ? n.slice(0, e) : n.slice(0, 8192);
  return g(t);
}
function p(n) {
  const e = /* @__PURE__ */ new Set(), t = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  for (const a of n.matchAll(t))
    for (const o of (a[1] ?? "").split(",")) {
      const r = o.trim();
      r && e.add(r);
    }
  return e;
}
function s(n, e) {
  for (const t of n) if (e.has(t)) return t;
  return null;
}
const E = /\\(?:setmainfont|setsansfont|setmonofont|newfontface|fontspec)\b/;
function k(n) {
  const e = n.slice(0, 2048).match(u);
  if (e) {
    const i = d(e[1] ?? "");
    if (i)
      return { engine: i, reason: `magic comment "% !TEX program = ${e[1]}"`, forced: !0 };
  }
  const t = m(n), a = p(t);
  if (/\\directlua\b/.test(t))
    return { engine: "lualatex", reason: "\\directlua requires LuaTeX", forced: !1 };
  const o = s(a, l);
  if (o)
    return { engine: "lualatex", reason: `package "${o}" requires LuaTeX`, forced: !1 };
  const r = s(a, f);
  if (r)
    return { engine: "xelatex", reason: `package "${r}" requires XeTeX`, forced: !1 };
  const c = s(a, x);
  return c ? {
    engine: "xelatex",
    reason: `package "${c}" requires a Unicode engine (XeTeX/LuaTeX)`,
    forced: !1
  } : E.test(t) ? {
    engine: "xelatex",
    reason: "fontspec font command requires a Unicode engine",
    forced: !1
  } : { engine: "pdflatex", reason: "no Unicode-engine requirement detected", forced: !1 };
}
function A(n, e) {
  return e && e !== "auto" ? { engine: e, reason: `engine forced to ${e} by configuration`, forced: !0 } : k(n);
}
export {
  k as detectEngine,
  A as resolveEngine
};
