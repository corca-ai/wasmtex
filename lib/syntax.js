import { NEWCMD_CMDS as e } from "./lsp/latex-patterns.js";
import { tokenize as t } from "./lsp/latex-tokenizer.js";
import { buildLineStarts as n } from "./lsp/source-position.js";
import { expandUserMacroCalls as r, parseLatexFile as i } from "./lsp/latex-parser.js";
import { ProjectIndex as a } from "./lsp/project-index.js";
//#region src/syntax.ts
var o = 3, s = /* @__PURE__ */ new Set([
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
]), c = class {
	files = /* @__PURE__ */ new Map();
	index = new a();
	parseCount = 0;
	reset(e) {
		for (let e of this.files.values()) this.index.removeFile(e.input.path);
		this.files.clear();
		for (let t of e.documents) this.upsert(t);
	}
	upsert(e) {
		let n = this.files.get(e.fileId);
		n && (n.input.path !== e.path || n.input.language === "markdown") && this.index.removeFile(n.input.path), this.parseCount++;
		let r = t(e.content), a = i(e.content, e.path, r);
		e.language !== "markdown" && this.index.updateFileSymbols(e.path, a);
		let o = u(e, r, a);
		return this.files.set(e.fileId, {
			input: { ...e },
			syntax: o
		}), this.refreshMacroDefinitions(), this.files.get(e.fileId).syntax;
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
		t && (this.index.removeFile(t.input.path), this.files.delete(e), this.refreshMacroDefinitions());
	}
	getFile(e) {
		return this.files.get(e)?.syntax ?? null;
	}
	getProjectIndex() {
		return this.index;
	}
	getStats() {
		return {
			documents: this.files.size,
			parseCount: this.parseCount
		};
	}
	refreshMacroDefinitions() {
		let e = /* @__PURE__ */ new Map();
		for (let t of this.files.values()) for (let n of t.syntax.macros) {
			if (n.kind !== "definition") continue;
			let t = e.get(n.name);
			t ? t.push(n.source) : e.set(n.name, [n.source]);
		}
		for (let t of this.files.values()) t.syntax = {
			...t.syntax,
			macros: t.syntax.macros.map((t) => ({
				...t,
				definitions: e.get(t.name) ?? []
			}))
		};
	}
};
function l(e) {
	let t = new c();
	return e && t.reset(e), t;
}
function u(e, t, n) {
	let r = d(e.content, t, e.language === "markdown"), i = r.filter((e) => !e.closed).map((e) => ({
		code: "unclosed-math",
		message: `Unclosed ${e.delimiter} math region`,
		severity: "warning",
		range: e.fullRange
	}));
	return {
		schemaVersion: 3,
		fileId: e.fileId,
		path: e.path,
		documentVersion: e.documentVersion,
		mathRegions: r,
		macros: E(e, n),
		includes: P(e, n),
		diagnostics: i
	};
}
function d(e, t, n) {
	let r = [...x(t, e.length), ...n ? g(e) : []], i = t.filter((e) => e.type !== "comment" && e.type !== "verb" && !T(e.start, r)), a = [], o = null;
	for (let t of i) {
		let n = f(e, t);
		n && (!o && n.kind !== "close" ? o = {
			delimiter: n.delimiter,
			close: n.close,
			fullStart: t.start,
			contentStart: n.fullEnd
		} : o && n.kind !== "open" && n.close === o.close && (a.push(p(o, t.start, n.fullEnd)), o = null));
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
function f(e, t) {
	let n = h(e, t);
	if (n && s.has(n.name)) return {
		kind: n.kind === "begin" ? "open" : "close",
		delimiter: `\\begin{${n.name}}`,
		close: `env:${n.name}`,
		fullEnd: n.end
	};
	let r = m(t);
	return r ? {
		...r,
		fullEnd: t.end
	} : null;
}
function p(e, t, n) {
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
function m(e) {
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
function h(e, t) {
	if (t.type !== "command" || t.value !== "begin" && t.value !== "end") return null;
	let n = /^\s*\{([^{}]+)\}/.exec(e.slice(t.end));
	return n ? {
		kind: t.value,
		name: n[1],
		end: t.end + n[0].length
	} : null;
}
function g(e) {
	let t = _(e);
	t.push(...v(e), ...y(e));
	for (let [n, r] of b(e)) {
		let e = null;
		for (let i of r.matchAll(/`+/g)) {
			let r = n + i.index;
			if (T(r, t)) continue;
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
function _(e) {
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
function v(e) {
	if (!/^(?:---|\+\+\+)\s*(?:\r?\n|$)/.test(e)) return [];
	let t = /^(?:---|\.\.\.|\+\+\+)\s*$/gm;
	t.lastIndex = e.indexOf("\n") + 1;
	let n = t.exec(e);
	return [[0, n ? n.index + n[0].length : e.length]];
}
function y(e) {
	return [...e.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((e) => [e.index, e.index + e[0].length]);
}
function b(e) {
	let t = [], n = 0;
	for (let r of e.split("\n")) t.push([n, r]), n += r.length + 1;
	return t;
}
function x(e, t) {
	let n = [], r = [];
	for (let t of e) t.type === "command" && S(t, r, n);
	for (let e of r) e.falseStart >= 0 && n.push([e.falseStart, t]);
	return n;
}
function S(e, t, n) {
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
		C(t[t.length - 1], e, n);
		return;
	}
	if (e.value === "fi") {
		w(t.pop(), e, n);
		return;
	}
	e.value.startsWith("if") && e.value !== "iff" && t.push({
		falseStart: -1,
		kind: "other",
		sawElse: !1
	});
}
function C(e, t, n) {
	!e || e.sawElse || (e.sawElse = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function w(e, t, n) {
	e && (e.kind === "false" && !e.sawElse || e.kind === "true" && e.sawElse) && n.push([e.falseStart, t.start]);
}
function T(e, t) {
	return t.some(([t, n]) => t <= e && e < n);
}
function E(e, t) {
	let i = n(e.content), a = A(e.content), o = new Map(r(e.content).map((e) => [e.inputStart, e])), s = /* @__PURE__ */ new Map();
	for (let n of t.commands) {
		let t = F(e, i, n.location, n.name.length), r = s.get(n.name);
		r ? r.push(t) : s.set(n.name, [t]);
	}
	let c = t.commands.map((t) => ({
		kind: "definition",
		name: t.name,
		source: F(e, i, t.location, t.name.length),
		definitions: s.get(t.name) ?? [],
		expansion: {
			status: "not-applicable",
			depth: 0,
			editable: !0
		}
	}));
	for (let n of t.commandUses) {
		let t = F(e, i, n.location, n.name.length);
		if (!(s.get(n.name) ?? []).some((e) => e.range.startOffset === t.range.startOffset)) {
			let e = o.get(t.range.startOffset - 1), r = M(n.name, a);
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
var D = 4, O = RegExp(`\\\\(?:${e}|DeclareMathOperator)\\*?\\{\\\\([a-zA-Z@]+)\\}(?:\\[\\d+\\])?(?:\\[[^\\]]*\\])?\\s*\\{`, "g"), k = /\\def\\([a-zA-Z@]+)(?:#\d)*\s*\{/g;
function A(e) {
	let t = /* @__PURE__ */ new Map(), n = (n) => {
		for (let r of e.matchAll(n)) {
			let n = j(e, r.index + r[0].length - 1);
			n !== null && t.set(r[1], { body: n });
		}
	};
	return n(O), n(k), t;
}
function j(e, t) {
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
function M(e, t) {
	return t.has(e) ? {
		...N(e, t, [], 0),
		editable: !1
	} : {
		status: "unresolved",
		depth: 0,
		editable: !0
	};
}
function N(e, t, n, r) {
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
	if (r >= D) return {
		status: "truncated",
		depth: r
	};
	let o = r;
	for (let i of a) {
		let a = N(i, t, [...n, e], r + 1);
		if (a.status === "cycle" || a.status === "truncated") return a;
		o = Math.max(o, a.depth);
	}
	return {
		status: "expanded",
		depth: o
	};
}
function P(e, t) {
	let r = n(e.content);
	return t.includes.map((t) => ({
		path: t.path,
		type: t.type,
		source: F(e, r, t.location, t.path.length)
	}));
}
function F(e, t, n, r) {
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
export { o as LATEX_SYNTAX_SCHEMA_VERSION, c as LatexSyntaxService, l as createLatexSyntaxService };
