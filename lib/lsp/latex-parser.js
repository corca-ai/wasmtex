import { CITE_CMDS as e, COMMAND_TOKEN as t, INPUT_CMDS as n, NEWCMD_CMDS as r, REF_CMDS as i, SECTION_CMDS as a, USEPACKAGE_CMDS as o } from "./latex-patterns.js";
import { VERBATIM_ENVIRONMENTS as s, tokenize as c } from "./latex-tokenizer.js";
import { buildLineStarts as l, offsetToLineCol as u } from "./source-position.js";
//#region src/lsp/latex-parser.ts
var d = /* @__PURE__ */ new Set([
	"if",
	"ifx",
	"ifnum",
	"ifdim",
	"ifodd",
	"ifvmode",
	"ifhmode",
	"ifmmode",
	"ifinner",
	"ifvoid",
	"ifhbox",
	"ifvbox",
	"ifeof",
	"ifcase",
	"ifdefined",
	"ifcsname",
	"ifincsname",
	"iffontchar"
]), f = /* @__PURE__ */ new Set(/* @__PURE__ */ "ifthenelse.ifoddpage.ifdef.ifcsdef.ifundef.ifcsundef.ifdefmacro.ifdefparam.ifdefempty.ifcsempty.ifdefvoid.ifdefstring.ifcsstring.ifdefstrequal.ifdefcounter.ifcscounter.ifdefdimen.ifcsdimen.ifboolexpr.ifblank.ifstrequal.ifstrempty.ifnumcomp.ifnumequal.ifnumgreater.ifnumless.ifdimcomp.ifdimequal.ifdimgreater.ifdimless.ifbool.iftoggle.ifnumodd.ifnumparity".split("."));
function p(e) {
	return e.length > 2 && e.startsWith("if") && e !== "iff" && !f.has(e);
}
function ee(e, t = []) {
	let n = [], r = [], i = (e) => t.some(([t, n]) => e >= t && e < n);
	for (let t of e) t.type === "command" && !i(t.start) && te(t, r, n);
	return n;
}
function te(e, t, n) {
	let r = e.value;
	r === "iffalse" ? t.push({
		kind: "false",
		falseStart: e.end,
		elseSeen: !1
	}) : r === "iftrue" ? t.push({
		kind: "true",
		falseStart: -1,
		elseSeen: !1
	}) : r === "if" || d.has(r) || p(r) ? t.push({
		kind: "other",
		falseStart: -1,
		elseSeen: !1
	}) : r === "else" ? ne(t[t.length - 1], e, n) : r === "fi" && re(t.pop(), e, n);
}
function ne(e, t, n) {
	!e || e.elseSeen || (e.elseSeen = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function re(e, t, n) {
	e && (e.kind === "false" && !e.elseSeen || e.kind === "true" && e.elseSeen) && n.push([e.falseStart, t.start]);
}
function ie(e) {
	let t = [];
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		if (r.type !== "command" || r.value !== "begin") continue;
		let i = m(e, n);
		if (!i || !s.has(i.name)) continue;
		let a = ae(e, i.closeIndex + 1, i.name), o = a?.start ?? e[e.length - 1].end;
		o > i.closeEnd && t.push([i.closeEnd, o]), a && (n = a.index);
	}
	return t;
}
function ae(e, t, n) {
	for (let r = t; r < e.length; r++) {
		let t = e[r];
		if (t.type !== "command" || t.value !== "end") continue;
		let i = m(e, r);
		if (i && i.name === n) return {
			start: t.start,
			index: r
		};
	}
	return null;
}
function m(e, t) {
	let n = t + 1;
	for (; n < e.length && e[n].type === "text" && e[n].value.trim() === "";) n++;
	if (n >= e.length || e[n].type !== "open") return null;
	let r = e[n + 1];
	if (!r || r.type !== "text") return null;
	let i = e[n + 2];
	return !i || i.type !== "close" ? null : {
		name: r.value.trim(),
		closeIndex: n + 2,
		closeEnd: i.end
	};
}
function oe(e) {
	return h(c(e));
}
function se(e) {
	return h(e);
}
function h(e) {
	let t = [];
	for (let n of e) (n.type === "comment" || n.type === "verb") && t.push([n.start, n.end]);
	let n = ie(e);
	return t.push(...n), t.push(...ee(e, n)), t;
}
function ce(e, t) {
	return g(e, h(t));
}
function g(e, t) {
	if (t.length === 0) return e;
	let n = t.length > 1 ? [...t].sort((e, t) => e[0] - t[0]) : t, r = [], i = 0;
	for (let [t, a] of n) {
		let n = t > i ? t : i, o = a < e.length ? a : e.length;
		o <= n || (n > i && r.push(e.slice(i, n)), r.push(e.slice(n, o).replace(/[^\n]/g, " ")), i = o);
	}
	return i < e.length && r.push(e.slice(i)), r.join("");
}
function _(e) {
	let t = /* @__PURE__ */ new Map(), n = [], r = [], i = {
		"{": n,
		"[": r
	}, a = {
		"}": n,
		"]": r
	};
	for (let n = 0; n < e.length; n++) {
		let r = e.charAt(n);
		if (r === "\\") {
			n++;
			continue;
		}
		let o = i[r];
		if (o) {
			o.push(n);
			continue;
		}
		let s = a[r]?.pop();
		s !== void 0 && t.set(s, n);
	}
	return t;
}
function v(e, t, n) {
	if (e[t] !== "{") return null;
	if (n) {
		let r = n.get(t);
		return r === void 0 ? null : e.slice(t + 1, r);
	}
	let r = 0;
	for (let n = t; n < e.length; n++) {
		if (e[n] === "\\") {
			n++;
			continue;
		}
		if (e[n] === "{") r++;
		else if (e[n] === "}" && (r--, r === 0)) return e.slice(t + 1, n);
	}
	return null;
}
var y = /\\label\{/g, b = RegExp(`\\\\(?:${i})\\{`, "g"), x = RegExp(`\\\\(?:${e})(?:\\[[^\\]]*\\])*\\{`, "g"), le = RegExp(`\\\\(${a})\\*?(?:\\[[^\\]]*\\])?\\{`, "g"), ue = RegExp(`\\\\(?:${r})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?`, "g"), de = /\\def\\(\w+)/g, fe = /\\DeclareMathOperator\*?\{\\(\w+)\}/g, pe = /\\begin\{/g, me = RegExp(`\\\\(${n})\\{`, "g"), he = RegExp(`\\\\(?:${o})(?:\\[([^\\]]*)\\])?\\{`, "g"), ge = /\\(definecolorset|providecolorset|preparecolorset|DefineNamedColor|definecolor|xdefinecolor|providecolor|colorlet)\*?(?![A-Za-z@:_])/g, _e = /\\(definecolors|providecolors)(?!et)\*?\s*\{/g, ve = /\\(newcounter|providecounter|newaliascnt|setcounter|addtocounter|stepcounter|refstepcounter|value|counterwithin|counterwithout)\*?\s*\{/g, ye = /\\(setlength|addtolength|settowidth|settoheight|settodepth)\*?\s*\{\s*(\\[A-Za-z@]+)\s*\}/g, be = /\\(newlength|newdimen|newskip)\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))/g, xe = /\\pgfkeys\s*\{/g, Se = /* @__PURE__ */ new Set(["bibitem"]), Ce = /* @__PURE__ */ new Set([
	"newenvironment",
	"renewenvironment",
	"NewDocumentEnvironment",
	"RenewDocumentEnvironment",
	"ProvideDocumentEnvironment",
	"DeclareDocumentEnvironment",
	"newtheorem"
]), we = /* @__PURE__ */ new Set([
	"documentclass",
	"LoadClass",
	"LoadClassWithOptions"
]), Te = /* @__PURE__ */ new Set([
	"bibliography",
	"addbibresource",
	"addglobalbib",
	"addsectionbib"
]), Ee = /* @__PURE__ */ new Set(["longnewglossaryentry", "newglossaryentry"]), De = /* @__PURE__ */ new Set([
	"gls",
	"Gls",
	"glspl",
	"Glspl",
	"glsdisp",
	"Glsdisp",
	"glslink",
	"Glslink",
	"glsentryname",
	"Glsentryname",
	"glsentrytext",
	"Glsentrytext",
	"glsentryplural",
	"Glsentryplural",
	"glsentrydesc",
	"Glsentrydesc",
	"glsentrydescplural",
	"Glsentrydescplural",
	"glsentrysymbol",
	"Glsentrysymbol",
	"glsentrysymbolplural",
	"Glsentrysymbolplural",
	"glsadd"
]), Oe = /* @__PURE__ */ new Set(["newacronym"]), ke = /* @__PURE__ */ new Set([
	"acrshort",
	"Acrshort",
	"ACRshort",
	"acrlong",
	"Acrlong",
	"ACRlong",
	"acrfull",
	"Acrfull",
	"ACRfull",
	"ac",
	"Ac",
	"acf",
	"Acf",
	"acl",
	"Acl",
	"acs",
	"Acs",
	"acp",
	"Acp"
]), Ae = /* @__PURE__ */ new Set([
	"setmainfont",
	"setsansfont",
	"setmonofont",
	"fontspec"
]), je = /* @__PURE__ */ new Set(["newfontfamily", "newfontface"]), S = /* @__PURE__ */ new Set(["DeclareFontFamily"]), Me = /* @__PURE__ */ new Set([
	"definekey",
	"define@key",
	"defineboolkey",
	"definechoicekey",
	"define@choicekey"
]), Ne = /* @__PURE__ */ new Set(["DeclareKeys"]);
function C(e) {
	if (!e) return !1;
	let t = e.charCodeAt(0);
	return t >= 65 && t <= 90 || t >= 97 && t <= 122 || e === "@" || e === ":" || e === "_";
}
function w(e) {
	let t = [], n = 0;
	for (; n < e.length;) {
		let r = e.indexOf("\\", n);
		if (r < 0) break;
		let i = r + 1;
		for (; C(e[i]);) i++;
		i > r + 1 && t.push({
			name: e.slice(r + 1, i),
			start: r,
			end: i
		}), n = Math.max(r + 2, i);
	}
	return t;
}
function* T(e, t) {
	for (let n of e.commandOccurrences) t.has(n.name) && (yield n);
}
function E(e, t) {
	let n = e.masked[t.end] === "*" ? t.end + 1 : t.end;
	return F(e.masked, n, e.groupEnds);
}
function D(e) {
	return e.find((e) => e.delimiter === "required");
}
function O(e) {
	return e.contentStart + (e.value.length - e.value.trimStart().length);
}
function k(e, t) {
	let { line: n, column: r } = u(e.lineStarts, t);
	return {
		file: e.file,
		line: n,
		column: r
	};
}
function A(e, t) {
	let n = t.trimStart();
	return e + 1 + (t.length - n.length);
}
function j(e, t, n, r) {
	for (let i of e.masked.matchAll(t)) {
		let t = i.index + i[0].length - 1, a = v(e.masked, t, e.groupEnds);
		if (!a) continue;
		let o = a.trim();
		!o || n && o.includes("#") || r(o, k(e, A(t, a)));
	}
}
function Pe(e, t) {
	j(e, y, !0, (e, n) => t.labels.push({
		name: e,
		location: n
	}));
}
function Fe(e, t) {
	j(e, b, !0, (e, n) => t.labelRefs.push({
		name: e,
		location: n
	}));
}
function Ie(e, t) {
	for (let n of e.masked.matchAll(x)) {
		let r = n.index + n[0].length - 1, i = v(e.masked, r, e.groupEnds);
		if (!i) continue;
		let a = r + 1;
		for (let n of i.split(",")) {
			let r = n.trim();
			r && !r.includes("#") && t.citations.push({
				key: r,
				location: k(e, a + n.indexOf(r))
			}), a += n.length + 1;
		}
	}
}
function Le(e, t) {
	for (let n of e.masked.matchAll(le)) {
		let r = v(e.masked, n.index + n[0].length - 1, e.groupEnds);
		r && t.sections.push({
			level: n[1],
			title: r,
			location: k(e, n.index)
		});
	}
}
function M(e, t, n, r, i) {
	let a = {
		name: t,
		location: k(e, n + 1)
	};
	i && (a.argCount = Number.parseInt(i, 10)), r.commands.push(a);
}
function Re(e, t) {
	for (let n of e.masked.matchAll(ue)) {
		let r = n[1];
		M(e, r, e.masked.indexOf(`\\${r}`, n.index + 1), t, n[2]);
	}
}
function ze(e, t) {
	for (let n of e.masked.matchAll(de)) {
		let r = n[1];
		M(e, r, e.masked.indexOf(`\\${r}`, n.index + 1), t);
	}
}
var Be = new RegExp(t, "g");
function Ve(e, t) {
	for (let n of e.masked.matchAll(Be)) t.commandUses.push({
		name: n[1],
		location: k(e, n.index + 1)
	});
}
function He(e, t) {
	for (let n of e.masked.matchAll(fe)) {
		let r = n[1];
		M(e, r, e.masked.indexOf(`\\${r}`, n.index + 1), t);
	}
}
function Ue(e, t) {
	for (let n of T(e, Se)) {
		let r = D(E(e, n)), i = r?.value.trim();
		r && i && t.bibItems.push({
			key: i,
			location: k(e, r.contentStart + r.value.indexOf(i))
		});
	}
}
function We(e, t) {
	for (let n of e.masked.matchAll(pe)) {
		let r = v(e.masked, n.index + n[0].length - 1, e.groupEnds);
		r && t.environments.push({
			name: r,
			location: k(e, n.index)
		});
	}
}
function Ge(e, t) {
	for (let n of T(e, Ce)) {
		let r = D(E(e, n))?.value.trim();
		r && t.environmentDefs.push({
			name: r,
			location: k(e, n.start)
		});
	}
}
function Ke(e, t) {
	for (let n of e.masked.matchAll(me)) {
		let r = e.masked.indexOf("{", n.index + n[1].length + 1);
		if (r < 0) continue;
		let i = v(e.masked, r, e.groupEnds);
		i && t.includes.push({
			path: i,
			location: k(e, n.index),
			type: n[1]
		});
	}
}
function qe(e, t) {
	for (let n of e.masked.matchAll(he)) {
		let r = e.masked.indexOf("{", n.index + n[0].length - 1);
		if (r < 0) continue;
		let i = v(e.masked, r, e.groupEnds);
		if (!i) continue;
		let a = k(e, n.index);
		for (let e of i.split(",")) {
			let r = e.trim();
			r && t.packages.push({
				name: r,
				options: n[1] ?? "",
				location: a
			});
		}
	}
}
function Je(e, t) {
	for (let n of T(e, we)) {
		let r = E(e, n), i = D(r)?.value.trim();
		if (i) {
			let a = n.name === "LoadClassWithOptions" ? "" : r.find((e) => e.delimiter === "optional")?.value ?? "";
			t.classes.push({
				name: i,
				options: a,
				location: k(e, n.start)
			});
		}
	}
}
function N(e, t, n, r, i, a) {
	let o = n.trim();
	!o || /[#{}]/.test(o) || e.push({
		name: o,
		role: i,
		location: k(t, r),
		...a ? { target: a } : {}
	});
}
function Ye(e, t) {
	for (let n of T(e, Te)) {
		let r = D(E(e, n));
		if (!r) continue;
		let i = r.contentStart;
		for (let a of n.name === "bibliography" ? r.value.split(",") : [r.value]) {
			let n = a.trim();
			n && !/[\\#{}]/.test(n) && t.bibliographies.push({
				path: n,
				location: k(e, i + a.indexOf(n))
			}), i += a.length + 1;
		}
	}
}
function Xe(e, t) {
	for (let n of e.masked.matchAll(ve)) {
		let r = n.index + n[0].length - 1, i = v(e.masked, r, e.groupEnds);
		i !== null && N(t.counters, e, i, A(r, i), n[1] === "newcounter" || n[1] === "providecounter" || n[1] === "newaliascnt" ? "definition" : "usage");
	}
}
function Ze(e, t) {
	for (let n of e.masked.matchAll(be)) {
		let r = n[2] ?? n[3];
		r && N(t.lengths, e, r, n.index + n[0].indexOf(r), "definition");
	}
	for (let n of e.masked.matchAll(ye)) {
		let r = n[2];
		r && N(t.lengths, e, r, n.index + n[0].indexOf(r), "usage");
	}
}
function P(e, t, n, r) {
	for (let i of T(e, t)) {
		let t = D(E(e, i));
		t && N(n, e, t.value, O(t), r);
	}
}
function Qe(e, t) {
	P(e, Ee, t.glossaryEntries, "definition"), P(e, De, t.glossaryEntries, "usage"), P(e, Oe, t.acronymEntries, "definition"), P(e, ke, t.acronymEntries, "usage");
}
function $e(e, t) {
	if (e[t] !== "\\") return null;
	let n = t + 1;
	for (; C(e[n]);) n++;
	return n === t + 1 ? null : {
		value: e.slice(t, n),
		start: t,
		end: n
	};
}
function et(e, t) {
	let n = e.masked[t.end] === "*" ? t.end + 1 : t.end, r = J(e.masked, n);
	if (e.masked[r] !== "{") return $e(e.masked, r);
	let i = e.groupEnds.get(r);
	if (i === void 0) return null;
	let a = e.masked.slice(r + 1, i).trim();
	return a ? {
		value: a,
		end: i + 1
	} : null;
}
function tt(e, t) {
	for (let n of T(e, je)) {
		let r = et(e, n);
		if (!r) continue;
		let i = D(F(e.masked, r.end, e.groupEnds));
		i && N(t.fontFamilies, e, i.value, O(i), "alias", r.value);
	}
}
function nt(e, t) {
	for (let n of T(e, S)) {
		let r = E(e, n).filter((e) => e.delimiter === "required")[1];
		r && N(t.fontFamilies, e, r.value, O(r), "definition");
	}
}
function rt(e, t) {
	P(e, Ae, t.fontFamilies, "usage"), tt(e, t), nt(e, t);
}
function it(e, t, n) {
	let r = e[t];
	if (r !== "{" && r !== "[") return null;
	let i = n.get(t);
	return i === void 0 ? null : {
		delimiter: r === "{" ? "required" : "optional",
		value: e.slice(t + 1, i),
		contentStart: t + 1,
		end: i + 1
	};
}
function at(e, t) {
	let n = e[t];
	if (n !== "{" && n !== "[") return null;
	let r = n === "{" ? "}" : "]", i = 1;
	for (let a = t + 1; a < e.length; a++) {
		if (e[a] === "\\") {
			a++;
			continue;
		}
		if (e[a] === n) i++;
		else if (e[a] === r && --i === 0) return {
			delimiter: n === "{" ? "required" : "optional",
			value: e.slice(t + 1, a),
			contentStart: t + 1,
			end: a + 1
		};
	}
	return null;
}
function ot(e, t, n) {
	return n ? it(e, t, n) : at(e, t);
}
function F(e, t, n) {
	let r = [], i = t;
	for (; r.length < 6;) {
		i = J(e, i);
		let t = ot(e, i, n);
		if (!t) break;
		r.push(t), i = t.end;
	}
	return r;
}
function st(e) {
	let t = [], n = 0, r = 0;
	for (let i = 0; i < e.length; i++) e[i] === "\\" ? i++ : e[i] === "{" ? n++ : e[i] === "}" ? n = Math.max(0, n - 1) : e[i] === ";" && n === 0 && (t.push(e.slice(r, i)), r = i + 1);
	return t.push(e.slice(r)), t;
}
function I(e, t = ",") {
	let n = [], r = [], i = 0;
	for (let a = 0; a < e.length; a++) {
		let o = e[a];
		o === "\\" ? a++ : o === "{" ? r.push("}") : o === "[" ? r.push("]") : o === r[r.length - 1] ? r.pop() : r.length === 0 && o === t && (n.push(e.slice(i, a)), i = a + 1);
	}
	return n.push(e.slice(i)), n;
}
function L(e, t, n, r, i) {
	let a = n.trim();
	!a || /[\\#{}]/.test(a) || e.colors.push({
		name: a,
		location: k(t, r),
		...i
	});
}
function ct(e, t, n, r) {
	let i = n.filter((e) => e.delimiter === "required");
	if (i.length < 4) return;
	let a = i[0].value.split("/"), o = i[1].value, s = i[2].value;
	for (let n of st(i[3].value)) {
		let c = n.indexOf(",");
		if (c < 0) continue;
		let l = n.slice(c + 1).trim().split("/"), u = a[0]?.trim(), d = l[0]?.trim();
		L(t, e, `${o}${n.slice(0, c).trim()}${s}`, i[3].contentStart, {
			kind: r,
			...u ? { model: u } : {},
			...d ? { value: d } : {}
		});
	}
}
function lt(e, t, n) {
	n.length < 4 || L(t, e, n[1].value, n[1].contentStart, {
		kind: "define",
		model: n[2].value.trim(),
		value: n[3].value.trim()
	});
}
function ut(e, t, n) {
	n.length < 2 || L(t, e, n[0].value, n[0].contentStart, {
		kind: "alias",
		alias: n[1].value.trim()
	});
}
function dt(e, t, n, r) {
	r.length < 3 || L(t, e, r[0].value, r[0].contentStart, {
		kind: n === "providecolor" ? "provide" : "define",
		model: r[1].value.trim(),
		value: r[2].value.trim()
	});
}
function ft(e, t) {
	for (let n of e.masked.matchAll(ge)) {
		let r = n[1], i = F(e.masked, n.index + n[0].length, e.groupEnds), a = i.filter((e) => e.delimiter === "required");
		r.endsWith("colorset") ? ct(e, t, i, r === "providecolorset" ? "provide" : "define") : r === "DefineNamedColor" ? lt(e, t, a) : r === "colorlet" ? ut(e, t, a) : dt(e, t, r, a);
	}
}
function pt(e, t) {
	for (let n of e.masked.matchAll(_e)) {
		let r = n.index + n[0].length - 1, i = v(e.masked, r, e.groupEnds);
		if (i === null) continue;
		let a = i.split(",").map((e) => e.trim()).filter((e) => e.length > 0 && !/[\\#{}]/.test(e));
		a.length > 0 && t.colorActivations.push({
			names: a,
			kind: n[1] === "providecolors" ? "provide" : "define",
			location: k(e, n.index)
		});
	}
}
function R(e) {
	let t = e.trim(), n = 0, r = t.length;
	for (; t[n] === "/";) n++;
	for (; r > n && t[r - 1] === "/";) r--;
	return t.slice(n, r);
}
function z(e) {
	return R(e) || "document";
}
function B(e, t, n, r, i, a, o) {
	let s = R(r);
	!s || /[\\#{}]/.test(s) || e.keys.push({
		family: z(n),
		name: s,
		valueType: i,
		location: k(t, a),
		...o?.length ? { values: [...new Set(o)] } : {}
	});
}
function mt(e, t) {
	for (let n of T(e, Me)) {
		let r = E(e, n).filter((e) => e.delimiter === "required");
		if (r.length < 2) continue;
		let i = r[0].value, a = r[1].value, o = n.name.includes("choice") ? "enum" : n.name === "defineboolkey" ? "boolean" : "free-text", s = o === "enum" ? r.slice(2).map((e) => I(e.value).map((e) => e.trim()).filter(Boolean)).find((e) => e.length > 0) : void 0;
		B(t, e, i, a, o, r[1].contentStart, s);
	}
}
function V(e) {
	return /choice|choices/.test(e) ? "enum" : /bool/.test(e) ? "boolean" : /(?:int|fp)_set/.test(e) ? "number" : /dim_set/.test(e) ? "dimension" : /code|meta|store|tl_set|initial/.test(e) ? "free-text" : "flag";
}
function ht(e) {
	let t = e.indexOf("="), n = e.slice(0, t < 0 ? e.length : t).trim().match(/^(.+?)\s+\.([A-Za-z0-9_:]+)\s*$/);
	return n ? {
		name: n[1].trim(),
		property: n[2]
	} : null;
}
function gt(e, t, n, r, i) {
	let a = ht(n);
	if (!a) return;
	e.push({
		family: r,
		name: a.name,
		type: V(a.property),
		offset: i
	});
	let o = a.name.lastIndexOf("/");
	if (o <= 0) return;
	let s = a.name.slice(0, o).trim(), c = t.get(s) ?? [];
	c.push(a.name.slice(o + 1).trim()), t.set(s, c);
}
function H(e, t, n, r) {
	for (let i of n) B(t, e, i.family, i.name, i.type, i.offset, i.type === "enum" ? r.get(`${i.family}\u0000${i.name}`) ?? r.get(i.name) : void 0);
}
function _t(e, t) {
	for (let n of T(e, Ne)) {
		let r = E(e, n), i = D(r);
		if (!i) continue;
		let a = z(r.find((e) => e.delimiter === "optional")?.value ?? "document"), o = [], s = /* @__PURE__ */ new Map(), c = 0;
		for (let e of I(i.value)) gt(o, s, e, a, i.contentStart + c), c += e.length + 1;
		H(e, t, o, s);
	}
}
function U(e, t) {
	return `${z(e)}\u0000${t}`;
}
function vt(e, t, n) {
	let r = t.lastIndexOf("/");
	if (r < 0) return !1;
	let i = U(t.slice(0, r), t.slice(r + 1));
	if (!e.enumKeys.has(i)) return !1;
	let a = e.choices.get(i) ?? [];
	return a.push(n), e.choices.set(i, a), !0;
}
function yt(e, t, n) {
	let r = t.indexOf("="), i = t.slice(0, r < 0 ? t.length : r).trim(), a = i.lastIndexOf("/.");
	if (a < 0) return;
	let o = i.slice(0, a), s = o.startsWith("/"), c = R(o), l = i.slice(a + 2);
	if (l === "cd" || l === "is family") {
		e.family = z(c);
		return;
	}
	let u = c.lastIndexOf("/"), d = u < 0 ? "" : z(c.slice(0, u)), f = u < 0 ? e.family : z(s ? d : `${e.family}/${d}`), p = u < 0 ? c : c.slice(u + 1);
	p && (/is choice/.test(l) ? (e.enumKeys.add(U(f, p)), e.declarations.push({
		family: f,
		name: p,
		type: "enum",
		offset: n
	})) : vt(e, f, p) || e.declarations.push({
		family: f,
		name: p,
		type: V(l),
		offset: n
	}));
}
function bt(e, t) {
	for (let n of e.masked.matchAll(xe)) {
		let r = n.index + n[0].length - 1, i = v(e.masked, r, e.groupEnds);
		if (i === null) continue;
		let a = {
			family: "pgfkeys",
			declarations: [],
			choices: /* @__PURE__ */ new Map(),
			enumKeys: /* @__PURE__ */ new Set()
		}, o = 0;
		for (let e of I(i)) yt(a, e.trim(), r + 1 + o), o += e.length + 1;
		H(e, t, a.declarations, a.choices);
	}
}
function xt(e, t) {
	mt(e, t), _t(e, t), bt(e, t);
}
var W = RegExp(`\\\\(?:${r})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?(?:\\[([^\\]]*)\\])?\\s*\\{`, "g"), G = /\\def\\(\w+)((?:#\d)*)\s*\{/g;
function K(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.matchAll(W)) {
		let r = v(e, n.index + n[0].length - 1);
		r !== null && t.set(n[1], {
			argCount: n[2] ? Number.parseInt(n[2], 10) : 0,
			body: r,
			optional: n[3]
		});
	}
	for (let n of e.matchAll(G)) {
		let r = v(e, n.index + n[0].length - 1);
		r !== null && t.set(n[1], {
			argCount: (n[2].match(/#/g) || []).length,
			body: r
		});
	}
	return t;
}
var St = RegExp(`\\\\(?:label|${i}|${e})\\b`);
function q(e) {
	let t = /* @__PURE__ */ new Set(), n = !0;
	for (; n;) {
		n = !1;
		for (let [r, i] of e) t.has(r) || (St.test(i.body) || Ct(i.body, e, t)) && (t.add(r), n = !0);
	}
	return t;
}
function Ct(e, t, n) {
	for (let r of e.matchAll(/\\(\w+)/g)) if (n.has(r[1]) && t.has(r[1])) return !0;
	return !1;
}
var J = (e, t) => {
	for (; t < e.length && /\s/.test(e[t]);) t++;
	return t;
};
function Y(e, t, n) {
	let r = J(e, t), i = e[r] === "[" ? e.indexOf("]", r) : -1;
	return i === -1 ? {
		value: n,
		end: t
	} : {
		value: e.slice(r + 1, i),
		end: i + 1
	};
}
function X(e, t, n, r) {
	let i = [], a = t;
	if (r !== void 0 && n > 0) {
		let t = Y(e, a, r);
		i.push(t.value), a = t.end;
	}
	for (; i.length < n && (a = J(e, a), e[a] === "{");) {
		let t = v(e, a);
		if (t === null) break;
		i.push(t), a += t.length + 2;
	}
	return {
		args: i,
		end: a
	};
}
var wt = 4;
function Z(e, t, n, r, i) {
	let a = n.get(e);
	return !a || r > wt || i.has(e) ? "" : Tt(a.body.replace(/#(\d)/g, (e, n) => t[Number(n) - 1] ?? ""), n, r, /* @__PURE__ */ new Set([...i, e]));
}
function Tt(e, t, n, r) {
	let i = 0, a = "";
	for (let o of e.matchAll(/\\(\w+)/g)) {
		let s = o[1], c = t.get(s);
		if (!c) continue;
		let { args: l } = X(e, o.index + o[0].length, c.argCount, c.optional), u = Z(s, l, t, n + 1, new Set(r));
		a += e.slice(i, o.index), a += u || e.slice(o.index, o.index + o[0].length), i = X(e, o.index + o[0].length, c.argCount, c.optional).end;
	}
	return a + e.slice(i);
}
var Et = RegExp(`(?:\\\\(?:${r}|DeclareMathOperator)\\*?\\{|\\\\def)$`);
function Q(e, t) {
	return Et.test(e.slice(Math.max(0, t - 24), t));
}
function Dt(e) {
	let t = K(e);
	if (t.size === 0) return [];
	let n = q(t);
	if (n.size === 0) return [];
	let r = /* @__PURE__ */ new Set();
	for (let t of e.matchAll(/\\(\w+)/g)) {
		let i = t[1];
		n.has(i) && !Q(e, t.index) && r.add(i);
	}
	if (r.size === 0) return [];
	let i = [], a = (t) => {
		for (let n of e.matchAll(t)) {
			if (!r.has(n[1])) continue;
			let t = n.index + n[0].length - 1, a = v(e, t);
			a !== null && i.push([t + 1, t + 1 + a.length]);
		}
	};
	return a(W), a(G), i;
}
function Ot(e, t) {
	let n = K(e.masked);
	if (n.size === 0) return;
	let r = q(n);
	if (r.size !== 0) for (let i of e.masked.matchAll(/\\(\w+)/g)) {
		let a = i[1];
		if (!r.has(a) || Q(e.masked, i.index)) continue;
		let o = n.get(a), { args: s } = X(e.masked, i.index + i[0].length, o.argCount, o.optional), c = Z(a, s, n, 0, /* @__PURE__ */ new Set());
		c && At(c, k(e, i.index), t);
	}
}
function kt(e) {
	let t = K(e);
	if (t.size === 0) return [];
	let n = [];
	for (let r of e.matchAll(/\\(\w+)/g)) {
		let i = r[1], a = t.get(i);
		if (!a || Q(e, r.index)) continue;
		let o = X(e, r.index + r[0].length, a.argCount, a.optional);
		if (o.args.length !== a.argCount) continue;
		let s = Z(i, o.args, t, 0, /* @__PURE__ */ new Set());
		s && n.push({
			name: i,
			inputStart: r.index,
			inputEnd: o.end,
			surface: s
		});
	}
	return n;
}
function $(e) {
	let t = e?.trim();
	return t && !t.includes("#") ? t : null;
}
function At(e, t, n) {
	for (let r of e.matchAll(y)) {
		let i = $(v(e, r.index + r[0].length - 1));
		i && n.labels.push({
			name: i,
			location: t
		});
	}
	for (let r of e.matchAll(b)) {
		let i = $(v(e, r.index + r[0].length - 1));
		i && n.labelRefs.push({
			name: i,
			location: t
		});
	}
	for (let r of e.matchAll(x)) {
		let i = v(e, r.index + r[0].length - 1);
		for (let e of i?.split(",") ?? []) {
			let r = $(e);
			r && n.citations.push({
				key: r,
				location: t
			});
		}
	}
}
function jt(e, t, n = c(e)) {
	let r = {
		labels: [],
		labelRefs: [],
		citations: [],
		sections: [],
		commands: [],
		commandUses: [],
		environments: [],
		environmentDefs: [],
		includes: [],
		classes: [],
		packages: [],
		colors: [],
		colorActivations: [],
		counters: [],
		lengths: [],
		glossaryEntries: [],
		acronymEntries: [],
		fontFamilies: [],
		keys: [],
		bibliographies: [],
		bibItems: []
	}, i = ce(e, [...n]), a = {
		masked: i,
		lineStarts: l(i),
		file: t,
		groupEnds: _(i),
		commandOccurrences: w(i)
	}, o = g(i, Dt(i)), s = {
		...a,
		masked: o,
		groupEnds: _(o),
		commandOccurrences: w(o)
	};
	return Pe(s, r), Fe(s, r), Ie(s, r), Le(a, r), Re(a, r), ze(a, r), He(a, r), Ve(a, r), Ue(a, r), We(a, r), Ge(a, r), Ke(a, r), Je(a, r), qe(a, r), ft(a, r), pt(a, r), Xe(a, r), Ze(a, r), Qe(a, r), rt(a, r), xt(a, r), Ye(a, r), Ot(a, r), r;
}
//#endregion
export { kt as expandUserMacroCalls, oe as maskSpans, se as maskSpansFromTokens, jt as parseLatexFile };
