//#region src/engine/parse-errors.ts
var e = /\.(tex|sty|cls|aux|fd|def|cfg|clo|bbl|bst|ltx|dtx|ldf|map|enc|tfm|fmt)$/;
function t(t) {
	return t.startsWith("./") || t.startsWith("/") ? !0 : e.test(t);
}
function n(e) {
	return e.startsWith("./") ? e.slice(2).replace(/\/\.\//g, "/") : e.startsWith("/work/") ? e.slice(6).replace(/\/\.\//g, "/").replace(/^\.\//, "") : e.replace(/\/\.\//g, "/");
}
function r(e, r) {
	let i = e.slice(r + 1).match(/^([^()\s]+)/);
	return i && t(i[1]) ? {
		raw: i[1],
		path: n(i[1]),
		consumed: 1 + i[1].length
	} : null;
}
function i(e) {
	let t = [], n = 0;
	for (let i = 0; i < e.length; i++) {
		let a = e[i], o = 0;
		for (; o < a.length;) {
			if (a[o] === "(") {
				let e = r(a, o);
				if (e) {
					t.push({
						type: "open",
						path: e.path,
						raw: e.raw
					}), o += e.consumed;
					continue;
				}
				n++;
			} else a[o] === ")" && (n > 0 ? n-- : t.push({ type: "close" }));
			o++;
		}
		t.push({
			type: "eol",
			lineIndex: i
		});
	}
	return t;
}
function a(e) {
	let t = [], n = [];
	for (let r of i(e)) r.type === "open" ? t.push(r.path) : r.type === "close" ? t.length > 0 && t.pop() : n[r.lineIndex] = t.length > 0 ? t[t.length - 1] : "";
	return n;
}
function o(e, t) {
	let n = Math.min(t + 5, e.length);
	for (let r = t; r < n; r++) {
		let t = e[r].match(/^l\.(\d+)\s/);
		if (t) return parseInt(t[1], 10);
	}
	return 0;
}
function s(e, t) {
	let n = e.match(/at lines? (\d+)/) ?? t.match(/at lines? (\d+)/);
	return n ? parseInt(n[1], 10) : 0;
}
function c(e) {
	let t = e.match(/on input line (\d+)/);
	return t ? parseInt(t[1], 10) : 0;
}
var l = /File `([^']+\.(?:sty|cls))' not found/;
function u(e) {
	let t = e.message.match(l);
	if (!t) return;
	let n = t[1], r = n.endsWith(".cls") ? "class" : "package", i = n.replace(/\.(?:sty|cls)$/, "");
	e.code = "missing-package", e.message = `${e.message} — ${r} \`${i}\` is not on the bundled TeX Live mirror (or the name is misspelled).`;
}
function d(e, t, n) {
	if (!/^Package fontspec Error:/.test(e.message)) return;
	let r = /The font "([^"]+)" cannot be found/, i = e.message.match(r);
	for (let e = n + 1; !i && e < Math.min(n + 8, t.length); e++) i = t[e].match(r);
	if (!i) return;
	let a = i[1];
	e.code = "font-not-found", e.message = `Font "${a}" could not be found — check the name and that the font is on the bundled mirror. In LuaLaTeX, reference fonts by filename (e.g. \`lmroman10-regular.otf\`) or use XeLaTeX.`;
}
function f(e, t, n, r) {
	let i = e.match(/^! (.+)/);
	if (!i) return !1;
	let a = {
		line: o(t, n + 1),
		message: i[1],
		severity: "error"
	};
	return u(a), d(a, t, n), r.push(a), !0;
}
function p(e, t) {
	let n = e.match(/LaTeX Warning:\s*(.+)/);
	return n ? (t.push({
		line: c(e),
		message: n[1],
		severity: "warning"
	}), !0) : !1;
}
function m(e, t, n, r) {
	let i = e.match(/^Package (\S+) Error:\s*(.+)/);
	if (!i) return !1;
	let a = c(e) || o(t, n + 1);
	return r.push({
		line: a,
		message: `[${i[1]}] ${i[2]}`,
		severity: "error"
	}), !0;
}
function h(e, t) {
	let n = e.match(/^Package (\S+) Warning:\s*(.+)/);
	return n ? (n[1] === "epstopdf" && /shell escape feature is not enabled/i.test(n[2]) || t.push({
		line: c(e),
		message: `[${n[1]}] ${n[2]}`,
		severity: "warning"
	}), !0) : !1;
}
function g(e, t, n) {
	return /^Overfull \\[hv]box .+/.test(e) ? (n.push({
		line: s(e, t),
		message: e,
		severity: "warning"
	}), !0) : !1;
}
function _(e) {
	let t = [], n = e.split("\n"), r = a(n);
	for (let e = 0; e < n.length; e++) {
		let i = n[e], a = t.length;
		f(i, n, e, t) || p(i, t) || m(i, n, e, t) || h(i, t) || g(i, n[e + 1] ?? "", t);
		let o = r[e];
		if (o) for (let e = a; e < t.length; e++) t[e].file = o;
	}
	return t.push(...v(e)), t;
}
function v(e) {
	return T(e).map((e) => {
		let t = e.script ? `${e.script} ` : "";
		return {
			line: 0,
			message: `Font [${e.font}] has no glyph for ${e.codepoints.length} ${t}character(s) used in the document (e.g. ${e.sample}); they render as blank boxes.`,
			severity: "warning",
			code: "missing-glyph"
		};
	});
}
var y = /^Missing character: There is no (.+?)(?: \(U\+([0-9A-Fa-f]+)\))? in font (.+?)!?\s*$/, b = [
	"Hangul",
	"Hiragana",
	"Katakana",
	"Han",
	"Cyrillic",
	"Greek",
	"Arabic",
	"Hebrew",
	"Thai",
	"Devanagari",
	"Latin"
];
function x(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = String.fromCodePoint(n);
		for (let n of b) {
			let r;
			try {
				r = RegExp(`\\p{Script=${n}}`, "u");
			} catch {
				continue;
			}
			if (r.test(e)) {
				t.set(n, (t.get(n) ?? 0) + 1);
				break;
			}
		}
	}
	let n, r = 0;
	for (let [e, i] of t) i > r && (n = e, r = i);
	return n;
}
function S(e) {
	let t = /^\^\^([0-9a-f]{2})$/.exec(e);
	if (t) return parseInt(t[1], 16);
	let n = /^\^\^([\s\S])$/.exec(e);
	return n ? n[1].charCodeAt(0) ^ 64 : e.codePointAt(0) ?? NaN;
}
function C(e) {
	let t = e.match(y);
	if (!t) return null;
	let n = t[2] ? parseInt(t[2], 16) : t[1] == null ? NaN : S(t[1]);
	return !Number.isInteger(n) || n < 0 || n > 1114111 ? null : {
		font: t[3].replace(/^\[/, "").replace(/\]$/, ""),
		cp: n
	};
}
function w(e) {
	let t = [];
	for (let n of e.split("\n")) {
		let e = C(n);
		e && t.push({
			font: e.font,
			codepoint: e.cp
		});
	}
	return t;
}
function T(e) {
	let t = /* @__PURE__ */ new Map();
	for (let { font: n, codepoint: r } of w(e)) {
		let e = t.get(n);
		e || (e = {
			cps: [],
			seen: /* @__PURE__ */ new Set(),
			count: 0
		}, t.set(n, e)), e.count++, e.seen.has(r) || (e.seen.add(r), e.cps.push(r));
	}
	let n = [];
	for (let [e, r] of t) {
		let t = r.cps.slice().sort((e, t) => e - t), i = {
			font: e,
			codepoints: t,
			count: r.count,
			sample: t.slice(0, 8).map((e) => String.fromCodePoint(e)).join("")
		}, a = x(t);
		a && (i.script = a), n.push(i);
	}
	return n;
}
function E(e) {
	if (e.code === "missing-package") return "missing-package";
	if (e.code === "font-not-found") return "font-not-found";
	let t = e.message;
	return /Reference `[^']*'.*undefined/i.test(t) ? "undefined-reference" : /Citation `[^']*'.*undefined/i.test(t) ? "undefined-citation" : /Rerun|Label\(s\) may have changed/i.test(t) ? "rerun-needed" : /^Overfull /.test(t) ? "overfull-box" : /^Package \S+ Error:/.test(t) ? "package-error" : /^Package \S+ Warning:/.test(t) ? "package-warning" : /^\[[^\]]+] /.test(t) ? e.severity === "error" ? "package-error" : "package-warning" : e.severity === "error" ? "tex-error" : "latex-warning";
}
function D(e) {
	let t = E(e), n = {
		code: t,
		severity: t === "rerun-needed" ? "info" : e.severity,
		message: e.message
	};
	return e.file && (n.file = e.file), e.line && (n.line = e.line), n;
}
function O(e, t = T(e)) {
	let n = [];
	for (let t of _(e)) t.code !== "missing-glyph" && n.push(D(t));
	for (let e of t) {
		let t = e.script ? `${e.script} ` : "";
		n.push({
			code: "missing-glyph",
			severity: "warning",
			message: `Font [${e.font}] has no glyph for ${e.codepoints.length} ${t}character(s) (e.g. ${e.sample}); they render as blank boxes.`,
			glyph: e
		});
	}
	return n;
}
//#endregion
export { O as buildDiagnostics, a as buildFileContext, T as parseGlyphGaps, w as parseGlyphOccurrences, _ as parseTexErrors, i as scanFileEvents };
