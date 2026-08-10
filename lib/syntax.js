import { NEWCMD_CMDS as e } from "./lsp/latex-patterns.js";
import { tokenize as t } from "./lsp/latex-tokenizer.js";
import { buildLineStarts as n } from "./lsp/source-position.js";
import { collectUserMacroDefinitions as r, expandUserMacroCalls as i, parseLatexFile as a } from "./lsp/latex-parser.js";
import { ProjectIndex as o } from "./lsp/project-index.js";
import { MATH_COMMAND_SPECS as s, getMathCommandSpec as c } from "./math-command-spec.js";
import { buildNotationCst as l, findLatexNotationPath as ee } from "./notation-cst.js";
import { LATEX_SYNTAX_SCHEMA_VERSION as u, assertLatexSyntaxSchemaVersion as te } from "./syntax-contract.js";
//#region src/syntax.ts
var d = class extends Error {
	name = "LatexSyntaxCancelledError";
}, f = /* @__PURE__ */ new Set([
	"math",
	"displaymath",
	"equation",
	"equation*",
	"align",
	"align*",
	"alignat",
	"alignat*",
	"gather",
	"gather*",
	"multline",
	"multline*",
	"flalign",
	"flalign*"
]), p = new TextEncoder(), m = class {
	files = /* @__PURE__ */ new Map();
	index = new o();
	parseCount = 0;
	relinkDeferred = !1;
	lastTransferFileIds = [];
	reset(e) {
		for (let e of this.files.values()) this.index.removeFile(e.input.path);
		this.files.clear(), this.relinkDeferred = !0;
		try {
			for (let t of e.documents) this.upsert(t);
		} finally {
			this.relinkDeferred = !1;
		}
		this.refreshMacroDefinitions(), this.lastTransferFileIds = e.documents.map((e) => e.fileId);
	}
	upsert(e, n) {
		let r = this.files.get(e.fileId);
		N(n), this.parseCount++;
		let i = t(e.content);
		N(n);
		let o = a(e.content, e.path, i);
		N(n);
		let s = v(e, i, o, n);
		return N(n), r && r.input.language !== "markdown" && (r.input.path !== e.path || e.language === "markdown") && this.index.removeFile(r.input.path), e.language !== "markdown" && this.index.updateFileSymbols(e.path, o), this.files.set(e.fileId, {
			input: { ...e },
			syntax: s
		}), this.relinkDeferred || this.refreshMacroDefinitions(), this.lastTransferFileIds = [e.fileId], this.files.get(e.fileId).syntax;
	}
	move(e, t) {
		let n = this.files.get(e);
		if (!n) throw Error(`unknown fileId: ${e}`);
		this.upsert({
			...n.input,
			path: t
		});
	}
	remove(e) {
		let t = this.files.get(e);
		t && (this.index.removeFile(t.input.path), this.files.delete(e), this.refreshMacroDefinitions(), this.lastTransferFileIds = []);
	}
	getFile(e) {
		return this.files.get(e)?.syntax ?? null;
	}
	getProjectIndex() {
		return this.index;
	}
	getStats() {
		let e = [...this.files.values()].map((e) => e.syntax), t = this.lastTransferFileIds.flatMap((e) => {
			let t = this.files.get(e)?.syntax;
			return t ? [t] : [];
		});
		return {
			documents: this.files.size,
			parseCount: this.parseCount,
			notationNodes: e.reduce((e, t) => e + t.nodes.length, 0),
			recoveredNodes: e.reduce((e, t) => e + t.nodes.filter(F).length, 0),
			snapshotBytes: P(e),
			lastInvalidatedDocuments: this.lastTransferFileIds.length,
			lastTransferBytes: P(t)
		};
	}
	refreshMacroDefinitions() {
		let e = h(this.files.values());
		for (let t of this.files.values()) {
			let n = new Map(i(t.input.content, e.expansionDefinitions).map((e) => [e.inputStart, e]));
			t.syntax = {
				...t.syntax,
				macros: t.syntax.macros.map((t) => _(t, n, e))
			};
		}
	}
};
function h(e) {
	let t = [...e], n = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set();
	for (let e of t) {
		g(i, a, X(e.input.content));
		for (let t of e.syntax.macros) {
			if (t.kind !== "definition") continue;
			let e = n.get(t.name);
			e ? e.push(t.source) : n.set(t.name, [t.source]);
		}
	}
	return {
		bodies: i,
		definitions: n,
		expansionDefinitions: r(t.map((e) => e.input.content))
	};
}
function g(e, t, n) {
	for (let [r, i] of n) e.has(r) ? (e.delete(r), t.add(r)) : t.has(r) || e.set(r, i);
}
function _(e, t, n) {
	let r = n.definitions.get(e.name) ?? [];
	if (e.kind === "definition") return {
		...e,
		definitions: r
	};
	let i = t.get(e.source.range.startOffset - 1), a = r.length === 1 ? Z(e.name, n.bodies) : {
		status: "unresolved",
		depth: 0,
		editable: !0
	};
	return {
		...e,
		definitions: r,
		expansion: a.status === "expanded" && i ? {
			...a,
			surface: i.surface,
			inputRange: {
				startOffset: i.inputStart,
				endOffset: i.inputEnd
			}
		} : a
	};
}
function ne(e) {
	let t = new m();
	return e && t.reset(e), t;
}
function v(e, t, n, r) {
	let i = I(e.content, t, e.language === "markdown"), a = i.filter((e) => !e.closed).map((e) => ({
		code: "unclosed-math",
		message: `Unclosed ${e.delimiter} math region`,
		severity: "warning",
		range: e.fullRange
	})), o = ie(e, t, n, i, r);
	return {
		schemaVersion: 4,
		fileId: e.fileId,
		path: e.path,
		documentVersion: e.documentVersion,
		mathRegions: i,
		macros: le(e, n),
		includes: pe(e, n),
		diagnostics: a,
		...o
	};
}
var y = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5
}, re = /* @__PURE__ */ new Map([
	["addbibresource", ["optional", "required"]],
	["begin", ["required"]],
	["bibliography", ["required"]],
	["bibliographystyle", ["required"]],
	["cite", [
		"optional",
		"optional",
		"required"
	]],
	["citep", [
		"optional",
		"optional",
		"required"
	]],
	["citet", [
		"optional",
		"optional",
		"required"
	]],
	["documentclass", ["optional", "required"]],
	["end", ["required"]],
	["include", ["required"]],
	["includegraphics", ["optional", "required"]],
	["input", ["required"]],
	["label", ["required"]],
	["newacronym", [
		"optional",
		"required",
		"required",
		"required"
	]],
	["newcommand", [
		"required",
		"optional",
		"optional",
		"required"
	]],
	["newenvironment", [
		"required",
		"optional",
		"optional",
		"required",
		"required"
	]],
	["newglossaryentry", ["required", "required"]],
	["pageref", ["required"]],
	["providecommand", [
		"required",
		"optional",
		"optional",
		"required"
	]],
	["ref", ["required"]],
	["renewcommand", [
		"required",
		"optional",
		"optional",
		"required"
	]],
	["renewenvironment", [
		"required",
		"optional",
		"optional",
		"required",
		"required"
	]],
	["subfile", ["required"]],
	["usepackage", ["optional", "required"]],
	["DeclareMathOperator", ["required", "required"]],
	["DeclarePairedDelimiter", ["required", "required"]]
]);
function ie(e, t, n, r, i) {
	let a = new Map(t.map((e) => [e.start, e]));
	return {
		...l(e, t, r, () => N(i)),
		visibleProse: ae(e, t, r),
		scopes: w(e, t, a, n),
		declarations: A(e, a, n)
	};
}
function b(e, t) {
	return {
		fileId: e.fileId,
		path: e.path,
		range: t
	};
}
function ae(e, t, n) {
	let r = [
		...K(t, e.content.length),
		...e.language === "markdown" ? V(e.content) : [],
		...n.map((e) => [e.fullRange.startOffset, e.fullRange.endOffset])
	];
	for (let n of t) if (n.type === "comment" || n.type === "verb" || n.type === "open" || n.type === "close") r.push([n.start, n.end]);
	else if (n.type === "command") {
		let t = re.get(n.value);
		r.push([n.start, t === void 0 ? n.end : oe(e.content, n.end, t)]);
	}
	let i = [], a = 0;
	for (let [t, n] of S(r, e.content.length)) C(e.content, a, t, i), a = Math.max(a, n);
	return C(e.content, a, e.content.length, i), i;
}
function oe(e, t, n) {
	let r = t;
	e[r] === "*" && r++;
	for (let t of n) {
		for (; /\s/.test(e[r] ?? "");) r++;
		let n = e[r];
		if (t === "optional") n === "[" && (r = x(e, r, "[", "]"));
		else {
			if (n !== "{") return r;
			r = x(e, r, "{", "}");
		}
	}
	return r;
}
function x(e, t, n, r) {
	let i = 0;
	for (let a = t; a < e.length; a++) {
		if (e[a] === "\\") {
			a++;
			continue;
		}
		if (e[a] === n) i++;
		else if (e[a] === r && --i === 0) return a + 1;
	}
	return e.length;
}
function S(e, t) {
	let n = e.map(([e, n]) => [Math.max(0, Math.min(e, t)), Math.max(0, Math.min(n, t))]).filter(([e, t]) => t > e).sort((e, t) => e[0] - t[0] || e[1] - t[1]), r = [];
	for (let [e, t] of n) {
		let n = r[r.length - 1];
		!n || e > n[1] ? r.push([e, t]) : n[1] = Math.max(n[1], t);
	}
	return r;
}
function C(e, t, n, r) {
	for (; t < n && /\s/.test(e[t]);) t++;
	for (; n > t && /\s/.test(e[n - 1]);) n--;
	n > t && r.push({
		range: {
			startOffset: t,
			endOffset: n
		},
		state: "complete"
	});
}
function w(e, t, n, r) {
	let i = [{
		kind: "document",
		parent: null,
		range: {
			startOffset: 0,
			endOffset: e.content.length
		},
		state: "complete"
	}];
	return T(i, e, n, r), E(i, e, t), i;
}
function T(e, t, r, i) {
	let a = n(t.content), o = i.sections.map((e) => ({
		level: e.level,
		offset: j(a, e.location),
		name: e.title
	})).sort((e, t) => e.offset - t.offset), s = [];
	for (let n = 0; n < o.length; n++) {
		let i = o[n], a = t.content.length;
		for (let e = n + 1; e < o.length; e++) if (y[o[e].level] <= y[i.level]) {
			a = o[e].offset;
			break;
		}
		let c = 0;
		for (let e = n - 1; e >= 0; e--) if (y[o[e].level] < y[i.level]) {
			c = s[e];
			break;
		}
		let l = r.get(i.offset);
		s.push(e.length), e.push({
			kind: "section",
			parent: c,
			range: {
				startOffset: i.offset,
				endOffset: a
			},
			state: "complete",
			name: i.name,
			level: i.level,
			source: b(t, {
				startOffset: i.offset,
				endOffset: l?.end ?? i.offset
			})
		});
	}
}
function E(e, t, n) {
	let r = [];
	for (let i of n) {
		let n = B(t.content, i);
		if (!n) continue;
		if (n.kind === "begin") {
			let a = r[r.length - 1]?.index ?? k(e, i.start), o = e.length;
			e.push({
				kind: "environment",
				parent: a,
				range: {
					startOffset: i.start,
					endOffset: t.content.length
				},
				state: "incomplete",
				name: n.name,
				source: b(t, {
					startOffset: i.start,
					endOffset: n.end
				})
			}), r.push({
				index: o,
				name: n.name
			});
			continue;
		}
		let a = D(r, n.name);
		a < 0 || O(e, r, a, n.name, n.end);
	}
}
function D(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (e[n].name === t) return n;
	return -1;
}
function O(e, t, n, r, i) {
	for (; t.length > n;) {
		let n = t.pop();
		if (n.name !== r) continue;
		let a = e[n.index];
		e[n.index] = {
			...a,
			range: {
				...a.range,
				endOffset: i
			},
			state: "complete"
		};
	}
}
function k(e, t) {
	for (let n = e.length - 1; n > 0; n--) {
		let r = e[n];
		if (r.kind === "section" && r.range.startOffset <= t && t < r.range.endOffset) return n;
	}
	return 0;
}
function A(e, t, r) {
	let i = n(e.content), a = (n) => {
		let r = j(i, n);
		return b(e, {
			startOffset: r,
			endOffset: t.get(r)?.end ?? r
		});
	}, o = (t, n) => {
		let r = j(i, t);
		return b(e, {
			startOffset: r,
			endOffset: r + n.length
		});
	};
	return [
		...r.classes.map((e) => ({
			kind: "class",
			name: e.name,
			options: e.options,
			source: a(e.location)
		})),
		...r.packages.map((e) => ({
			kind: "package",
			name: e.name,
			options: e.options,
			source: a(e.location)
		})),
		...r.commands.map((e) => ({
			kind: "macro",
			name: e.name,
			source: o(e.location, e.name)
		})),
		...r.environmentDefs.map((e) => ({
			kind: "environment",
			name: e.name,
			source: a(e.location)
		})),
		...r.glossaryEntries.filter((e) => e.role === "definition").map((e) => ({
			kind: "glossary",
			key: e.name,
			source: o(e.location, e.name)
		})),
		...r.acronymEntries.filter((e) => e.role === "definition").map((e) => ({
			kind: "acronym",
			key: e.name,
			source: o(e.location, e.name)
		}))
	];
}
function j(e, t) {
	return (e[t.line - 1] ?? 0) + t.column - 1;
}
function M(e) {
	return p.encode(JSON.stringify(e)).byteLength;
}
function N(e) {
	if (e?.isCancellationRequested) throw new d("Syntax update cancelled");
}
function P(e) {
	return e.reduce((e, t) => e + M(t), 0);
}
function F(e) {
	return e.kind === "error" || e.state === "incomplete" || e.state === "ambiguous" || e.state === "cyclic" || e.state === "truncated";
}
function I(e, t, n) {
	let r = [...K(t, e.length), ...n ? V(e) : []], i = t.filter((e) => e.type !== "comment" && e.type !== "verb" && !J(e.start, r)), a = [], o = null;
	for (let t of i) {
		let n = L(e, t);
		n && (!o && n.kind !== "close" ? o = {
			delimiter: n.delimiter,
			close: n.close,
			fullStart: t.start,
			contentStart: n.fullEnd
		} : o && n.kind !== "open" && n.close === o.close && (a.push(R(o, t.start, n.fullEnd)), o = null));
	}
	return o && a.push({
		delimiter: o.delimiter,
		fullRange: {
			startOffset: o.fullStart,
			endOffset: e.length
		},
		contentRange: {
			startOffset: o.contentStart,
			endOffset: e.length
		},
		closed: !1
	}), a;
}
function L(e, t) {
	let n = B(e, t);
	if (n && f.has(n.name)) return {
		kind: n.kind === "begin" ? "open" : "close",
		delimiter: `\\begin{${n.name}}`,
		close: `env:${n.name}`,
		fullEnd: n.end
	};
	let r = z(t);
	return r ? {
		...r,
		fullEnd: t.end
	} : null;
}
function R(e, t, n) {
	return {
		delimiter: e.delimiter,
		fullRange: {
			startOffset: e.fullStart,
			endOffset: n
		},
		contentRange: {
			startOffset: e.contentStart,
			endOffset: t
		},
		closed: !0
	};
}
function z(e) {
	return e.type === "math" ? {
		kind: "toggle",
		delimiter: e.value,
		close: e.value
	} : e.type === "command" ? e.value === "(" ? {
		kind: "open",
		delimiter: "\\(",
		close: ")"
	} : e.value === "[" ? {
		kind: "open",
		delimiter: "\\[",
		close: "]"
	} : e.value === ")" ? {
		kind: "close",
		delimiter: "\\(",
		close: ")"
	} : e.value === "]" ? {
		kind: "close",
		delimiter: "\\[",
		close: "]"
	} : null : null;
}
function B(e, t) {
	if (t.type !== "command" || t.value !== "begin" && t.value !== "end") return null;
	let n = /^\s*\{([^{}]+)\}/.exec(e.slice(t.end));
	return n ? {
		kind: t.value,
		name: n[1],
		end: t.end + n[0].length
	} : null;
}
function V(e) {
	let t = H(e);
	t.push(...U(e), ...W(e));
	for (let [n, r] of G(e)) {
		let e = null;
		for (let i of r.matchAll(/`+/g)) {
			let r = n + i.index;
			if (J(r, t)) continue;
			let a = i[0].length;
			e ? e.length === a && (t.push([e.start, r + a]), e = null) : e = {
				length: a,
				start: r
			};
		}
		e && t.push([e.start, n + r.length]);
	}
	return t;
}
function H(e) {
	let t = [], n = /^\s*(`{3,}|~{3,})/gm, r = null;
	for (let i of e.matchAll(n)) {
		let n = i[1];
		if (!r) r = {
			marker: n[0],
			start: i.index
		};
		else if (n[0] === r.marker) {
			let n = e.indexOf("\n", i.index);
			t.push([r.start, n < 0 ? e.length : n + 1]), r = null;
		}
	}
	return r && t.push([r.start, e.length]), t;
}
function U(e) {
	if (!/^(?:---|\+\+\+)\s*(?:\r?\n|$)/.test(e)) return [];
	let t = /^(?:---|\.\.\.|\+\+\+)\s*$/gm;
	t.lastIndex = e.indexOf("\n") + 1;
	let n = t.exec(e);
	return [[0, n ? n.index + n[0].length : e.length]];
}
function W(e) {
	return [...e.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((e) => [e.index, e.index + e[0].length]);
}
function G(e) {
	let t = [], n = 0;
	for (let r of e.split("\n")) t.push([n, r]), n += r.length + 1;
	return t;
}
function K(e, t) {
	let n = [], r = [];
	for (let t of e) t.type === "command" && q(t, r, n);
	for (let e of r) e.falseStart >= 0 && n.push([e.falseStart, t]);
	return n;
}
function q(e, t, n) {
	if (e.value === "iffalse") {
		t.push({
			falseStart: e.end,
			kind: "false",
			sawElse: !1
		});
		return;
	}
	if (e.value === "iftrue") {
		t.push({
			falseStart: -1,
			kind: "true",
			sawElse: !1
		});
		return;
	}
	if (e.value === "else") {
		se(t[t.length - 1], e, n);
		return;
	}
	if (e.value === "fi") {
		ce(t.pop(), e, n);
		return;
	}
	e.value.startsWith("if") && e.value !== "iff" && t.push({
		falseStart: -1,
		kind: "other",
		sawElse: !1
	});
}
function se(e, t, n) {
	!e || e.sawElse || (e.sawElse = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function ce(e, t, n) {
	e && (e.kind === "false" && !e.sawElse || e.kind === "true" && e.sawElse) && n.push([e.falseStart, t.start]);
}
function J(e, t) {
	return t.some(([t, n]) => t <= e && e < n);
}
function le(e, t) {
	let r = n(e.content), a = X(e.content), o = new Map(i(e.content).map((e) => [e.inputStart, e])), s = /* @__PURE__ */ new Map();
	for (let n of t.commands) {
		let t = $(e, r, n.location, n.name.length), i = s.get(n.name);
		i ? i.push(t) : s.set(n.name, [t]);
	}
	let c = t.commands.map((t) => ({
		kind: "definition",
		name: t.name,
		source: $(e, r, t.location, t.name.length),
		definitions: s.get(t.name) ?? [],
		expansion: {
			status: "not-applicable",
			depth: 0,
			editable: !0
		}
	}));
	for (let n of t.commandUses) {
		let t = $(e, r, n.location, n.name.length);
		if (!(s.get(n.name) ?? []).some((e) => e.range.startOffset === t.range.startOffset)) {
			let e = o.get(t.range.startOffset - 1), r = Z(n.name, a);
			c.push({
				kind: "call",
				name: n.name,
				source: t,
				definitions: s.get(n.name) ?? [],
				expansion: r.status === "expanded" && e ? {
					...r,
					surface: e.surface,
					inputRange: {
						startOffset: e.inputStart,
						endOffset: e.inputEnd
					}
				} : r
			});
		}
	}
	return c.sort((e, t) => e.source.range.startOffset - t.source.range.startOffset);
}
var ue = 4, Y = RegExp(`\\\\(?:${e}|DeclareMathOperator)\\*?\\{\\\\([a-zA-Z@]+)\\}(?:\\[\\d+\\])?(?:\\[[^\\]]*\\])?\\s*\\{`, "g"), de = /\\def\\([a-zA-Z@]+)(?:#\d)*\s*\{/g;
function X(e) {
	let t = /* @__PURE__ */ new Map(), n = (n) => {
		for (let r of e.matchAll(n)) {
			let n = fe(e, r.index + r[0].length - 1);
			n !== null && t.set(r[1], { body: n });
		}
	};
	return n(Y), n(de), t;
}
function fe(e, t) {
	if (e[t] !== "{") return null;
	let n = 1;
	for (let r = t + 1; r < e.length; r++) {
		if (e[r] === "\\") {
			r++;
			continue;
		}
		if (e[r] === "{" && n++, e[r] === "}" && --n === 0) return e.slice(t + 1, r);
	}
	return null;
}
function Z(e, t) {
	return t.has(e) ? {
		...Q(e, t, [], 0),
		editable: !1
	} : {
		status: "unresolved",
		depth: 0,
		editable: !0
	};
}
function Q(e, t, n, r) {
	if (n.includes(e)) return {
		status: "cycle",
		depth: r
	};
	let i = t.get(e);
	if (!i) return {
		status: "expanded",
		depth: r
	};
	let a = [...i.body.matchAll(/\\([a-zA-Z@]+)/g)].map((e) => e[1]).filter((e) => t.has(e));
	if (a.length === 0) return {
		status: "expanded",
		depth: r
	};
	if (r >= ue) return {
		status: "truncated",
		depth: r
	};
	let o = r;
	for (let i of a) {
		let a = Q(i, t, [...n, e], r + 1);
		if (a.status === "cycle" || a.status === "truncated") return a;
		o = Math.max(o, a.depth);
	}
	return {
		status: "expanded",
		depth: o
	};
}
function pe(e, t) {
	let r = n(e.content);
	return t.includes.map((t) => ({
		path: t.path,
		type: t.type,
		source: $(e, r, t.location, t.path.length)
	}));
}
function $(e, t, n, r) {
	let i = (t[n.line - 1] ?? 0) + n.column - 1;
	return {
		fileId: e.fileId,
		path: e.path,
		range: {
			startOffset: i,
			endOffset: i + r
		}
	};
}
//#endregion
export { u as LATEX_SYNTAX_SCHEMA_VERSION, d as LatexSyntaxCancelledError, m as LatexSyntaxService, s as MATH_COMMAND_SPECS, te as assertLatexSyntaxSchemaVersion, ne as createLatexSyntaxService, ee as findLatexNotationPath, c as getMathCommandSpec };
