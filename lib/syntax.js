import { tokenize as e } from "./lsp/latex-tokenizer.js";
import { buildLineStarts as t } from "./lsp/source-position.js";
import { parseLatexFile as n } from "./lsp/latex-parser.js";
import { ProjectIndex as r } from "./lsp/project-index.js";
//#region src/syntax.ts
var i = 1, a = /* @__PURE__ */ new Set([
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
]), o = class {
	files = /* @__PURE__ */ new Map();
	index = new r();
	reset(e) {
		for (let e of this.files.values()) this.index.removeFile(e.input.path);
		this.files.clear();
		for (let t of e.documents) this.upsert(t);
	}
	upsert(t) {
		let r = this.files.get(t.fileId);
		r && r.input.path !== t.path && this.index.removeFile(r.input.path);
		let i = e(t.content), a = n(t.content, t.path, i);
		this.index.updateFileSymbols(t.path, a);
		let o = c(t, i, a);
		return this.files.set(t.fileId, {
			input: { ...t },
			syntax: o
		}), o;
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
		t && (this.index.removeFile(t.input.path), this.files.delete(e));
	}
	getFile(e) {
		return this.files.get(e)?.syntax ?? null;
	}
	getProjectIndex() {
		return this.index;
	}
};
function s(e) {
	let t = new o();
	return e && t.reset(e), t;
}
function c(e, t, n) {
	let r = l(e.content, t, e.language === "markdown"), i = r.filter((e) => !e.closed).map((e) => ({
		code: "unclosed-math",
		message: `Unclosed ${e.delimiter} math region`,
		severity: "warning",
		range: e.fullRange
	}));
	return {
		schemaVersion: 1,
		fileId: e.fileId,
		path: e.path,
		documentVersion: e.documentVersion,
		mathRegions: r,
		macros: g(e, n),
		includes: _(e, n),
		diagnostics: i
	};
}
function l(e, t, n) {
	let r = n ? m(e) : [], i = t.filter((e) => e.type !== "comment" && e.type !== "verb" && !h(e.start, r)), a = [], o = null;
	for (let t of i) {
		let n = u(e, t);
		n && (!o && n.kind !== "close" ? o = {
			delimiter: n.delimiter,
			close: n.close,
			fullStart: t.start,
			contentStart: n.fullEnd
		} : o && n.kind !== "open" && n.close === o.close && (a.push(d(o, t.start, n.fullEnd)), o = null));
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
function u(e, t) {
	let n = p(e, t);
	if (n && a.has(n.name)) return {
		kind: n.kind === "begin" ? "open" : "close",
		delimiter: `\\begin{${n.name}}`,
		close: `env:${n.name}`,
		fullEnd: n.end
	};
	let r = f(t);
	return r ? {
		...r,
		fullEnd: t.end
	} : null;
}
function d(e, t, n) {
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
function f(e) {
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
function p(e, t) {
	if (t.type !== "command" || t.value !== "begin" && t.value !== "end") return null;
	let n = /^\s*\{([^{}]+)\}/.exec(e.slice(t.end));
	return n ? {
		kind: t.value,
		name: n[1],
		end: t.end + n[0].length
	} : null;
}
function m(e) {
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
function h(e, t) {
	return t.some(([t, n]) => t <= e && e < n);
}
function g(e, n) {
	let r = t(e.content), i = /* @__PURE__ */ new Map();
	for (let t of n.commands) {
		let n = v(e, r, t.location, t.name.length), a = i.get(t.name);
		a ? a.push(n) : i.set(t.name, [n]);
	}
	let a = n.commands.map((t) => ({
		kind: "definition",
		name: t.name,
		source: v(e, r, t.location, t.name.length),
		definitions: i.get(t.name) ?? []
	}));
	for (let t of n.commandUses) {
		let n = v(e, r, t.location, t.name.length);
		(i.get(t.name) ?? []).some((e) => e.range.startOffset === n.range.startOffset) || a.push({
			kind: "call",
			name: t.name,
			source: n,
			definitions: i.get(t.name) ?? []
		});
	}
	return a.sort((e, t) => e.source.range.startOffset - t.source.range.startOffset);
}
function _(e, n) {
	let r = t(e.content);
	return n.includes.map((t) => ({
		path: t.path,
		type: t.type,
		source: v(e, r, t.location, t.path.length)
	}));
}
function v(e, t, n, r) {
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
export { i as LATEX_SYNTAX_SCHEMA_VERSION, o as LatexSyntaxService, s as createLatexSyntaxService };
