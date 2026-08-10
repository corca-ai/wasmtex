import { NEWCMD_CMDS as e } from "./lsp/latex-patterns.js";
import { tokenize as t } from "./lsp/latex-tokenizer.js";
import { buildLineStarts as n } from "./lsp/source-position.js";
import { collectUserMacroDefinitions as r, expandUserMacroCalls as i, parseLatexFile as a } from "./lsp/latex-parser.js";
import { ProjectIndex as o } from "./lsp/project-index.js";
import { MATH_COMMAND_SPECS as s, getMathCommandSpec as c } from "./math-command-spec.js";
import { buildNotationCst as l, findLatexNotationPath as u } from "./notation-cst.js";
import { collectRichStructuralDeclarations as ee } from "./structural-declarations.js";
import { LATEX_SYNTAX_SCHEMA_VERSION as d, assertLatexSyntaxSchemaVersion as f } from "./syntax-contract.js";
//#region src/syntax.ts
var p = class extends Error {
	name = "LatexSyntaxCancelledError";
}, te = /* @__PURE__ */ new Set([
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
]), ne = new TextEncoder(), m = class {
	files = /* @__PURE__ */ new Map();
	index = new o();
	macroCatalog = h();
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
		this.lastTransferFileIds = this.refreshMacroDefinitions(new Set(e.documents.map((e) => e.fileId)), !0);
	}
	upsert(e, n) {
		let r = this.files.get(e.fileId);
		U(n), this.parseCount++;
		let i = t(e.content);
		U(n);
		let o = a(e.content, e.path, i);
		U(n);
		let s = ce(e, i, o, n);
		return U(n), r && r.input.language !== "markdown" && (r.input.path !== e.path || e.language === "markdown") && this.index.removeFile(r.input.path), e.language !== "markdown" && this.index.updateFileSymbols(e.path, o), this.files.set(e.fileId, {
			input: { ...e },
			baseSyntax: s,
			syntax: s
		}), this.relinkDeferred || (this.lastTransferFileIds = this.refreshMacroDefinitions(/* @__PURE__ */ new Set([e.fileId]))), this.files.get(e.fileId).syntax;
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
		t && (this.index.removeFile(t.input.path), this.files.delete(e), this.lastTransferFileIds = this.refreshMacroDefinitions());
	}
	getFile(e) {
		return this.files.get(e)?.syntax ?? null;
	}
	getInvalidatedFiles() {
		return this.lastTransferFileIds.flatMap((e) => {
			let t = this.files.get(e)?.syntax;
			return t ? [t] : [];
		});
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
			recoveredNodes: e.reduce((e, t) => e + t.nodes.filter(le).length, 0),
			snapshotBytes: W(e),
			lastInvalidatedDocuments: this.lastTransferFileIds.length,
			lastTransferBytes: W(t)
		};
	}
	refreshMacroDefinitions(e = /* @__PURE__ */ new Set(), t = !1) {
		let n = ie(this.files.values()), r = re(this.macroCatalog, n), a = [];
		for (let [o, s] of this.files) {
			if (!t && !e.has(o) && (r.size === 0 || !s.baseSyntax.macros.some((e) => r.has(e.name)))) continue;
			let c = new Map(i(s.input.content, n.expansionDefinitions).map((e) => [e.inputStart, e])), l = s.baseSyntax.macros.map((e) => v(e, c, n));
			s.syntax = {
				...s.baseSyntax,
				macros: l,
				nodes: b(s.baseSyntax, l)
			}, a.push(o);
		}
		return this.macroCatalog = n, a;
	}
};
function h() {
	return {
		bodies: /* @__PURE__ */ new Map(),
		definitions: /* @__PURE__ */ new Map(),
		expansionDefinitions: /* @__PURE__ */ new Map()
	};
}
function re(e, t) {
	let n = /* @__PURE__ */ new Set([
		...e.bodies.keys(),
		...e.definitions.keys(),
		...e.expansionDefinitions.keys(),
		...t.bodies.keys(),
		...t.definitions.keys(),
		...t.expansionDefinitions.keys()
	]);
	return new Set([...n].filter((n) => g(e, n) !== g(t, n)));
}
function g(e, t) {
	return JSON.stringify({
		body: e.bodies.get(t),
		definitions: e.definitions.get(t),
		expansion: e.expansionDefinitions.get(t)
	});
}
function ie(e) {
	let t = [...e], n = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set();
	for (let e of t) {
		_(i, a, X(e.input.content));
		for (let t of e.baseSyntax.macros) {
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
function _(e, t, n) {
	for (let [r, i] of n) e.has(r) ? (e.delete(r), t.add(r)) : t.has(r) || e.set(r, i);
}
function v(e, t, n) {
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
		...i === void 0 ? {} : { arguments: y(e, i.arguments) },
		expansion: a.status === "expanded" && i ? {
			...a,
			surface: i.surface,
			inputRange: {
				startOffset: i.inputStart,
				endOffset: i.inputEnd
			},
			...w(i.surface)
		} : a
	};
}
function y(e, t) {
	return t.map((t) => ({
		index: t.index,
		kind: t.kind,
		value: t.value,
		source: {
			fileId: e.source.fileId,
			path: e.source.path,
			range: {
				startOffset: t.inputStart,
				endOffset: t.inputEnd
			}
		}
	}));
}
function b(e, t) {
	let n = new Map(t.filter((e) => e.kind === "call" && e.expansion.status === "expanded" && e.expansion.surface !== void 0 && e.expansion.inputRange !== void 0).map((e) => [e.expansion.inputRange.startOffset, e]));
	return n.size === 0 ? e.nodes : e.nodes.map((t) => x(t, e, n));
}
function x(e, t, n) {
	let r = e.ranges.command?.startOffset;
	if (e.kind !== "command" || r === void 0) return e;
	let i = n.get(r), a = i?.expansion.surface;
	if (!i || a === void 0) return e;
	let o = C(a);
	if (!o) return e;
	let s = o.kind === "named-operator" && e.children.length === 0 ? [] : o.arguments;
	return S(s, e.children) ? ae(e, t, i, o, s) : e;
}
function S(e, t) {
	return e.length === 0 || t.length > 0 && e.length === t.length;
}
function ae(e, t, n, r, i) {
	let a = i.map((n, r) => ({
		...n,
		node: e.children[r],
		range: t.nodes[e.children[r]].ranges.full
	})), { name: o, text: s, arguments: c, mathClass: l, ...u } = e, { editable: ee, ...d } = e.ranges, f = e.provenance?.source ?? {
		fileId: t.fileId,
		path: t.path,
		range: e.ranges.full
	};
	return {
		...u,
		kind: r.kind,
		state: r.state,
		...r.name === void 0 ? {} : { name: r.name },
		...r.text === void 0 ? {} : { text: r.text },
		...r.mathClass === void 0 ? {} : { mathClass: r.mathClass },
		...a.length === 0 ? {} : { arguments: a },
		ranges: d,
		provenance: {
			origin: "expansion",
			source: f,
			callSite: f,
			definitions: n.definitions,
			editable: !1
		}
	};
}
function C(e) {
	let n = l({
		fileId: "generated",
		path: "generated",
		content: e
	}, t(e), [{
		delimiter: "generated",
		fullRange: {
			startOffset: 0,
			endOffset: e.length
		},
		contentRange: {
			startOffset: 0,
			endOffset: e.length
		},
		closed: !0
	}]), r = n.nodes[n.mathRoots[0].node];
	if (r.children.length !== 1) return null;
	let i = n.nodes[r.children[0]];
	return i.kind !== "token" && i.kind !== "modifier" && i.kind !== "style" && i.kind !== "named-operator" ? null : {
		kind: i.kind,
		state: i.state,
		arguments: i.arguments ?? [],
		...i.name === void 0 ? {} : { name: i.name },
		...i.text === void 0 ? {} : { text: i.text },
		...i.mathClass === void 0 ? {} : { mathClass: i.mathClass }
	};
}
function oe(e) {
	let n = l({
		fileId: "generated",
		path: "generated",
		content: e
	}, t(e), [{
		delimiter: "generated",
		fullRange: {
			startOffset: 0,
			endOffset: e.length
		},
		contentRange: {
			startOffset: 0,
			endOffset: e.length
		},
		closed: !0
	}]);
	return {
		nodes: n.nodes.map((e) => ({
			kind: e.kind,
			children: e.children,
			state: e.state,
			...e.name === void 0 ? {} : { name: e.name },
			...e.text === void 0 ? {} : { text: e.text },
			...e.arguments === void 0 ? {} : { arguments: e.arguments.map(({ node: e, role: t, syntax: n }) => ({
				node: e,
				role: t,
				syntax: n
			})) },
			...e.mathClass === void 0 ? {} : { mathClass: e.mathClass }
		})),
		root: n.mathRoots[0].node
	};
}
function w(e) {
	return C(e) ? {} : { notation: oe(e) };
}
function se(e) {
	let t = new m();
	return e && t.reset(e), t;
}
function ce(e, t, n, r) {
	let i = ue(e.content, t, e.language === "markdown"), a = i.filter((e) => !e.closed).map((e) => ({
		code: "unclosed-math",
		message: `Unclosed ${e.delimiter} math region`,
		severity: "warning",
		range: e.fullRange
	})), o = D(e, t, n, i, r);
	return {
		schemaVersion: 4,
		fileId: e.fileId,
		path: e.path,
		documentVersion: e.documentVersion,
		mathRegions: i,
		macros: be(e, n),
		includes: Te(e, n),
		diagnostics: a,
		...o
	};
}
var T = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5
}, E = /* @__PURE__ */ new Map([
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
function D(e, t, n, r, i) {
	let a = new Map(t.map((e) => [e.start, e]));
	return {
		...l(e, t, r, () => U(i)),
		visibleProse: k(e, t, r),
		scopes: P(e, t, a, n),
		declarations: B(e, t, a, n)
	};
}
function O(e, t) {
	return {
		fileId: e.fileId,
		path: e.path,
		range: t
	};
}
function k(e, t, n) {
	let r = [
		...q(t, e.content.length),
		...e.language === "markdown" ? K(e.content) : [],
		...n.map((e) => [e.fullRange.startOffset, e.fullRange.endOffset])
	];
	for (let n of t) if (n.type === "comment" || n.type === "verb" || n.type === "open" || n.type === "close") r.push([n.start, n.end]);
	else if (n.type === "command") {
		let t = E.get(n.value);
		r.push([n.start, t === void 0 ? n.end : A(e.content, n.end, t)]);
	}
	let i = [], a = 0;
	for (let [t, n] of M(r, e.content.length)) N(e.content, a, t, i), a = Math.max(a, n);
	return N(e.content, a, e.content.length, i), i;
}
function A(e, t, n) {
	let r = t;
	e[r] === "*" && r++;
	for (let t of n) {
		for (; /\s/.test(e[r] ?? "");) r++;
		let n = e[r];
		if (t === "optional") n === "[" && (r = j(e, r, "[", "]"));
		else {
			if (n !== "{") return r;
			r = j(e, r, "{", "}");
		}
	}
	return r;
}
function j(e, t, n, r) {
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
function M(e, t) {
	let n = e.map(([e, n]) => [Math.max(0, Math.min(e, t)), Math.max(0, Math.min(n, t))]).filter(([e, t]) => t > e).sort((e, t) => e[0] - t[0] || e[1] - t[1]), r = [];
	for (let [e, t] of n) {
		let n = r[r.length - 1];
		!n || e > n[1] ? r.push([e, t]) : n[1] = Math.max(n[1], t);
	}
	return r;
}
function N(e, t, n, r) {
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
function P(e, t, n, r) {
	let i = [{
		kind: "document",
		parent: null,
		range: {
			startOffset: 0,
			endOffset: e.content.length
		},
		state: "complete"
	}];
	return F(i, e, n, r), I(i, e, t), i;
}
function F(e, t, r, i) {
	let a = n(t.content), o = i.sections.map((e) => ({
		level: e.level,
		offset: V(a, e.location),
		name: e.title
	})).sort((e, t) => e.offset - t.offset), s = [];
	for (let n = 0; n < o.length; n++) {
		let i = o[n], a = t.content.length;
		for (let e = n + 1; e < o.length; e++) if (T[o[e].level] <= T[i.level]) {
			a = o[e].offset;
			break;
		}
		let c = 0;
		for (let e = n - 1; e >= 0; e--) if (T[o[e].level] < T[i.level]) {
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
			source: O(t, {
				startOffset: i.offset,
				endOffset: l?.end ?? i.offset
			})
		});
	}
}
function I(e, t, n) {
	let r = [];
	for (let i of n) {
		let n = G(t.content, i);
		if (!n) continue;
		if (n.kind === "begin") {
			let a = r[r.length - 1]?.index ?? z(e, i.start), o = e.length;
			e.push({
				kind: "environment",
				parent: a,
				range: {
					startOffset: i.start,
					endOffset: t.content.length
				},
				state: "incomplete",
				name: n.name,
				source: O(t, {
					startOffset: i.start,
					endOffset: n.end
				})
			}), r.push({
				index: o,
				name: n.name
			});
			continue;
		}
		let a = L(r, n.name);
		a < 0 || R(e, r, a, n.name, n.end);
	}
}
function L(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (e[n].name === t) return n;
	return -1;
}
function R(e, t, n, r, i) {
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
function z(e, t) {
	for (let n = e.length - 1; n > 0; n--) {
		let r = e[n];
		if (r.kind === "section" && r.range.startOffset <= t && t < r.range.endOffset) return n;
	}
	return 0;
}
function B(e, t, r, i) {
	let a = ee(e, t), o = new Set(a.filter((e) => e.kind === "macro" || e.kind === "operator" || e.kind === "paired-delimiter").map((e) => e.name)), s = n(e.content), c = (t) => {
		let n = V(s, t);
		return O(e, {
			startOffset: n,
			endOffset: r.get(n)?.end ?? n
		});
	}, l = (t, n) => {
		let r = V(s, t);
		return O(e, {
			startOffset: r,
			endOffset: r + n.length
		});
	};
	return [
		...i.classes.map((e) => ({
			kind: "class",
			name: e.name,
			options: e.options,
			source: c(e.location)
		})),
		...i.packages.map((e) => ({
			kind: "package",
			name: e.name,
			options: e.options,
			source: c(e.location)
		})),
		...i.commands.filter((e) => !o.has(e.name)).map((e) => ({
			kind: "macro",
			name: e.name,
			source: l(e.location, e.name)
		})),
		...i.environmentDefs.map((e) => ({
			kind: "environment",
			name: e.name,
			source: c(e.location)
		})),
		...a
	];
}
function V(e, t) {
	return (e[t.line - 1] ?? 0) + t.column - 1;
}
function H(e) {
	return ne.encode(JSON.stringify(e)).byteLength;
}
function U(e) {
	if (e?.isCancellationRequested) throw new p("Syntax update cancelled");
}
function W(e) {
	return e.reduce((e, t) => e + H(t), 0);
}
function le(e) {
	return e.kind === "error" || e.state === "incomplete" || e.state === "ambiguous" || e.state === "cyclic" || e.state === "truncated";
}
function ue(e, t, n) {
	let r = [...q(t, e.length), ...n ? K(e) : []], i = t.filter((e) => e.type !== "comment" && e.type !== "verb" && !Y(e.start, r)), a = [], o = null;
	for (let t of i) {
		let n = de(e, t);
		n && (!o && n.kind !== "close" ? o = {
			delimiter: n.delimiter,
			close: n.close,
			fullStart: t.start,
			contentStart: n.fullEnd
		} : o && n.kind !== "open" && n.close === o.close && (a.push(fe(o, t.start, n.fullEnd)), o = null));
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
function de(e, t) {
	let n = G(e, t);
	if (n && te.has(n.name)) return {
		kind: n.kind === "begin" ? "open" : "close",
		delimiter: `\\begin{${n.name}}`,
		close: `env:${n.name}`,
		fullEnd: n.end
	};
	let r = pe(t);
	return r ? {
		...r,
		fullEnd: t.end
	} : null;
}
function fe(e, t, n) {
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
function pe(e) {
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
function G(e, t) {
	if (t.type !== "command" || t.value !== "begin" && t.value !== "end") return null;
	let n = /^\s*\{([^{}]+)\}/.exec(e.slice(t.end));
	return n ? {
		kind: t.value,
		name: n[1],
		end: t.end + n[0].length
	} : null;
}
function K(e) {
	let t = me(e);
	t.push(...he(e), ...ge(e));
	for (let [n, r] of _e(e)) {
		let e = null;
		for (let i of r.matchAll(/`+/g)) {
			let r = n + i.index;
			if (Y(r, t)) continue;
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
function me(e) {
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
function he(e) {
	if (!/^(?:---|\+\+\+)\s*(?:\r?\n|$)/.test(e)) return [];
	let t = /^(?:---|\.\.\.|\+\+\+)\s*$/gm;
	t.lastIndex = e.indexOf("\n") + 1;
	let n = t.exec(e);
	return [[0, n ? n.index + n[0].length : e.length]];
}
function ge(e) {
	return [...e.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((e) => [e.index, e.index + e[0].length]);
}
function _e(e) {
	let t = [], n = 0;
	for (let r of e.split("\n")) t.push([n, r]), n += r.length + 1;
	return t;
}
function q(e, t) {
	let n = [], r = [];
	for (let t of e) t.type === "command" && J(t, r, n);
	for (let e of r) e.falseStart >= 0 && n.push([e.falseStart, t]);
	return n;
}
function J(e, t, n) {
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
		ve(t[t.length - 1], e, n);
		return;
	}
	if (e.value === "fi") {
		ye(t.pop(), e, n);
		return;
	}
	e.value.startsWith("if") && e.value !== "iff" && t.push({
		falseStart: -1,
		kind: "other",
		sawElse: !1
	});
}
function ve(e, t, n) {
	!e || e.sawElse || (e.sawElse = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function ye(e, t, n) {
	e && (e.kind === "false" && !e.sawElse || e.kind === "true" && e.sawElse) && n.push([e.falseStart, t.start]);
}
function Y(e, t) {
	return t.some(([t, n]) => t <= e && e < n);
}
function be(e, t) {
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
					},
					...w(e.surface)
				} : r
			});
		}
	}
	return c.sort((e, t) => e.source.range.startOffset - t.source.range.startOffset);
}
var xe = 4, Se = RegExp(`\\\\(?:${e}|DeclareMathOperator)\\*?\\{\\\\([a-zA-Z@]+)\\}(?:\\[\\d+\\])?(?:\\[[^\\]]*\\])?\\s*\\{`, "g"), Ce = /\\def\\([a-zA-Z@]+)(?:#\d)*\s*\{/g;
function X(e) {
	let t = /* @__PURE__ */ new Map(), n = (n) => {
		for (let r of e.matchAll(n)) {
			let n = we(e, r.index + r[0].length - 1);
			n !== null && t.set(r[1], { body: n });
		}
	};
	return n(Se), n(Ce), t;
}
function we(e, t) {
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
	if (r >= xe) return {
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
function Te(e, t) {
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
export { d as LATEX_SYNTAX_SCHEMA_VERSION, p as LatexSyntaxCancelledError, m as LatexSyntaxService, s as MATH_COMMAND_SPECS, f as assertLatexSyntaxSchemaVersion, se as createLatexSyntaxService, u as findLatexNotationPath, c as getMathCommandSpec };
