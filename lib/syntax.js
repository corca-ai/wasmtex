import { NEWCMD_CMDS as e } from "./lsp/latex-patterns.js";
import { tokenize as t } from "./lsp/latex-tokenizer.js";
import { buildLineStarts as n } from "./lsp/source-position.js";
import { parseLatexFile as r } from "./lsp/latex-parser.js";
import { ProjectIndex as i } from "./lsp/project-index.js";
//#region src/syntax.ts
var a = 2, o = /* @__PURE__ */ new Set([
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
]), s = class {
	files = /* @__PURE__ */ new Map();
	index = new i();
	parseCount = 0;
	reset(e) {
		for (let e of this.files.values()) this.index.removeFile(e.input.path);
		this.files.clear();
		for (let t of e.documents) this.upsert(t);
	}
	upsert(e) {
		let n = this.files.get(e.fileId);
		n && (n.input.path !== e.path || n.input.language === "markdown") && this.index.removeFile(n.input.path), this.parseCount++;
		let i = t(e.content), a = r(e.content, e.path, i);
		e.language !== "markdown" && this.index.updateFileSymbols(e.path, a);
		let o = l(e, i, a);
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
function c(e) {
	let t = new s();
	return e && t.reset(e), t;
}
function l(e, t, n) {
	let r = u(e.content, t, e.language === "markdown"), i = r.filter((e) => !e.closed).map((e) => ({
		code: "unclosed-math",
		message: `Unclosed ${e.delimiter} math region`,
		severity: "warning",
		range: e.fullRange
	}));
	return {
		schemaVersion: 2,
		fileId: e.fileId,
		path: e.path,
		documentVersion: e.documentVersion,
		mathRegions: r,
		macros: T(e, n),
		includes: N(e, n),
		diagnostics: i
	};
}
function u(e, t, n) {
	let r = [...b(t, e.length), ...n ? h(e) : []], i = t.filter((e) => e.type !== "comment" && e.type !== "verb" && !w(e.start, r)), a = [], o = null;
	for (let t of i) {
		let n = d(e, t);
		n && (!o && n.kind !== "close" ? o = {
			delimiter: n.delimiter,
			close: n.close,
			fullStart: t.start,
			contentStart: n.fullEnd
		} : o && n.kind !== "open" && n.close === o.close && (a.push(f(o, t.start, n.fullEnd)), o = null));
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
function d(e, t) {
	let n = m(e, t);
	if (n && o.has(n.name)) return {
		kind: n.kind === "begin" ? "open" : "close",
		delimiter: `\\begin{${n.name}}`,
		close: `env:${n.name}`,
		fullEnd: n.end
	};
	let r = p(t);
	return r ? {
		...r,
		fullEnd: t.end
	} : null;
}
function f(e, t, n) {
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
function p(e) {
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
function m(e, t) {
	if (t.type !== "command" || t.value !== "begin" && t.value !== "end") return null;
	let n = /^\s*\{([^{}]+)\}/.exec(e.slice(t.end));
	return n ? {
		kind: t.value,
		name: n[1],
		end: t.end + n[0].length
	} : null;
}
function h(e) {
	let t = g(e);
	t.push(..._(e), ...v(e));
	for (let [n, r] of y(e)) {
		let e = null;
		for (let i of r.matchAll(/`+/g)) {
			let r = n + i.index;
			if (w(r, t)) continue;
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
function g(e) {
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
function _(e) {
	if (!/^(?:---|\+\+\+)\s*(?:\r?\n|$)/.test(e)) return [];
	let t = /^(?:---|\.\.\.|\+\+\+)\s*$/gm;
	t.lastIndex = e.indexOf("\n") + 1;
	let n = t.exec(e);
	return [[0, n ? n.index + n[0].length : e.length]];
}
function v(e) {
	return [...e.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((e) => [e.index, e.index + e[0].length]);
}
function y(e) {
	let t = [], n = 0;
	for (let r of e.split("\n")) t.push([n, r]), n += r.length + 1;
	return t;
}
function b(e, t) {
	let n = [], r = [];
	for (let t of e) t.type === "command" && x(t, r, n);
	for (let e of r) e.falseStart >= 0 && n.push([e.falseStart, t]);
	return n;
}
function x(e, t, n) {
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
		S(t[t.length - 1], e, n);
		return;
	}
	if (e.value === "fi") {
		C(t.pop(), e, n);
		return;
	}
	e.value.startsWith("if") && e.value !== "iff" && t.push({
		falseStart: -1,
		kind: "other",
		sawElse: !1
	});
}
function S(e, t, n) {
	!e || e.sawElse || (e.sawElse = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function C(e, t, n) {
	e && (e.kind === "false" && !e.sawElse || e.kind === "true" && e.sawElse) && n.push([e.falseStart, t.start]);
}
function w(e, t) {
	return t.some(([t, n]) => t <= e && e < n);
}
function T(e, t) {
	let r = n(e.content), i = k(e.content), a = /* @__PURE__ */ new Map();
	for (let n of t.commands) {
		let t = P(e, r, n.location, n.name.length), i = a.get(n.name);
		i ? i.push(t) : a.set(n.name, [t]);
	}
	let o = t.commands.map((t) => ({
		kind: "definition",
		name: t.name,
		source: P(e, r, t.location, t.name.length),
		definitions: a.get(t.name) ?? [],
		expansion: {
			status: "not-applicable",
			depth: 0,
			editable: !0
		}
	}));
	for (let n of t.commandUses) {
		let t = P(e, r, n.location, n.name.length);
		(a.get(n.name) ?? []).some((e) => e.range.startOffset === t.range.startOffset) || o.push({
			kind: "call",
			name: n.name,
			source: t,
			definitions: a.get(n.name) ?? [],
			expansion: j(n.name, i)
		});
	}
	return o.sort((e, t) => e.source.range.startOffset - t.source.range.startOffset);
}
var E = 4, D = RegExp(`\\\\(?:${e}|DeclareMathOperator)\\*?\\{\\\\([a-zA-Z@]+)\\}(?:\\[\\d+\\])?(?:\\[[^\\]]*\\])?\\s*\\{`, "g"), O = /\\def\\([a-zA-Z@]+)(?:#\d)*\s*\{/g;
function k(e) {
	let t = /* @__PURE__ */ new Map(), n = (n) => {
		for (let r of e.matchAll(n)) {
			let n = A(e, r.index + r[0].length - 1);
			n !== null && t.set(r[1], { body: n });
		}
	};
	return n(D), n(O), t;
}
function A(e, t) {
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
function j(e, t) {
	return t.has(e) ? {
		...M(e, t, [], 0),
		editable: !1
	} : {
		status: "unresolved",
		depth: 0,
		editable: !0
	};
}
function M(e, t, n, r) {
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
	if (r >= E) return {
		status: "truncated",
		depth: r
	};
	let o = r;
	for (let i of a) {
		let a = M(i, t, [...n, e], r + 1);
		if (a.status === "cycle" || a.status === "truncated") return a;
		o = Math.max(o, a.depth);
	}
	return {
		status: "expanded",
		depth: o
	};
}
function N(e, t) {
	let r = n(e.content);
	return t.includes.map((t) => ({
		path: t.path,
		type: t.type,
		source: P(e, r, t.location, t.path.length)
	}));
}
function P(e, t, n, r) {
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
export { a as LATEX_SYNTAX_SCHEMA_VERSION, s as LatexSyntaxService, c as createLatexSyntaxService };
