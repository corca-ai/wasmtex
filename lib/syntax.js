import { CITE_CMDS as e, NEWCMD_CMDS as t } from "./lsp/latex-patterns.js";
import { tokenize as n } from "./lsp/latex-tokenizer.js";
import { buildLineStarts as r } from "./lsp/source-position.js";
import { collectUserMacroDefinitions as i, expandUserMacroCalls as a, macroDefinitionSpansFromTokens as o, maskSpansFromTokens as s, parseLatexFile as c } from "./lsp/latex-parser.js";
import { ProjectIndex as l } from "./lsp/project-index.js";
import { MATH_COMMAND_SPECS as ee, getMathCommandSpec as u } from "./math-command-spec.js";
import { buildNotationCst as d, findLatexNotationPath as f } from "./notation-cst.js";
import { collectRichStructuralDeclarations as p } from "./structural-declarations.js";
import { LATEX_SYNTAX_SCHEMA_VERSION as te, assertLatexSyntaxSchemaVersion as ne } from "./syntax-contract.js";
//#region src/syntax.ts
var m = class extends Error {
	name = "LatexSyntaxCancelledError";
}, re = /* @__PURE__ */ new Set([
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
]), ie = new TextEncoder(), h = class {
	files = /* @__PURE__ */ new Map();
	index = new l();
	macroCatalog = ae();
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
		U(t), this.parseCount++;
		let a = n(r.content);
		U(t);
		let o = c(r.content, r.path, a);
		U(t);
		let s = ge(r, a, o, t);
		return U(t), i && i.input.language !== "markdown" && (i.input.path !== r.path || r.language === "markdown") && this.index.removeFile(i.input.path), r.language !== "markdown" && this.index.updateFileSymbols(r.path, o), this.files.set(r.fileId, {
			input: r,
			baseSyntax: s,
			syntax: s
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
			recoveredNodes: e.reduce((e, t) => e + t.nodes.filter(Xe).length, 0),
			snapshotBytes: W(e),
			lastInvalidatedDocuments: this.lastTransferFileIds.length,
			lastTransferBytes: W(t)
		};
	}
	refreshMacroDefinitions(e = /* @__PURE__ */ new Set(), t = !1) {
		let n = se(this.files.values()), r = oe(this.macroCatalog, n), i = [];
		for (let [o, s] of this.files) {
			if (!t && !e.has(o) && (r.size === 0 || !s.baseSyntax.macros.some((e) => r.has(e.name)))) continue;
			let c = new Map(a(s.input.content, n.expansionDefinitions).map((e) => [e.inputStart, e])), l = s.baseSyntax.macros.map((e) => v(e, c, n));
			s.syntax = {
				...s.baseSyntax,
				macros: l,
				nodes: le(s.baseSyntax, l)
			}, i.push(o);
		}
		return this.macroCatalog = n, i;
	}
};
function ae() {
	return {
		bodies: /* @__PURE__ */ new Map(),
		definitions: /* @__PURE__ */ new Map(),
		expansionDefinitions: /* @__PURE__ */ new Map()
	};
}
function oe(e, t) {
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
function se(e) {
	let t = [...e], n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set();
	for (let e of t) {
		_(r, a, X(e.input.content));
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
		...i === void 0 ? {} : { arguments: ce(e, i.arguments) },
		expansion: a.status === "expanded" && i ? {
			...a,
			surface: i.surface,
			inputRange: {
				startOffset: i.inputStart,
				endOffset: i.inputEnd
			},
			...y(i.surface)
		} : a
	};
}
function ce(e, t) {
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
function le(e, t) {
	let n = new Map(t.filter((e) => e.kind === "call" && e.expansion.status === "expanded" && e.expansion.surface !== void 0 && e.expansion.inputRange !== void 0).map((e) => [e.expansion.inputRange.startOffset, e]));
	return n.size === 0 ? e.nodes : e.nodes.map((t) => ue(t, e, n));
}
function ue(e, t, n) {
	let r = e.ranges.command?.startOffset;
	if (e.kind !== "command" || r === void 0) return e;
	let i = n.get(r), a = i?.expansion.surface;
	if (!i || a === void 0 || i.expansion.notation) return e;
	let o = pe(a);
	if (!o) return e;
	let s = o.kind === "named-operator" && e.children.length === 0 ? [] : o.arguments;
	return de(s, e.children) ? fe(e, t, i, o, s) : e;
}
function de(e, t) {
	return e.length === 0 || t.length > 0 && e.length === t.length;
}
function fe(e, t, n, r, i) {
	let a = i.map((n, r) => ({
		...n,
		node: e.children[r],
		range: t.nodes[e.children[r]].ranges.full
	})), { name: o, text: s, arguments: c, lexicalClass: l, mathClass: ee, ...u } = e, { editable: d, ...f } = e.ranges, p = e.provenance?.source ?? {
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
function pe(e) {
	let t = d({
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
function me(e) {
	let t = d({
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
function y(e) {
	let t = me(e), n = t.nodes[t.root], r = n?.children.length === 1 ? t.nodes[n.children[0]] : void 0;
	return r && [
		"token",
		"modifier",
		"style",
		"named-operator"
	].includes(r.kind) ? {} : { notation: t };
}
function he(e) {
	let t = new h();
	return e && t.reset(e), t;
}
function ge(e, t, n, r) {
	let i = Ze(e.content, t, e.language === "markdown"), a = i.filter((e) => !e.closed).map((e) => ({
		code: "unclosed-math",
		message: `Unclosed ${e.delimiter} math region`,
		severity: "warning",
		range: e.fullRange
	})), o = _e(e, t, n, i, r);
	return {
		schemaVersion: 8,
		fileId: e.fileId,
		path: e.path,
		documentVersion: e.documentVersion,
		mathRegions: i,
		macros: rt(e, n),
		includes: ct(e, n),
		diagnostics: a,
		...o
	};
}
var b = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5
}, x = /* @__PURE__ */ new Map([
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
]), S = new Set(e.split("|")), C = [
	"optional",
	"optional",
	"required"
], w = /* @__PURE__ */ new Set([
	"title",
	"author",
	"keywords"
]);
for (let e of S) x.set(e, C);
for (let e of w) x.set(e, ["required"]);
function _e(e, t, n, r, i) {
	let a = new Map(t.map((e) => [e.start, e])), o = d(e, t, r, () => U(i)), s = ve(e, t, r), c = P(e, t, a, n), l = Je(e, t, a, n);
	return {
		...o,
		visibleProse: s,
		proseAnnotations: k(e, t),
		scopes: c,
		blocks: ke(e, t, r, s, c, l),
		declarations: l
	};
}
function T(e, t) {
	return {
		fileId: e.fileId,
		path: e.path,
		range: t
	};
}
function ve(e, t, n) {
	let r = [
		...s([...t]),
		...e.language === "markdown" ? K(e.content) : [],
		...n.map((e) => [e.fullRange.startOffset, e.fullRange.endOffset])
	];
	for (let n of t) if (n.type === "comment" || n.type === "verb" || n.type === "open" || n.type === "close") r.push([n.start, n.end]);
	else if (n.type === "command") {
		let t = x.get(n.value);
		r.push([n.start, t === void 0 ? n.end : E(e.content, n.end, t).end]);
	}
	let i = [], a = 0;
	for (let [t, n] of M(r, e.content.length)) N(e.content, a, t, i), a = Math.max(a, n);
	return N(e.content, a, e.content.length, i), i;
}
function E(e, t, n) {
	let r = t;
	e[r] === "*" && r++;
	for (let t of n) {
		for (; /\s/.test(e[r] ?? "");) r++;
		let n = D(e, r, t);
		if (n !== null && (r = n.end, !n.complete)) return n;
	}
	return {
		end: r,
		complete: !0
	};
}
function D(e, t, n) {
	return n === "optional" ? e[t] === "[" ? O(e, t, "[", "]") : null : e[t] === "{" ? O(e, t, "{", "}") : {
		end: t,
		complete: !1
	};
}
function O(e, t, n, r) {
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
function k(e, t) {
	let n = [];
	for (let r of t) if (r.type === "command") {
		if (S.has(r.value)) {
			let t = E(e.content, r.end, C);
			n.push({
				kind: "citation",
				name: r.value,
				range: {
					startOffset: r.start,
					endOffset: t.end
				},
				state: t.complete ? "complete" : "incomplete"
			});
			continue;
		}
		A(r.value) && n.push(j(e, r));
	}
	return n;
}
function A(e) {
	return w.has(e);
}
function j(e, t) {
	let n = t.end;
	for (; /\s/.test(e.content[n] ?? "");) n++;
	if (e.content[n] !== "{") return {
		kind: "document-field",
		name: t.value,
		range: {
			startOffset: t.start,
			endOffset: t.end
		},
		state: "incomplete"
	};
	let r = O(e.content, n, "{", "}");
	return {
		kind: "document-field",
		name: t.value,
		range: {
			startOffset: t.start,
			endOffset: r.end
		},
		valueRange: {
			startOffset: n + 1,
			endOffset: Math.max(n + 1, r.end - +!!r.complete)
		},
		state: r.complete ? "complete" : "incomplete"
	};
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
	e.language === "markdown" ? be(i, e) : we(i, e, n, r);
	let a = [...o(e.content, t), ...s([...t])];
	return Te(i, e, t.filter((e) => !Y(e.start, a))), F(i);
}
function F(e) {
	let t = e.map((t) => {
		if (t.kind !== "section") return t;
		let n = t.range.endOffset;
		for (let r of e) r.kind === "environment" && r.state === "complete" && r.range.startOffset < t.range.startOffset && t.range.startOffset < r.range.endOffset && (n = Math.min(n, r.range.endOffset));
		return {
			...t,
			range: {
				...t.range,
				endOffset: n
			}
		};
	});
	return t.map((e, n) => {
		if (n === 0) return e;
		let r = 0, i = t[0].range.endOffset - t[0].range.startOffset;
		for (let a = 1; a < t.length; a++) {
			if (a === n) continue;
			let o = t[a].range;
			if (!ye(o, e.range, a < n)) continue;
			let s = o.endOffset - o.startOffset;
			s <= i && (r = a, i = s);
		}
		return {
			...e,
			parent: r
		};
	});
}
function ye(e, t, n) {
	return e.startOffset <= t.startOffset && e.endOffset >= t.endOffset && (n || e.startOffset < t.startOffset || e.endOffset > t.endOffset);
}
function be(e, t) {
	let n = xe(t.content), r = [];
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
			source: T(t, {
				startOffset: a.start,
				endOffset: a.sourceEnd
			})
		});
	}
}
function xe(e) {
	let t = K(e), n = J(e), r = [];
	for (let e = 0; e < n.length; e++) {
		let [i, a] = n[e];
		if (Y(i, t)) continue;
		let o = Se(a);
		if (o) {
			r.push({
				depth: o.depth,
				name: o.name,
				sourceEnd: i + a.length,
				start: i
			});
			continue;
		}
		let s = Ce(a), c = n[e - 1];
		!s || !c || Y(c[0], t) || !c[1].trim() || r.push({
			depth: s,
			name: c[1].trim(),
			sourceEnd: i + a.length,
			start: c[0]
		});
	}
	return r;
}
function Se(e) {
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
function Ce(e) {
	let t = 0;
	for (; t < e.length && e[t] === " ";) t++;
	if (t > 3 || e[t] !== "=" && e[t] !== "-") return null;
	let n = e[t], r = 0;
	for (; t < e.length && e[t] === n;) r++, t++;
	if (r === 0) return null;
	for (; t < e.length && (e[t] === " " || e[t] === "	");) t++;
	return t === e.length ? n === "=" ? 1 : 2 : null;
}
function we(e, t, n, i) {
	let a = r(t.content), o = i.sections.map((e) => ({
		level: e.level,
		offset: H(a, e.location),
		name: e.title
	})).sort((e, t) => e.offset - t.offset), s = [];
	for (let r = 0; r < o.length; r++) {
		let i = o[r], a = t.content.length;
		for (let e = r + 1; e < o.length; e++) if (b[o[e].level] <= b[i.level]) {
			a = o[e].offset;
			break;
		}
		let c = 0;
		for (let e = r - 1; e >= 0; e--) if (b[o[e].level] < b[i.level]) {
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
			source: T(t, {
				startOffset: i.offset,
				endOffset: l?.end ?? i.offset
			})
		});
	}
}
function Te(e, t, n) {
	let r = [];
	for (let i of n) {
		let n = G(t.content, i);
		if (!n) continue;
		if (n.kind === "begin") {
			let a = r[r.length - 1]?.index ?? Oe(e, i.start), o = e.length;
			e.push({
				kind: "environment",
				parent: a,
				range: {
					startOffset: i.start,
					endOffset: t.content.length
				},
				state: "incomplete",
				name: n.name,
				source: T(t, {
					startOffset: i.start,
					endOffset: n.end
				})
			}), r.push({
				index: o,
				name: n.name
			});
			continue;
		}
		let a = Ee(r, n.name);
		a < 0 || De(e, r, a, n.name, n.end);
	}
}
function Ee(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (e[n].name === t) return n;
	return -1;
}
function De(e, t, n, r, i) {
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
function Oe(e, t) {
	for (let n = e.length - 1; n > 0; n--) {
		let r = e[n];
		if (r.kind === "section" && r.range.startOffset <= t && t < r.range.endOffset) return n;
	}
	return 0;
}
function ke(e, t, n, r, i, a) {
	let o = Be(e.content), s = B([
		...Ae(e.content, o, i),
		...je(n),
		...Me(e.content, o, t),
		...Fe(a),
		...e.language === "markdown" ? Ie(e.content, o) : []
	]), c = Le(e.content, o, s, r, n);
	return B([...s, ...c]).map((e) => ({
		...e,
		parentScope: Ue(i, e.range.startOffset)
	}));
}
function Ae(e, t, n) {
	return n.flatMap((n) => {
		if (n.kind !== "section") return [];
		let r = I(t, n.range.startOffset);
		return r ? [{
			kind: "heading",
			range: L(e, r),
			state: n.state,
			...n.level ? { name: n.level } : {}
		}] : [];
	});
}
function je(e) {
	return e.filter((e) => e.delimiter !== "$" && e.delimiter !== "\\(").map((e) => ({
		kind: "display-math",
		range: e.fullRange,
		contentRange: e.contentRange,
		state: e.closed ? "complete" : "incomplete",
		name: e.delimiter
	}));
}
function Me(e, t, n) {
	return n.flatMap((n) => {
		if (n.type !== "command") return [];
		if (n.value === "caption") return [Ne(e, n)];
		if (n.value !== "item") return [];
		let r = I(t, n.start);
		return r ? [Pe(e, n, r)] : [];
	});
}
function Ne(e, t) {
	let n = E(e, t.end, ["optional", "required"]);
	return {
		kind: "caption",
		range: {
			startOffset: t.start,
			endOffset: n.end
		},
		state: n.complete ? "complete" : "incomplete",
		name: t.value
	};
}
function Pe(e, t, n) {
	return {
		kind: "list-item",
		range: L(e, n),
		contentRange: {
			startOffset: R(e, t.end, n.contentEnd),
			endOffset: z(e, n.start, n.contentEnd)
		},
		state: "complete",
		name: "item"
	};
}
function Fe(e) {
	return e.flatMap((e) => e.kind === "glossary" || e.kind === "acronym" ? [{
		kind: "resource-entry",
		range: e.source.range,
		state: e.state ?? "complete",
		name: e.kind
	}] : []);
}
function Ie(e, t) {
	let n = K(e);
	return t.flatMap((t) => {
		if (Y(t.start, n)) return [];
		let r = L(e, t), i = e.slice(r.startOffset, r.endOffset), a = Ve(i);
		return a > 0 ? [{
			kind: "list-item",
			range: r,
			contentRange: {
				startOffset: r.startOffset + a,
				endOffset: r.endOffset
			},
			state: "complete",
			name: "markdown"
		}] : He(i) ? [{
			kind: "table-row",
			range: r,
			state: "complete",
			name: "markdown"
		}] : [];
	});
}
function Le(e, t, n, r, i) {
	let a = i.filter(Re), o = n.map((e) => e.range), s = [];
	for (let n of t) {
		let t = L(e, n);
		if (t.startOffset !== t.endOffset) for (let n of Ke(t, o)) {
			let t = {
				startOffset: R(e, n.startOffset, n.endOffset),
				endOffset: z(e, n.startOffset, n.endOffset)
			};
			ze(t, r, a) && s.push(t);
		}
	}
	return qe(e, s, n).map((e) => ({
		kind: "paragraph",
		range: e,
		state: "complete"
	}));
}
function Re(e) {
	return e.delimiter === "$" || e.delimiter === "\\(";
}
function ze(e, t, n) {
	return e.startOffset < e.endOffset && (t.some((t) => V(t.range, e)) || n.some((t) => V(t.fullRange, e)));
}
function Be(e) {
	let t = [], n = 0;
	for (let r = 0; r <= e.length; r++) {
		if (r !== e.length && e[r] !== "\n") continue;
		let i = r > n && e[r - 1] === "\r" ? r - 1 : r;
		t.push({
			start: n,
			end: Math.min(e.length, r + 1),
			contentEnd: i
		}), n = r + 1;
	}
	return t;
}
function I(e, t) {
	return e.find((e) => e.start <= t && t < e.end);
}
function L(e, t) {
	let n = R(e, t.start, t.contentEnd);
	return {
		startOffset: n,
		endOffset: z(e, n, t.contentEnd)
	};
}
function R(e, t, n) {
	for (; t < n && /\s/u.test(e[t]);) t++;
	return t;
}
function z(e, t, n) {
	for (; n > t && /\s/u.test(e[n - 1]);) n--;
	return n;
}
function Ve(e) {
	let t = /^(?:[-+*])[ \t]+/u.exec(e);
	return t ? t[0].length : /^\d+[.)][ \t]+/u.exec(e)?.[0].length ?? 0;
}
function He(e) {
	return e.includes("|") && e.split("|").length >= 3;
}
function Ue(e, t) {
	let n = 0, r = 0;
	for (let i = 1; i < e.length; i++) {
		let a = e[i];
		if (a.range.startOffset <= t && t < a.range.endOffset) {
			let t = We(e, i);
			t > r && (n = i, r = t);
		}
	}
	return n;
}
function We(e, t) {
	let n = 0, r = /* @__PURE__ */ new Set();
	for (; t > 0 && !r.has(t);) r.add(t), n++, t = e[t]?.parent ?? 0;
	return n;
}
function Ge(e, t) {
	return e.range.startOffset - t.range.startOffset || e.range.endOffset - t.range.endOffset || e.kind.localeCompare(t.kind);
}
function B(e) {
	let t = [];
	for (let n of [...e].sort(Ge)) {
		let e = t.at(-1);
		(!e || !V(e.range, n.range)) && t.push(n);
	}
	return t;
}
function V(e, t) {
	return e.startOffset < t.endOffset && t.startOffset < e.endOffset;
}
function Ke(e, t) {
	let n = [e];
	for (let e of t) {
		let t = [];
		for (let r of n) {
			if (!V(r, e)) {
				t.push(r);
				continue;
			}
			r.startOffset < e.startOffset && t.push({
				startOffset: r.startOffset,
				endOffset: Math.min(r.endOffset, e.startOffset)
			}), e.endOffset < r.endOffset && t.push({
				startOffset: Math.max(r.startOffset, e.endOffset),
				endOffset: r.endOffset
			});
		}
		n = t;
	}
	return n;
}
function qe(e, t, n) {
	let r = [];
	for (let i of t) {
		let t = r[r.length - 1];
		if (!t) {
			r.push({ ...i });
			continue;
		}
		let a = {
			startOffset: t.endOffset,
			endOffset: i.startOffset
		};
		/\n[ \t\r]*\n/u.test(e.slice(a.startOffset, a.endOffset)) || n.some((e) => V(e.range, a)) ? r.push({ ...i }) : t.endOffset = i.endOffset;
	}
	return r;
}
function Je(e, t, n, i) {
	let a = p(e, t), o = new Set(a.filter((e) => e.kind === "macro" || e.kind === "operator" || e.kind === "paired-delimiter").map((e) => e.name)), s = r(e.content), c = (t) => {
		let r = H(s, t);
		return T(e, {
			startOffset: r,
			endOffset: n.get(r)?.end ?? r
		});
	}, l = (t, n) => {
		let r = H(s, t);
		return T(e, {
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
function H(e, t) {
	return (e[t.line - 1] ?? 0) + t.column - 1;
}
function Ye(e) {
	return ie.encode(JSON.stringify(e)).byteLength;
}
function U(e) {
	if (e?.isCancellationRequested) throw new m("Syntax update cancelled");
}
function W(e) {
	return e.reduce((e, t) => e + Ye(t), 0);
}
function Xe(e) {
	return e.kind === "error" || e.state === "incomplete" || e.state === "ambiguous" || e.state === "cyclic" || e.state === "truncated";
}
function Ze(e, t, n) {
	let r = [...s([...t]), ...n ? K(e) : []], i = t.filter((e) => e.type !== "comment" && e.type !== "verb" && !Y(e.start, r)), a = [], o = null;
	for (let t of i) {
		let n = Qe(e, t);
		n && (!o && n.kind !== "close" ? o = {
			delimiter: n.delimiter,
			close: n.close,
			fullStart: t.start,
			contentStart: n.fullEnd
		} : o && n.kind !== "open" && n.close === o.close && (a.push($e(o, t.start, n.fullEnd)), o = null));
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
function Qe(e, t) {
	let n = G(e, t);
	if (n && re.has(n.name)) return {
		kind: n.kind === "begin" ? "open" : "close",
		delimiter: `\\begin{${n.name}}`,
		close: `env:${n.name}`,
		fullEnd: n.end
	};
	let r = et(t);
	return r ? {
		...r,
		fullEnd: t.end
	} : null;
}
function $e(e, t, n) {
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
function et(e) {
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
	let t = q(e);
	t.push(...tt(e), ...nt(e));
	for (let [n, r] of J(e)) {
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
function q(e) {
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
function tt(e) {
	if (!/^(?:---|\+\+\+)\s*(?:\r?\n|$)/.test(e)) return [];
	let t = /^(?:---|\.\.\.|\+\+\+)\s*$/gm;
	t.lastIndex = e.indexOf("\n") + 1;
	let n = t.exec(e);
	return [[0, n ? n.index + n[0].length : e.length]];
}
function nt(e) {
	return [...e.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((e) => [e.index, e.index + e[0].length]);
}
function J(e) {
	let t = [], n = 0;
	for (let r of e.split("\n")) t.push([n, r]), n += r.length + 1;
	return t;
}
function Y(e, t) {
	return t.some(([t, n]) => t <= e && e < n);
}
function rt(e, t) {
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
					...y(e.surface)
				} : n
			});
		}
	}
	return c.sort((e, t) => e.source.range.startOffset - t.source.range.startOffset);
}
var it = 4, at = RegExp(`\\\\(?:${t}|DeclareMathOperator)\\*?\\{\\\\([a-zA-Z@]+)\\}(?:\\[\\d+\\])?(?:\\[[^\\]]*\\])?\\s*\\{`, "g"), ot = /\\def\\([a-zA-Z@]+)(?:#\d)*\s*\{/g;
function X(e) {
	let t = /* @__PURE__ */ new Map(), n = (n) => {
		for (let r of e.matchAll(n)) {
			let n = st(e, r.index + r[0].length - 1);
			n !== null && t.set(r[1], { body: n });
		}
	};
	return n(at), n(ot), t;
}
function st(e, t) {
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
	if (r >= it) return {
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
function ct(e, t) {
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
export { te as LATEX_SYNTAX_SCHEMA_VERSION, m as LatexSyntaxCancelledError, h as LatexSyntaxService, ee as MATH_COMMAND_SPECS, ne as assertLatexSyntaxSchemaVersion, he as createLatexSyntaxService, f as findLatexNotationPath, u as getMathCommandSpec };
