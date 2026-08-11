import { CITE_CMDS as e, NEWCMD_CMDS as t } from "./lsp/latex-patterns.js";
import { tokenize as n } from "./lsp/latex-tokenizer.js";
import { buildLineStarts as r } from "./lsp/source-position.js";
import { collectUserMacroDefinitions as i, expandUserMacroCalls as a, parseLatexFile as o } from "./lsp/latex-parser.js";
import { ProjectIndex as s } from "./lsp/project-index.js";
import { MATH_COMMAND_SPECS as c, getMathCommandSpec as l } from "./math-command-spec.js";
import { buildNotationCst as u, findLatexNotationPath as d } from "./notation-cst.js";
import { collectRichStructuralDeclarations as ee } from "./structural-declarations.js";
import { LATEX_SYNTAX_SCHEMA_VERSION as f, assertLatexSyntaxSchemaVersion as p } from "./syntax-contract.js";
//#region src/syntax.ts
var m = class extends Error {
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
]), ne = new TextEncoder(), h = class {
	files = /* @__PURE__ */ new Map();
	index = new s();
	macroCatalog = re();
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
	upsert(e, t) {
		let r = {
			...e,
			language: e.language ?? (/\.(?:md|markdown)$/iu.test(e.path) ? "markdown" : "latex")
		}, i = this.files.get(e.fileId);
		H(t), this.parseCount++;
		let a = n(r.content);
		H(t);
		let s = o(r.content, r.path, a);
		H(t);
		let c = fe(r, a, s, t);
		return H(t), i && i.input.language !== "markdown" && (i.input.path !== r.path || r.language === "markdown") && this.index.removeFile(i.input.path), r.language !== "markdown" && this.index.updateFileSymbols(r.path, s), this.files.set(r.fileId, {
			input: r,
			baseSyntax: c,
			syntax: c
		}), this.relinkDeferred || (this.lastTransferFileIds = this.refreshMacroDefinitions(/* @__PURE__ */ new Set([r.fileId]))), this.files.get(e.fileId).syntax;
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
			recoveredNodes: e.reduce((e, t) => e + t.nodes.filter(ye).length, 0),
			snapshotBytes: U(e),
			lastInvalidatedDocuments: this.lastTransferFileIds.length,
			lastTransferBytes: U(t)
		};
	}
	refreshMacroDefinitions(e = /* @__PURE__ */ new Set(), t = !1) {
		let n = _(this.files.values()), r = ie(this.macroCatalog, n), i = [];
		for (let [o, s] of this.files) {
			if (!t && !e.has(o) && (r.size === 0 || !s.baseSyntax.macros.some((e) => r.has(e.name)))) continue;
			let c = new Map(a(s.input.content, n.expansionDefinitions).map((e) => [e.inputStart, e])), l = s.baseSyntax.macros.map((e) => y(e, c, n));
			s.syntax = {
				...s.baseSyntax,
				macros: l,
				nodes: ae(s.baseSyntax, l)
			}, i.push(o);
		}
		return this.macroCatalog = n, i;
	}
};
function re() {
	return {
		bodies: /* @__PURE__ */ new Map(),
		definitions: /* @__PURE__ */ new Map(),
		expansionDefinitions: /* @__PURE__ */ new Map()
	};
}
function ie(e, t) {
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
function _(e) {
	let t = [...e], n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set();
	for (let e of t) {
		v(r, a, X(e.input.content));
		for (let t of e.baseSyntax.macros) {
			if (t.kind !== "definition") continue;
			let e = n.get(t.name);
			e ? e.push(t.source) : n.set(t.name, [t.source]);
		}
	}
	return {
		bodies: r,
		definitions: n,
		expansionDefinitions: i(t.map((e) => e.input.content))
	};
}
function v(e, t, n) {
	for (let [r, i] of n) e.has(r) ? (e.delete(r), t.add(r)) : t.has(r) || e.set(r, i);
}
function y(e, t, n) {
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
		...i === void 0 ? {} : { arguments: b(e, i.arguments) },
		expansion: a.status === "expanded" && i ? {
			...a,
			surface: i.surface,
			inputRange: {
				startOffset: i.inputStart,
				endOffset: i.inputEnd
			},
			...x(i.surface)
		} : a
	};
}
function b(e, t) {
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
function ae(e, t) {
	let n = new Map(t.filter((e) => e.kind === "call" && e.expansion.status === "expanded" && e.expansion.surface !== void 0 && e.expansion.inputRange !== void 0).map((e) => [e.expansion.inputRange.startOffset, e]));
	return n.size === 0 ? e.nodes : e.nodes.map((t) => oe(t, e, n));
}
function oe(e, t, n) {
	let r = e.ranges.command?.startOffset;
	if (e.kind !== "command" || r === void 0) return e;
	let i = n.get(r), a = i?.expansion.surface;
	if (!i || a === void 0 || i.expansion.notation) return e;
	let o = le(a);
	if (!o) return e;
	let s = o.kind === "named-operator" && e.children.length === 0 ? [] : o.arguments;
	return se(s, e.children) ? ce(e, t, i, o, s) : e;
}
function se(e, t) {
	return e.length === 0 || t.length > 0 && e.length === t.length;
}
function ce(e, t, n, r, i) {
	let a = i.map((n, r) => ({
		...n,
		node: e.children[r],
		range: t.nodes[e.children[r]].ranges.full
	})), { name: o, text: s, arguments: c, lexicalClass: l, mathClass: u, ...d } = e, { editable: ee, ...f } = e.ranges, p = e.provenance?.source ?? {
		fileId: t.fileId,
		path: t.path,
		range: e.ranges.full
	};
	return {
		...d,
		kind: r.kind,
		state: r.state,
		...r.name === void 0 ? {} : { name: r.name },
		...r.text === void 0 ? {} : { text: r.text },
		...r.lexicalClass === void 0 ? {} : { lexicalClass: r.lexicalClass },
		...r.mathClass === void 0 ? {} : { mathClass: r.mathClass },
		...a.length === 0 ? {} : { arguments: a },
		ranges: f,
		provenance: {
			origin: "expansion",
			source: p,
			callSite: p,
			definitions: n.definitions,
			editable: !1
		}
	};
}
function le(e) {
	let t = u({
		fileId: "generated",
		path: "generated",
		content: e
	}, n(e), [{
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
	}]), r = t.nodes[t.mathRoots[0].node];
	if (r.children.length !== 1) return null;
	let i = t.nodes[r.children[0]];
	return i.kind !== "token" && i.kind !== "modifier" && i.kind !== "style" && i.kind !== "named-operator" ? null : {
		kind: i.kind,
		state: i.state,
		arguments: i.arguments ?? [],
		...i.name === void 0 ? {} : { name: i.name },
		...i.text === void 0 ? {} : { text: i.text },
		...i.lexicalClass === void 0 ? {} : { lexicalClass: i.lexicalClass },
		...i.mathClass === void 0 ? {} : { mathClass: i.mathClass }
	};
}
function ue(e) {
	let t = u({
		fileId: "generated",
		path: "generated",
		content: e
	}, n(e), [{
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
		nodes: t.nodes.map((e) => ({
			kind: e.kind,
			children: e.children,
			state: e.state,
			...e.name === void 0 ? {} : { name: e.name },
			...e.text === void 0 ? {} : { text: e.text },
			...e.lexicalClass === void 0 ? {} : { lexicalClass: e.lexicalClass },
			...e.arguments === void 0 ? {} : { arguments: e.arguments.map(({ node: e, role: t, syntax: n }) => ({
				node: e,
				role: t,
				syntax: n
			})) },
			...e.mathClass === void 0 ? {} : { mathClass: e.mathClass }
		})),
		root: t.mathRoots[0].node
	};
}
function x(e) {
	let t = ue(e), n = t.nodes[t.root], r = n?.children.length === 1 ? t.nodes[n.children[0]] : void 0;
	return r && [
		"token",
		"modifier",
		"style",
		"named-operator"
	].includes(r.kind) ? {} : { notation: t };
}
function de(e) {
	let t = new h();
	return e && t.reset(e), t;
}
function fe(e, t, n, r) {
	let i = be(e.content, t, e.language === "markdown"), a = i.filter((e) => !e.closed).map((e) => ({
		code: "unclosed-math",
		message: `Unclosed ${e.delimiter} math region`,
		severity: "warning",
		range: e.fullRange
	})), o = pe(e, t, n, i, r);
	return {
		schemaVersion: 6,
		fileId: e.fileId,
		path: e.path,
		documentVersion: e.documentVersion,
		mathRegions: i,
		macros: Ae(e, n),
		includes: Pe(e, n),
		diagnostics: a,
		...o
	};
}
var S = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5
}, C = /* @__PURE__ */ new Map([
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
]), w = new Set(e.split("|")), T = [
	"optional",
	"optional",
	"required"
];
for (let e of w) C.set(e, T);
function pe(e, t, n, r, i) {
	let a = new Map(t.map((e) => [e.start, e]));
	return {
		...u(e, t, r, () => H(i)),
		visibleProse: D(e, t, r),
		proseAnnotations: j(e, t),
		scopes: P(e, t, a, n),
		declarations: _e(e, t, a, n)
	};
}
function E(e, t) {
	return {
		fileId: e.fileId,
		path: e.path,
		range: t
	};
}
function D(e, t, n) {
	let r = [
		...q(t, e.content.length),
		...e.language === "markdown" ? G(e.content) : [],
		...n.map((e) => [e.fullRange.startOffset, e.fullRange.endOffset])
	];
	for (let n of t) if (n.type === "comment" || n.type === "verb" || n.type === "open" || n.type === "close") r.push([n.start, n.end]);
	else if (n.type === "command") {
		let t = C.get(n.value);
		r.push([n.start, t === void 0 ? n.end : O(e.content, n.end, t).end]);
	}
	let i = [], a = 0;
	for (let [t, n] of M(r, e.content.length)) N(e.content, a, t, i), a = Math.max(a, n);
	return N(e.content, a, e.content.length, i), i;
}
function O(e, t, n) {
	let r = t;
	e[r] === "*" && r++;
	for (let t of n) {
		for (; /\s/.test(e[r] ?? "");) r++;
		let n = k(e, r, t);
		if (n !== null && (r = n.end, !n.complete)) return n;
	}
	return {
		end: r,
		complete: !0
	};
}
function k(e, t, n) {
	return n === "optional" ? e[t] === "[" ? A(e, t, "[", "]") : null : e[t] === "{" ? A(e, t, "{", "}") : {
		end: t,
		complete: !1
	};
}
function A(e, t, n, r) {
	let i = 0;
	for (let a = t; a < e.length; a++) {
		if (e[a] === "\\") {
			a++;
			continue;
		}
		if (e[a] === n) i++;
		else if (e[a] === r && --i === 0) return {
			end: a + 1,
			complete: !0
		};
	}
	return {
		end: e.length,
		complete: !1
	};
}
function j(e, t) {
	let n = [];
	for (let r of t) {
		if (r.type !== "command" || !w.has(r.value)) continue;
		let t = O(e.content, r.end, T);
		n.push({
			kind: "citation",
			name: r.value,
			range: {
				startOffset: r.start,
				endOffset: t.end
			},
			state: t.complete ? "complete" : "incomplete"
		});
	}
	return n;
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
	return e.language === "markdown" ? F(i, e) : z(i, e, n, r), B(i, e, t), i;
}
function F(e, t) {
	let n = I(t.content), r = [];
	for (let i = 0; i < n.length; i++) {
		let a = n[i], o = n.slice(i + 1).find((e) => e.depth <= a.depth)?.start ?? t.content.length, s = 0;
		for (let e = i - 1; e >= 0; e--) if (n[e].depth < a.depth) {
			s = r[e];
			break;
		}
		r.push(e.length), e.push({
			kind: "section",
			parent: s,
			range: {
				startOffset: a.start,
				endOffset: o
			},
			state: "complete",
			name: a.name,
			source: E(t, {
				startOffset: a.start,
				endOffset: a.sourceEnd
			})
		});
	}
}
function I(e) {
	let t = G(e), n = K(e), r = [];
	for (let e = 0; e < n.length; e++) {
		let [i, a] = n[e];
		if (J(i, t)) continue;
		let o = L(a);
		if (o) {
			r.push({
				depth: o.depth,
				name: o.name,
				sourceEnd: i + a.length,
				start: i
			});
			continue;
		}
		let s = R(a), c = n[e - 1];
		!s || !c || J(c[0], t) || !c[1].trim() || r.push({
			depth: s,
			name: c[1].trim(),
			sourceEnd: i + a.length,
			start: c[0]
		});
	}
	return r;
}
function L(e) {
	let t = 0;
	for (; t < e.length && e[t] === " ";) t++;
	if (t > 3) return null;
	let n = t;
	for (; t < e.length && e[t] === "#" && t - n < 6;) t++;
	let r = t - n;
	if (r === 0 || e[t] === "#" || e[t] !== void 0 && !/[ \t]/.test(e[t])) return null;
	let i = e.slice(t).trim(), a = i.length;
	for (; a > 0 && i[a - 1] === "#";) a--;
	return a < i.length && a > 0 && /[ \t]/.test(i[a - 1]) && (i = i.slice(0, a).trimEnd()), {
		depth: r,
		name: i
	};
}
function R(e) {
	let t = 0;
	for (; t < e.length && e[t] === " ";) t++;
	if (t > 3 || e[t] !== "=" && e[t] !== "-") return null;
	let n = e[t], r = 0;
	for (; t < e.length && e[t] === n;) r++, t++;
	if (r === 0) return null;
	for (; t < e.length && (e[t] === " " || e[t] === "	");) t++;
	return t === e.length ? n === "=" ? 1 : 2 : null;
}
function z(e, t, n, i) {
	let a = r(t.content), o = i.sections.map((e) => ({
		level: e.level,
		offset: V(a, e.location),
		name: e.title
	})).sort((e, t) => e.offset - t.offset), s = [];
	for (let r = 0; r < o.length; r++) {
		let i = o[r], a = t.content.length;
		for (let e = r + 1; e < o.length; e++) if (S[o[e].level] <= S[i.level]) {
			a = o[e].offset;
			break;
		}
		let c = 0;
		for (let e = r - 1; e >= 0; e--) if (S[o[e].level] < S[i.level]) {
			c = s[e];
			break;
		}
		let l = n.get(i.offset);
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
			source: E(t, {
				startOffset: i.offset,
				endOffset: l?.end ?? i.offset
			})
		});
	}
}
function B(e, t, n) {
	let r = [];
	for (let i of n) {
		let n = W(t.content, i);
		if (!n) continue;
		if (n.kind === "begin") {
			let a = r[r.length - 1]?.index ?? ge(e, i.start), o = e.length;
			e.push({
				kind: "environment",
				parent: a,
				range: {
					startOffset: i.start,
					endOffset: t.content.length
				},
				state: "incomplete",
				name: n.name,
				source: E(t, {
					startOffset: i.start,
					endOffset: n.end
				})
			}), r.push({
				index: o,
				name: n.name
			});
			continue;
		}
		let a = me(r, n.name);
		a < 0 || he(e, r, a, n.name, n.end);
	}
}
function me(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (e[n].name === t) return n;
	return -1;
}
function he(e, t, n, r, i) {
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
function ge(e, t) {
	for (let n = e.length - 1; n > 0; n--) {
		let r = e[n];
		if (r.kind === "section" && r.range.startOffset <= t && t < r.range.endOffset) return n;
	}
	return 0;
}
function _e(e, t, n, i) {
	let a = ee(e, t), o = new Set(a.filter((e) => e.kind === "macro" || e.kind === "operator" || e.kind === "paired-delimiter").map((e) => e.name)), s = r(e.content), c = (t) => {
		let r = V(s, t);
		return E(e, {
			startOffset: r,
			endOffset: n.get(r)?.end ?? r
		});
	}, l = (t, n) => {
		let r = V(s, t);
		return E(e, {
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
function ve(e) {
	return ne.encode(JSON.stringify(e)).byteLength;
}
function H(e) {
	if (e?.isCancellationRequested) throw new m("Syntax update cancelled");
}
function U(e) {
	return e.reduce((e, t) => e + ve(t), 0);
}
function ye(e) {
	return e.kind === "error" || e.state === "incomplete" || e.state === "ambiguous" || e.state === "cyclic" || e.state === "truncated";
}
function be(e, t, n) {
	let r = [...q(t, e.length), ...n ? G(e) : []], i = t.filter((e) => e.type !== "comment" && e.type !== "verb" && !J(e.start, r)), a = [], o = null;
	for (let t of i) {
		let n = xe(e, t);
		n && (!o && n.kind !== "close" ? o = {
			delimiter: n.delimiter,
			close: n.close,
			fullStart: t.start,
			contentStart: n.fullEnd
		} : o && n.kind !== "open" && n.close === o.close && (a.push(Se(o, t.start, n.fullEnd)), o = null));
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
function xe(e, t) {
	let n = W(e, t);
	if (n && te.has(n.name)) return {
		kind: n.kind === "begin" ? "open" : "close",
		delimiter: `\\begin{${n.name}}`,
		close: `env:${n.name}`,
		fullEnd: n.end
	};
	let r = Ce(t);
	return r ? {
		...r,
		fullEnd: t.end
	} : null;
}
function Se(e, t, n) {
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
function Ce(e) {
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
function W(e, t) {
	if (t.type !== "command" || t.value !== "begin" && t.value !== "end") return null;
	let n = /^\s*\{([^{}]+)\}/.exec(e.slice(t.end));
	return n ? {
		kind: t.value,
		name: n[1],
		end: t.end + n[0].length
	} : null;
}
function G(e) {
	let t = we(e);
	t.push(...Te(e), ...Ee(e));
	for (let [n, r] of K(e)) {
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
function we(e) {
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
function Te(e) {
	if (!/^(?:---|\+\+\+)\s*(?:\r?\n|$)/.test(e)) return [];
	let t = /^(?:---|\.\.\.|\+\+\+)\s*$/gm;
	t.lastIndex = e.indexOf("\n") + 1;
	let n = t.exec(e);
	return [[0, n ? n.index + n[0].length : e.length]];
}
function Ee(e) {
	return [...e.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((e) => [e.index, e.index + e[0].length]);
}
function K(e) {
	let t = [], n = 0;
	for (let r of e.split("\n")) t.push([n, r]), n += r.length + 1;
	return t;
}
function q(e, t) {
	let n = [], r = [];
	for (let t of e) t.type === "command" && De(t, r, n);
	for (let e of r) e.falseStart >= 0 && n.push([e.falseStart, t]);
	return n;
}
function De(e, t, n) {
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
		Oe(t[t.length - 1], e, n);
		return;
	}
	if (e.value === "fi") {
		ke(t.pop(), e, n);
		return;
	}
	e.value.startsWith("if") && e.value !== "iff" && t.push({
		falseStart: -1,
		kind: "other",
		sawElse: !1
	});
}
function Oe(e, t, n) {
	!e || e.sawElse || (e.sawElse = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function ke(e, t, n) {
	e && (e.kind === "false" && !e.sawElse || e.kind === "true" && e.sawElse) && n.push([e.falseStart, t.start]);
}
function J(e, t) {
	return t.some(([t, n]) => t <= e && e < n);
}
function Ae(e, t) {
	let n = r(e.content), i = X(e.content), o = new Map(a(e.content).map((e) => [e.inputStart, e])), s = /* @__PURE__ */ new Map();
	for (let r of t.commands) {
		let t = $(e, n, r.location, r.name.length), i = s.get(r.name);
		i ? i.push(t) : s.set(r.name, [t]);
	}
	let c = t.commands.map((t) => ({
		kind: "definition",
		name: t.name,
		source: $(e, n, t.location, t.name.length),
		definitions: s.get(t.name) ?? [],
		expansion: {
			status: "not-applicable",
			depth: 0,
			editable: !0
		}
	}));
	for (let r of t.commandUses) {
		let t = $(e, n, r.location, r.name.length);
		if (!(s.get(r.name) ?? []).some((e) => e.range.startOffset === t.range.startOffset)) {
			let e = o.get(t.range.startOffset - 1), n = Z(r.name, i);
			c.push({
				kind: "call",
				name: r.name,
				source: t,
				definitions: s.get(r.name) ?? [],
				expansion: n.status === "expanded" && e ? {
					...n,
					surface: e.surface,
					inputRange: {
						startOffset: e.inputStart,
						endOffset: e.inputEnd
					},
					...x(e.surface)
				} : n
			});
		}
	}
	return c.sort((e, t) => e.source.range.startOffset - t.source.range.startOffset);
}
var je = 4, Y = RegExp(`\\\\(?:${t}|DeclareMathOperator)\\*?\\{\\\\([a-zA-Z@]+)\\}(?:\\[\\d+\\])?(?:\\[[^\\]]*\\])?\\s*\\{`, "g"), Me = /\\def\\([a-zA-Z@]+)(?:#\d)*\s*\{/g;
function X(e) {
	let t = /* @__PURE__ */ new Map(), n = (n) => {
		for (let r of e.matchAll(n)) {
			let n = Ne(e, r.index + r[0].length - 1);
			n !== null && t.set(r[1], { body: n });
		}
	};
	return n(Y), n(Me), t;
}
function Ne(e, t) {
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
	if (r >= je) return {
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
function Pe(e, t) {
	let n = r(e.content);
	return t.includes.map((t) => ({
		path: t.path,
		type: t.type,
		source: $(e, n, t.location, t.path.length)
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
export { f as LATEX_SYNTAX_SCHEMA_VERSION, m as LatexSyntaxCancelledError, h as LatexSyntaxService, c as MATH_COMMAND_SPECS, p as assertLatexSyntaxSchemaVersion, de as createLatexSyntaxService, d as findLatexNotationPath, l as getMathCommandSpec };
