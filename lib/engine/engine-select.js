//#region src/engine/engine-select.ts
var e = /%\s*!\s*(?:TEX\s+)?(?:TS-)?(?:program|engine)\s*=\s*([A-Za-z]+)/i, t = /* @__PURE__ */ new Set([
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
]), n = /* @__PURE__ */ new Set([
	"xeCJK",
	"xetexko",
	"xecjk"
]), r = /* @__PURE__ */ new Set([
	"fontspec",
	"unicode-math",
	"xltxtra",
	"xunicode",
	"polyglossia",
	"mathspec"
]);
function i(e) {
	let t = e.toLowerCase();
	return t === "xelatex" || t === "xetex" ? "xelatex" : t === "lualatex" || t === "luatex" || t === "dvilualatex" ? "lualatex" : t === "pdflatex" || t === "latex" || t === "pdftex" || t === "pdf" ? "pdflatex" : null;
}
function a(e) {
	return e.replace(/(^|[^\\])((?:\\\\)*)%.*$/gm, "$1$2");
}
function o(e) {
	let t = e.indexOf("\\begin{document}");
	return a(t >= 0 ? e.slice(0, t) : e.slice(0, 8192));
}
function s(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) for (let e of (n[1] ?? "").split(",")) {
		let n = e.trim();
		n && t.add(n);
	}
	return t;
}
function c(e, t) {
	for (let n of e) if (t.has(n)) return n;
	return null;
}
var l = /\\(?:setmainfont|setsansfont|setmonofont|newfontface|fontspec)\b/;
function u(a) {
	let u = a.slice(0, 2048).match(e);
	if (u) {
		let e = i(u[1] ?? "");
		if (e) return {
			engine: e,
			reason: `magic comment "% !TEX program = ${u[1]}"`,
			forced: !0
		};
	}
	let d = o(a), f = s(d);
	if (/\\directlua\b/.test(d)) return {
		engine: "lualatex",
		reason: "\\directlua requires LuaTeX",
		forced: !1
	};
	let p = c(f, t);
	if (p) return {
		engine: "lualatex",
		reason: `package "${p}" requires LuaTeX`,
		forced: !1
	};
	let m = c(f, n);
	if (m) return {
		engine: "xelatex",
		reason: `package "${m}" requires XeTeX`,
		forced: !1
	};
	let h = c(f, r);
	return h ? {
		engine: "xelatex",
		reason: `package "${h}" requires a Unicode engine (XeTeX/LuaTeX)`,
		forced: !1
	} : l.test(d) ? {
		engine: "xelatex",
		reason: "fontspec font command requires a Unicode engine",
		forced: !1
	} : {
		engine: "pdflatex",
		reason: "no Unicode-engine requirement detected",
		forced: !1
	};
}
function d(e, t) {
	return t && t !== "auto" ? {
		engine: t,
		reason: `engine forced to ${t} by configuration`,
		forced: !0
	} : u(e);
}
//#endregion
export { u as detectEngine, d as resolveEngine };
