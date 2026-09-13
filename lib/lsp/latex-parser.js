import { readBalancedGroup as e } from "./balanced-group.js";
import { CITE_CMDS as t, COMMAND_TOKEN as n, INPUT_CMDS as r, NEWCMD_CMDS as i, REF_CMDS as a, SECTION_CMDS as o, USEPACKAGE_CMDS as s } from "./latex-patterns.js";
import { VERBATIM_ENVIRONMENTS as c, tokenize as l } from "./latex-tokenizer.js";
import { buildLineStarts as u, offsetToLineCol as d } from "./source-position.js";
//#region src/lsp/latex-parser.ts
var f = /* @__PURE__ */ new Set([
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
]), p = /* @__PURE__ */ new Set(/* @__PURE__ */ "ifthenelse.ifoddpage.ifdef.ifcsdef.ifundef.ifcsundef.ifdefmacro.ifdefparam.ifdefempty.ifcsempty.ifdefvoid.ifdefstring.ifcsstring.ifdefstrequal.ifdefcounter.ifcscounter.ifdefdimen.ifcsdimen.ifboolexpr.ifblank.ifstrequal.ifstrempty.ifnumcomp.ifnumequal.ifnumgreater.ifnumless.ifdimcomp.ifdimequal.ifdimgreater.ifdimless.ifbool.iftoggle.ifnumodd.ifnumparity".split("."));
function ee(e) {
	return e.length > 2 && e.startsWith("if") && e !== "iff" && !p.has(e);
}
function te(e, t = []) {
	let n = [], r = [], i = (e) => t.some(([t, n]) => e >= t && e < n);
	for (let t of e) t.type === "command" && !i(t.start) && ne(t, r, n);
	return n;
}
function ne(e, t, n) {
	let r = e.value;
	r === "iffalse" ? t.push({
		kind: "false",
		falseStart: e.end,
		elseSeen: !1
	}) : r === "iftrue" ? t.push({
		kind: "true",
		falseStart: -1,
		elseSeen: !1
	}) : r === "if" || f.has(r) || ee(r) ? t.push({
		kind: "other",
		falseStart: -1,
		elseSeen: !1
	}) : r === "else" ? re(t[t.length - 1], e, n) : r === "fi" && ie(t.pop(), e, n);
}
function re(e, t, n) {
	!e || e.elseSeen || (e.elseSeen = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function ie(e, t, n) {
	e && (e.kind === "false" && !e.elseSeen || e.kind === "true" && e.elseSeen) && n.push([e.falseStart, t.start]);
}
function ae(e) {
	let t = [];
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		if (r.type !== "command" || r.value !== "begin") continue;
		let i = m(e, n);
		if (!i || !c.has(i.name)) continue;
		let a = oe(e, i.closeIndex + 1, i.name), o = a?.start ?? e[e.length - 1].end;
		o > i.closeEnd && t.push([i.closeEnd, o]), a && (n = a.index);
	}
	return t;
}
function oe(e, t, n) {
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
function se(e) {
	return h(l(e));
}
function ce(e) {
	return h(e);
}
function h(e) {
	let t = [];
	for (let n of e) (n.type === "comment" || n.type === "verb") && t.push([n.start, n.end]);
	let n = ae(e);
	return t.push(...n), t.push(...te(e, n)), t;
}
function le(e, t) {
	return ue(e, h(t));
}
function ue(e, t) {
	if (t.length === 0) return e;
	let n = t.length > 1 ? [...t].sort((e, t) => e[0] - t[0]) : t, r = [], i = 0;
	for (let [t, a] of n) {
		let n = t > i ? t : i, o = a < e.length ? a : e.length;
		o <= n || (n > i && r.push(e.slice(i, n)), r.push(e.slice(n, o).replace(/[^\n]/g, " ")), i = o);
	}
	return i < e.length && r.push(e.slice(i)), r.join("");
}
function g(e) {
	let t = /* @__PURE__ */ new Map(), n = [], r = /* @__PURE__ */ new Map();
	for (let i = 0; i < e.length; i++) {
		let a = e.charAt(i);
		if (a === "\\") {
			i++;
			continue;
		}
		if (a === "{") n.push(i);
		else if (a === "}") r.delete(n.length), fe(t, n.pop(), i);
		else if (a === "[") {
			let e = r.get(n.length) ?? [];
			e.push(i), r.set(n.length, e);
		} else a === "]" && (de(t, r.get(n.length), i), r.delete(n.length));
	}
	return t;
}
function de(e, t, n) {
	for (let r of t ?? []) e.set(r, n);
}
function fe(e, t, n) {
	t !== void 0 && e.set(t, n);
}
function _(e, t, n) {
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
var v = /\\label\{/g, y = RegExp(`\\\\(?:${a})\\{`, "g"), b = RegExp(`\\\\(?:${t})(?:\\[[^\\]]*\\])*\\{`, "g"), pe = RegExp(`\\\\(${o})\\*?(?:\\[[^\\]]*\\])?\\{`, "g"), x = new RegExp(String.raw`\\(${i}|(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand)\*?\s*(?:\{\s*${n}\s*\}|${n})\s*(?:\[(\d+)\])?`, "g"), me = new RegExp(String.raw`\\(?:def|gdef|edef|xdef|let|futurelet)\s*${n}`, "g"), he = /\\DeclareMathOperator\*?\{\\(\w+)\}/g, ge = /\\begin\{/g, _e = RegExp(`\\\\(${r})\\{`, "g"), ve = RegExp(`\\\\(?:${s})(?:\\[([^\\]]*)\\])?\\{`, "g"), ye = /\\(definecolorset|providecolorset|preparecolorset|DefineNamedColor|definecolor|xdefinecolor|providecolor|colorlet)\*?(?![A-Za-z@:_])/g, be = /\\(definecolors|providecolors)(?!et)\*?\s*\{/g, xe = /\\(newcounter|providecounter|newaliascnt|setcounter|addtocounter|stepcounter|refstepcounter|value|counterwithin|counterwithout)\*?\s*\{/g, Se = /\\(setlength|addtolength|settowidth|settoheight|settodepth)\*?\s*\{\s*(\\[A-Za-z@]+)\s*\}/g, Ce = /\\(newlength|newdimen|newskip)\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))/g, we = /\\pgfkeys\s*\{/g, Te = /* @__PURE__ */ new Set(["bibitem"]), Ee = /* @__PURE__ */ new Set([
	"newenvironment",
	"renewenvironment",
	"NewDocumentEnvironment",
	"RenewDocumentEnvironment",
	"ProvideDocumentEnvironment",
	"DeclareDocumentEnvironment",
	"newtheorem"
]), De = /* @__PURE__ */ new Set([
	"documentclass",
	"LoadClass",
	"LoadClassWithOptions"
]), Oe = /* @__PURE__ */ new Set([
	"bibliography",
	"addbibresource",
	"addglobalbib",
	"addsectionbib"
]), ke = /* @__PURE__ */ new Set(["longnewglossaryentry", "newglossaryentry"]), Ae = /* @__PURE__ */ new Set([
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
]), je = /* @__PURE__ */ new Set(["newacronym"]), Me = /* @__PURE__ */ new Set([
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
]), Ne = /* @__PURE__ */ new Set([
	"setmainfont",
	"setsansfont",
	"setmonofont",
	"fontspec"
]), Pe = /* @__PURE__ */ new Set(["newfontfamily", "newfontface"]), Fe = /* @__PURE__ */ new Set(["DeclareFontFamily"]), Ie = /* @__PURE__ */ new Set([
	"definekey",
	"define@key",
	"defineboolkey",
	"definechoicekey",
	"define@choicekey"
]), Le = /* @__PURE__ */ new Set(["DeclareKeys"]);
function S(e) {
	if (!e) return !1;
	let t = e.charCodeAt(0);
	return t >= 65 && t <= 90 || t >= 97 && t <= 122 || e === "@" || e === ":" || e === "_";
}
function C(e) {
	let t = [], n = 0;
	for (; n < e.length;) {
		let r = e.indexOf("\\", n);
		if (r < 0) break;
		let i = r + 1;
		for (; S(e[i]);) i++;
		i > r + 1 && t.push({
			name: e.slice(r + 1, i),
			start: r,
			end: i
		}), n = Math.max(r + 2, i);
	}
	return t;
}
function* w(e, t) {
	for (let n of e.commandOccurrences) t.has(n.name) && (yield n);
}
function T(e, t) {
	let n = e.masked[t.end] === "*" ? t.end + 1 : t.end;
	return F(e.masked, n, e.groupEnds);
}
function E(e) {
	return e.find((e) => e.delimiter === "required");
}
function D(e) {
	return e.contentStart + (e.value.length - e.value.trimStart().length);
}
function O(e, t) {
	let { line: n, column: r } = d(e.lineStarts, t);
	return {
		file: e.file,
		line: n,
		column: r
	};
}
function k(e, t) {
	let n = t.trimStart();
	return e + 1 + (t.length - n.length);
}
function A(e, t, n, r) {
	for (let i of e.masked.matchAll(t)) {
		let t = i.index + i[0].length - 1, a = _(e.masked, t, e.groupEnds);
		if (!a) continue;
		let o = a.trim();
		!o || n && o.includes("#") || r(o, O(e, k(t, a)));
	}
}
function Re(e, t) {
	A(e, v, !0, (e, n) => t.labels.push({
		name: e,
		location: n
	}));
}
function ze(e, t) {
	let n = K(e.masked), r = new Map(t.labels.map((e) => [`${e.location.line}:${e.location.column}`, e])), i = /* @__PURE__ */ new Set([...o.split("|"), "caption"]);
	for (let t of w(e, i)) {
		if (n.some(([e, n]) => e <= t.start && t.start < n)) continue;
		let i = E(T(e, t));
		if (!i || !i.value.trim() || i.value.includes("#")) continue;
		let a = Y(e.masked, i.end);
		if (!e.masked.startsWith("\\label{", a)) continue;
		let o = _(e.masked, a + 6, e.groupEnds);
		if (!o) continue;
		let s = O(e, k(a + 6, o)), c = r.get(`${s.line}:${s.column}`);
		c && (c.context = {
			kind: t.name,
			title: i.value.trim().replace(/\s+/g, " ").slice(0, 256),
			source: e.masked.slice(t.start, i.end).slice(0, 1024)
		});
	}
}
function Be(e, t) {
	A(e, y, !0, (e, n) => t.labelRefs.push({
		name: e,
		location: n
	}));
}
function Ve(e, t) {
	for (let n of e.masked.matchAll(b)) {
		let r = n.index + n[0].length - 1, i = _(e.masked, r, e.groupEnds);
		if (!i) continue;
		let a = r + 1;
		for (let n of i.split(",")) {
			let r = n.trim();
			r && !r.includes("#") && t.citations.push({
				key: r,
				location: O(e, a + n.indexOf(r))
			}), a += n.length + 1;
		}
	}
}
function He(e, t) {
	let n = K(e.masked);
	for (let r of e.masked.matchAll(pe)) {
		if (n.some(([e, t]) => e <= r.index && r.index < t)) continue;
		let i = _(e.masked, r.index + r[0].length - 1, e.groupEnds);
		i && t.sections.push({
			level: r[1],
			title: i,
			location: O(e, r.index)
		});
	}
}
function j(e, t, n, r, i, a = !1) {
	let o = {
		name: t,
		location: O(e, n + 1)
	};
	return i && (o.argCount = Number.parseInt(i, 10)), a && (o.mayRedefine = !0), r.commands.push(o), o;
}
function Ue(e, t) {
	for (let n of e.masked.matchAll(x)) {
		let r = n[2] ?? n[3], i = j(e, r, e.masked.indexOf(`\\${r}`, n.index + 1), t, n[4], n[1] !== "newcommand" && n[1] !== "NewDocumentCommand" && n[1] !== "NewExpandableDocumentCommand"), a = Ke(e, n);
		a && (i.arguments = a.arguments, a.acceptsStar && (i.acceptsStar = !0));
	}
}
function We(e) {
	let t = [];
	e = e.trimStart();
	let n = e.startsWith("s");
	n && (e = e.slice(1));
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		if (!/\s/.test(i)) {
			if (!"moO".includes(i) || t.length + Number(n) === 9) return;
			if (t.push(Ge(i, t.length + 1 + Number(n))), i === "O") {
				let t = P(e, Y(e, r + 1));
				if (t?.delimiter !== "required") return;
				r = t.end - 1;
			}
		}
	}
	return {
		arguments: t,
		acceptsStar: n
	};
}
function Ge(e, t) {
	return {
		kind: e === "m" ? "required" : "optional",
		...e === "m" ? {} : { balancedOptional: !0 },
		placeholder: `arg${t}`,
		valueKind: "free-text"
	};
}
function Ke(e, t) {
	let n = F(e.masked, t.index + t[0].length, e.groupEnds);
	if (t[1].endsWith("DocumentCommand")) return n[0]?.delimiter !== "required" || n[1]?.delimiter !== "required" ? void 0 : We(n[0].value);
	let r = t[4] === void 0 ? 0 : Number(t[4]);
	if (!Number.isInteger(r) || r > 9) return;
	let i = n[0]?.delimiter === "optional";
	if (!(i && r === 0) && n[+!!i]?.delimiter === "required") return { arguments: Array.from({ length: r }, (e, t) => ({
		kind: i && t === 0 ? "optional" : "required",
		placeholder: `arg${t + 1}`,
		valueKind: "free-text"
	})) };
}
function qe(e, t) {
	for (let n of e.masked.matchAll(me)) {
		let r = n[1];
		j(e, r, e.masked.indexOf(`\\${r}`, n.index + 1), t, void 0, !0);
	}
}
var Je = new RegExp(n, "g");
function Ye(e, t) {
	for (let n of e.masked.matchAll(Je)) t.commandUses.push({
		name: n[1],
		location: O(e, n.index + 1)
	});
}
function Xe(e, t) {
	for (let n of e.masked.matchAll(he)) {
		let r = n[1];
		j(e, r, e.masked.indexOf(`\\${r}`, n.index + 1), t);
	}
}
function Ze(e, t) {
	for (let n of w(e, Te)) {
		let r = E(T(e, n)), i = r?.value.trim();
		r && i && t.bibItems.push({
			key: i,
			location: O(e, r.contentStart + r.value.indexOf(i))
		});
	}
}
function Qe(e, t) {
	for (let n of e.masked.matchAll(ge)) {
		let r = _(e.masked, n.index + n[0].length - 1, e.groupEnds);
		r && t.environments.push({
			name: r,
			location: O(e, n.index)
		});
	}
}
function $e(e, t) {
	for (let n of w(e, Ee)) {
		let r = E(T(e, n))?.value.trim();
		r && t.environmentDefs.push({
			name: r,
			location: O(e, n.start)
		});
	}
}
function et(e, t) {
	for (let n of e.masked.matchAll(_e)) {
		let r = e.masked.indexOf("{", n.index + n[1].length + 1);
		if (r < 0) continue;
		let i = _(e.masked, r, e.groupEnds);
		i && t.includes.push({
			path: i,
			location: O(e, n.index),
			type: n[1]
		});
	}
}
function tt(e, t) {
	for (let n of e.masked.matchAll(ve)) {
		let r = e.masked.indexOf("{", n.index + n[0].length - 1);
		if (r < 0) continue;
		let i = _(e.masked, r, e.groupEnds);
		if (!i) continue;
		let a = O(e, n.index);
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
function nt(e, t) {
	for (let n of w(e, De)) {
		let r = T(e, n), i = E(r)?.value.trim();
		if (i) {
			let a = n.name === "LoadClassWithOptions" ? "" : r.find((e) => e.delimiter === "optional")?.value ?? "";
			t.classes.push({
				name: i,
				options: a,
				location: O(e, n.start)
			});
		}
	}
}
function M(e, t, n, r, i, a) {
	let o = n.trim();
	!o || /[#{}]/.test(o) || e.push({
		name: o,
		role: i,
		location: O(t, r),
		...a ? { target: a } : {}
	});
}
function rt(e, t) {
	for (let n of w(e, Oe)) {
		let r = E(T(e, n));
		if (!r) continue;
		let i = r.contentStart;
		for (let a of n.name === "bibliography" ? r.value.split(",") : [r.value]) {
			let n = a.trim();
			n && !/[\\#{}]/.test(n) && t.bibliographies.push({
				path: n,
				location: O(e, i + a.indexOf(n))
			}), i += a.length + 1;
		}
	}
}
function it(e, t) {
	for (let n of e.masked.matchAll(xe)) {
		let r = n.index + n[0].length - 1, i = _(e.masked, r, e.groupEnds);
		i !== null && M(t.counters, e, i, k(r, i), n[1] === "newcounter" || n[1] === "providecounter" || n[1] === "newaliascnt" ? "definition" : "usage");
	}
}
function at(e, t) {
	for (let n of e.masked.matchAll(Ce)) {
		let r = n[2] ?? n[3];
		r && M(t.lengths, e, r, n.index + n[0].indexOf(r), "definition");
	}
	for (let n of e.masked.matchAll(Se)) {
		let r = n[2];
		r && M(t.lengths, e, r, n.index + n[0].indexOf(r), "usage");
	}
}
function N(e, t, n, r) {
	for (let i of w(e, t)) {
		let t = E(T(e, i));
		t && M(n, e, t.value, D(t), r);
	}
}
function ot(e, t) {
	N(e, ke, t.glossaryEntries, "definition"), N(e, Ae, t.glossaryEntries, "usage"), N(e, je, t.acronymEntries, "definition"), N(e, Me, t.acronymEntries, "usage");
}
function st(e, t) {
	if (e[t] !== "\\") return null;
	let n = t + 1;
	for (; S(e[n]);) n++;
	return n === t + 1 ? null : {
		value: e.slice(t, n),
		start: t,
		end: n
	};
}
function ct(e, t) {
	let n = e.masked[t.end] === "*" ? t.end + 1 : t.end, r = Y(e.masked, n);
	if (e.masked[r] !== "{") return st(e.masked, r);
	let i = e.groupEnds.get(r);
	if (i === void 0) return null;
	let a = e.masked.slice(r + 1, i).trim();
	return a ? {
		value: a,
		end: i + 1
	} : null;
}
function lt(e, t) {
	for (let n of w(e, Pe)) {
		let r = ct(e, n);
		if (!r) continue;
		let i = E(F(e.masked, r.end, e.groupEnds));
		i && M(t.fontFamilies, e, i.value, D(i), "alias", r.value);
	}
}
function ut(e, t) {
	for (let n of w(e, Fe)) {
		let r = T(e, n).filter((e) => e.delimiter === "required")[1];
		r && M(t.fontFamilies, e, r.value, D(r), "definition");
	}
}
function dt(e, t) {
	N(e, Ne, t.fontFamilies, "usage"), lt(e, t), ut(e, t);
}
function ft(e, t, n) {
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
function pt(t, n) {
	let r = t[n];
	if (r !== "{" && r !== "[") return null;
	let i = e(t, n);
	return i.closed ? {
		delimiter: r === "{" ? "required" : "optional",
		value: t.slice(n + 1, i.contentEnd),
		contentStart: n + 1,
		end: i.end
	} : null;
}
function P(e, t, n) {
	return n ? ft(e, t, n) : pt(e, t);
}
function F(e, t, n) {
	let r = [], i = t;
	for (; r.length < 6;) {
		i = Y(e, i);
		let t = P(e, i, n);
		if (!t) break;
		r.push(t), i = t.end;
	}
	return r;
}
function mt(e) {
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
		location: O(t, r),
		...i
	});
}
function ht(e, t, n, r) {
	let i = n.filter((e) => e.delimiter === "required");
	if (i.length < 4) return;
	let a = i[0].value.split("/"), o = i[1].value, s = i[2].value;
	for (let n of mt(i[3].value)) {
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
function gt(e, t, n) {
	n.length < 4 || L(t, e, n[1].value, n[1].contentStart, {
		kind: "define",
		model: n[2].value.trim(),
		value: n[3].value.trim()
	});
}
function _t(e, t, n) {
	n.length < 2 || L(t, e, n[0].value, n[0].contentStart, {
		kind: "alias",
		alias: n[1].value.trim()
	});
}
function vt(e, t, n, r) {
	r.length < 3 || L(t, e, r[0].value, r[0].contentStart, {
		kind: n === "providecolor" ? "provide" : "define",
		model: r[1].value.trim(),
		value: r[2].value.trim()
	});
}
function yt(e, t) {
	for (let n of e.masked.matchAll(ye)) {
		let r = n[1], i = F(e.masked, n.index + n[0].length, e.groupEnds), a = i.filter((e) => e.delimiter === "required");
		r.endsWith("colorset") ? ht(e, t, i, r === "providecolorset" ? "provide" : "define") : r === "DefineNamedColor" ? gt(e, t, a) : r === "colorlet" ? _t(e, t, a) : vt(e, t, r, a);
	}
}
function bt(e, t) {
	for (let n of e.masked.matchAll(be)) {
		let r = n.index + n[0].length - 1, i = _(e.masked, r, e.groupEnds);
		if (i === null) continue;
		let a = i.split(",").map((e) => e.trim()).filter((e) => e.length > 0 && !/[\\#{}]/.test(e));
		a.length > 0 && t.colorActivations.push({
			names: a,
			kind: n[1] === "providecolors" ? "provide" : "define",
			location: O(e, n.index)
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
		location: O(t, a),
		...o?.length ? { values: [...new Set(o)] } : {}
	});
}
function xt(e, t) {
	for (let n of w(e, Ie)) {
		let r = T(e, n).filter((e) => e.delimiter === "required");
		if (r.length < 2) continue;
		let i = r[0].value, a = r[1].value, o = n.name.includes("choice") ? "enum" : n.name === "defineboolkey" ? "boolean" : "free-text", s = o === "enum" ? r.slice(2).map((e) => I(e.value).map((e) => e.trim()).filter(Boolean)).find((e) => e.length > 0) : void 0;
		B(t, e, i, a, o, r[1].contentStart, s);
	}
}
function V(e) {
	return /choice|choices/.test(e) ? "enum" : /bool/.test(e) ? "boolean" : /(?:int|fp)_set/.test(e) ? "number" : /dim_set/.test(e) ? "dimension" : /code|meta|store|tl_set|initial/.test(e) ? "free-text" : "flag";
}
function St(e) {
	let t = e.indexOf("="), n = e.slice(0, t < 0 ? e.length : t).trim().match(/^(.+?)\s+\.([A-Za-z0-9_:]+)\s*$/);
	return n ? {
		name: n[1].trim(),
		property: n[2]
	} : null;
}
function Ct(e, t, n, r, i) {
	let a = St(n);
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
function wt(e, t) {
	for (let n of w(e, Le)) {
		let r = T(e, n), i = E(r);
		if (!i) continue;
		let a = r.find((e) => e.delimiter === "optional")?.value ?? "document";
		if (/[\\#{}]/.test(a)) continue;
		let o = z(a), s = [], c = /* @__PURE__ */ new Map(), l = 0;
		for (let e of I(i.value)) Ct(s, c, e, o, i.contentStart + l), l += e.length + 1;
		H(e, t, s, c);
	}
}
function U(e, t) {
	return `${z(e)}\u0000${t}`;
}
function Tt(e, t, n) {
	let r = t.lastIndexOf("/");
	if (r < 0) return !1;
	let i = U(t.slice(0, r), t.slice(r + 1));
	if (!e.enumKeys.has(i)) return !1;
	let a = e.choices.get(i) ?? [];
	return a.push(n), e.choices.set(i, a), !0;
}
function Et(e, t, n) {
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
	})) : Tt(e, f, p) || e.declarations.push({
		family: f,
		name: p,
		type: V(l),
		offset: n
	}));
}
function Dt(e, t) {
	for (let n of e.masked.matchAll(we)) {
		let r = n.index + n[0].length - 1, i = _(e.masked, r, e.groupEnds);
		if (i === null) continue;
		let a = {
			family: "pgfkeys",
			declarations: [],
			choices: /* @__PURE__ */ new Map(),
			enumKeys: /* @__PURE__ */ new Set()
		}, o = 0;
		for (let e of I(i)) Et(a, e.trim(), r + 1 + o), o += e.length + 1;
		H(e, t, a.declarations, a.choices);
	}
}
function Ot(e, t) {
	xt(e, t), wt(e, t), Dt(e, t);
}
var W = RegExp(`\\\\(?:${i})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?(?:\\[([^\\]]*)\\])?\\s*\\{`, "g"), G = /\\def\\(\w+)((?:#\d)*)\s*\{/g, kt = /\\DeclareMathOperator(\*)?\{\\(\w+)\}\s*\{/g, At = new RegExp(String.raw`\\(?:${i})\*?\s*(?:\{\s*\\[\w@]+\s*\}|\\[\w@]+)\s*(?:\[\d+\]\s*)?(?:\[[^\]]*\]\s*)?\{`, "g"), jt = /\\(?:def|gdef|edef|xdef)\s*\\[\w@]+/g;
function K(e) {
	let t = g(e), n = Mt(e, t);
	for (let r of e.matchAll(x)) {
		if (!r[1].endsWith("DocumentCommand")) continue;
		let i = F(e, r.index + r[0].length, t)[1];
		n.push([r.index, i?.end ?? e.length]);
	}
	for (let r of e.matchAll(/\\(?:(?:New|Renew|Provide|Declare)DocumentEnvironment|(?:new|renew|provide)environment)(?![A-Za-z@:_])\*?\s*/g)) {
		let i = F(e, r.index + r[0].length, t).filter((e) => e.delimiter === "required")[r[0].includes("DocumentEnvironment") ? 3 : 2];
		n.push([r.index, i?.end ?? e.length]);
	}
	for (let r of e.matchAll(At)) {
		let i = r.index + r[0].length - 1, a = _(e, i, t);
		n.push([r.index, a === null ? e.length : i + a.length + 2]);
	}
	return n;
}
function Mt(e, t) {
	let n = [], r = new RegExp(jt), i = /[{}]/g;
	for (let a = r.exec(e); a; a = r.exec(e)) {
		i.lastIndex = r.lastIndex;
		let o = i.exec(e);
		if (!o) break;
		if (r.lastIndex = o.index + 1, o[0] !== "{") continue;
		let s = o.index, c = _(e, s, t), l = c === null ? e.length : s + c.length + 2;
		n.push([a.index, l]), r.lastIndex = l;
	}
	return n;
}
function Nt(e, t) {
	return K(le(e, [...t]));
}
function q(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.matchAll(W)) {
		let r = _(e, n.index + n[0].length - 1);
		r !== null && t.set(n[1], {
			argCount: n[2] ? Number.parseInt(n[2], 10) : 0,
			body: r,
			optional: n[3]
		});
	}
	for (let n of e.matchAll(G)) {
		let r = _(e, n.index + n[0].length - 1);
		r !== null && t.set(n[1], {
			argCount: (n[2].match(/#/g) || []).length,
			body: r
		});
	}
	for (let n of e.matchAll(kt)) {
		let r = _(e, n.index + n[0].length - 1);
		r !== null && t.set(n[2], {
			argCount: 0,
			body: `\\operatorname${n[1] ?? ""}{${r}}`
		});
	}
	return t;
}
var Pt = RegExp(`\\\\(?:label|${a}|${t})\\b`);
function J(e) {
	let t = /* @__PURE__ */ new Set(), n = !0;
	for (; n;) {
		n = !1;
		for (let [r, i] of e) t.has(r) || (Pt.test(i.body) || Ft(i.body, e, t)) && (t.add(r), n = !0);
	}
	return t;
}
function Ft(e, t, n) {
	for (let r of e.matchAll(/\\(\w+)/g)) if (n.has(r[1]) && t.has(r[1])) return !0;
	return !1;
}
var Y = (e, t) => {
	for (; t < e.length && /\s/.test(e[t]);) t++;
	return t;
};
function It(e, t, n) {
	let r = Y(e, t), i = e[r] === "[" ? e.indexOf("]", r) : -1;
	return i === -1 ? {
		value: n,
		end: t
	} : {
		value: e.slice(r + 1, i),
		end: i + 1,
		argument: {
			index: 0,
			kind: "optional",
			value: e.slice(r + 1, i),
			inputStart: r,
			inputEnd: i + 1
		}
	};
}
function X(e, t, n, r) {
	let i = [], a = [], o = t;
	if (r !== void 0 && n > 0) {
		let t = It(e, o, r);
		i.push(t.value), t.argument && a.push(t.argument), o = t.end;
	}
	for (; i.length < n && (o = Y(e, o), e[o] === "{");) {
		let t = o, n = _(e, o);
		if (n === null) break;
		let r = i.length;
		i.push(n), o += n.length + 2, a.push({
			index: r,
			kind: "required",
			value: n,
			inputStart: t,
			inputEnd: o
		});
	}
	return {
		args: i,
		arguments: a,
		end: o
	};
}
var Lt = 4;
function Z(e, t, n, r, i) {
	let a = n.get(e);
	return !a || r > Lt || i.has(e) ? "" : Rt(a.body.replace(/#(\d)/g, (e, n) => t[Number(n) - 1] ?? ""), n, r, /* @__PURE__ */ new Set([...i, e]));
}
function Rt(e, t, n, r) {
	let i = 0, a = "";
	for (let o of e.matchAll(/\\(\w+)/g)) {
		let s = o[1], c = t.get(s);
		if (!c) continue;
		let { args: l } = X(e, o.index + o[0].length, c.argCount, c.optional), u = Z(s, l, t, n + 1, new Set(r));
		a += e.slice(i, o.index), a += u || e.slice(o.index, o.index + o[0].length), i = X(e, o.index + o[0].length, c.argCount, c.optional).end;
	}
	return a + e.slice(i);
}
var zt = RegExp(`(?:\\\\(?:${i}|DeclareMathOperator)\\*?\\{|\\\\def)$`);
function Q(e, t) {
	return zt.test(e.slice(Math.max(0, t - 24), t));
}
function Bt(e) {
	let t = q(e);
	if (t.size === 0) return [];
	let n = J(t);
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
			let t = n.index + n[0].length - 1, a = _(e, t);
			a !== null && i.push([t + 1, t + 1 + a.length]);
		}
	};
	return a(W), a(G), i;
}
function Vt(e, t) {
	let n = q(e.masked);
	if (n.size === 0) return;
	let r = J(n);
	if (r.size !== 0) for (let i of e.masked.matchAll(/\\(\w+)/g)) {
		let a = i[1];
		if (!r.has(a) || Q(e.masked, i.index)) continue;
		let o = n.get(a), { args: s } = X(e.masked, i.index + i[0].length, o.argCount, o.optional), c = Z(a, s, n, 0, /* @__PURE__ */ new Set());
		c && Wt(c, O(e, i.index), t);
	}
}
function Ht(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) for (let [e, r] of q(n)) t.set(e, r);
	return t;
}
function Ut(e, t = /* @__PURE__ */ new Map()) {
	let n = new Map(t);
	for (let [t, r] of q(e)) n.set(t, r);
	if (n.size === 0) return [];
	let r = [];
	for (let t of e.matchAll(/\\(\w+)/g)) {
		let i = t[1], a = n.get(i);
		if (!a || Q(e, t.index)) continue;
		let o = X(e, t.index + t[0].length, a.argCount, a.optional);
		if (o.args.length !== a.argCount) continue;
		let s = Z(i, o.args, n, 0, /* @__PURE__ */ new Set());
		s && r.push({
			name: i,
			inputStart: t.index,
			inputEnd: o.end,
			surface: s,
			arguments: o.arguments
		});
	}
	return r;
}
function $(e) {
	let t = e?.trim();
	return t && !t.includes("#") ? t : null;
}
function Wt(e, t, n) {
	for (let r of e.matchAll(v)) {
		let i = $(_(e, r.index + r[0].length - 1));
		i && n.labels.push({
			name: i,
			location: t
		});
	}
	for (let r of e.matchAll(y)) {
		let i = $(_(e, r.index + r[0].length - 1));
		i && n.labelRefs.push({
			name: i,
			location: t
		});
	}
	for (let r of e.matchAll(b)) {
		let i = _(e, r.index + r[0].length - 1);
		for (let e of i?.split(",") ?? []) {
			let r = $(e);
			r && n.citations.push({
				key: r,
				location: t
			});
		}
	}
}
function Gt(e, t, n = l(e)) {
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
	}, i = le(e, [...n]), a = {
		masked: i,
		lineStarts: u(i),
		file: t,
		groupEnds: g(i),
		commandOccurrences: C(i)
	}, o = ue(i, Bt(i)), s = {
		...a,
		masked: o,
		groupEnds: g(o),
		commandOccurrences: C(o)
	};
	return Re(s, r), ze(s, r), Be(s, r), Ve(s, r), He(a, r), Ue(a, r), qe(a, r), Xe(a, r), Ye(a, r), Ze(a, r), Qe(a, r), $e(a, r), et(a, r), nt(a, r), tt(a, r), yt(a, r), bt(a, r), it(a, r), at(a, r), ot(a, r), dt(a, r), Ot(a, r), rt(a, r), Vt(a, r), r;
}
//#endregion
export { Ht as collectUserMacroDefinitions, Ut as expandUserMacroCalls, Nt as macroDefinitionSpansFromTokens, se as maskSpans, ce as maskSpansFromTokens, Gt as parseLatexFile };
