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
		let c = he(r, a, s, t);
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
			recoveredNodes: e.reduce((e, t) => e + t.nodes.filter(qe).length, 0),
			snapshotBytes: U(e),
			lastInvalidatedDocuments: this.lastTransferFileIds.length,
			lastTransferBytes: U(t)
		};
	}
	refreshMacroDefinitions(e = /* @__PURE__ */ new Set(), t = !1) {
		let n = ae(this.files.values()), r = ie(this.macroCatalog, n), i = [];
		for (let [o, s] of this.files) {
			if (!t && !e.has(o) && (r.size === 0 || !s.baseSyntax.macros.some((e) => r.has(e.name)))) continue;
			let c = new Map(a(s.input.content, n.expansionDefinitions).map((e) => [e.inputStart, e])), l = s.baseSyntax.macros.map((e) => se(e, c, n));
			s.syntax = {
				...s.baseSyntax,
				macros: l,
				nodes: _(s.baseSyntax, l)
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
function ae(e) {
	let t = [...e], n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set();
	for (let e of t) {
		oe(r, a, X(e.input.content));
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
function oe(e, t, n) {
	for (let [r, i] of n) e.has(r) ? (e.delete(r), t.add(r)) : t.has(r) || e.set(r, i);
}
function se(e, t, n) {
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
			...v(i.surface)
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
function _(e, t) {
	let n = new Map(t.filter((e) => e.kind === "call" && e.expansion.status === "expanded" && e.expansion.surface !== void 0 && e.expansion.inputRange !== void 0).map((e) => [e.expansion.inputRange.startOffset, e]));
	return n.size === 0 ? e.nodes : e.nodes.map((t) => le(t, e, n));
}
function le(e, t, n) {
	let r = e.ranges.command?.startOffset;
	if (e.kind !== "command" || r === void 0) return e;
	let i = n.get(r), a = i?.expansion.surface;
	if (!i || a === void 0 || i.expansion.notation) return e;
	let o = fe(a);
	if (!o) return e;
	let s = o.kind === "named-operator" && e.children.length === 0 ? [] : o.arguments;
	return ue(s, e.children) ? de(e, t, i, o, s) : e;
}
function ue(e, t) {
	return e.length === 0 || t.length > 0 && e.length === t.length;
}
function de(e, t, n, r, i) {
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
function fe(e) {
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
function pe(e) {
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
function v(e) {
	let t = pe(e), n = t.nodes[t.root], r = n?.children.length === 1 ? t.nodes[n.children[0]] : void 0;
	return r && [
		"token",
		"modifier",
		"style",
		"named-operator"
	].includes(r.kind) ? {} : { notation: t };
}
function me(e) {
	let t = new h();
	return e && t.reset(e), t;
}
function he(e, t, n, r) {
	let i = Je(e.content, t, e.language === "markdown"), a = i.filter((e) => !e.closed).map((e) => ({
		code: "unclosed-math",
		message: `Unclosed ${e.delimiter} math region`,
		severity: "warning",
		range: e.fullRange
	})), o = ge(e, t, n, i, r);
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
var y = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5
}, b = /* @__PURE__ */ new Map([
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
]), x = new Set(e.split("|")), S = [
	"optional",
	"optional",
	"required"
], C = /* @__PURE__ */ new Set([
	"title",
	"author",
	"keywords"
]);
for (let e of x) b.set(e, S);
for (let e of C) b.set(e, ["required"]);
function ge(e, t, n, r, i) {
	let a = new Map(t.map((e) => [e.start, e])), o = u(e, t, r, () => H(i)), s = _e(e, t, r), c = j(e, t, a, n), l = Ge(e, t, a, n);
	return {
		...o,
		visibleProse: s,
		proseAnnotations: ye(e, t),
		scopes: c,
		blocks: Ee(e, t, r, s, c, l),
		declarations: l
	};
}
function w(e, t) {
	return {
		fileId: e.fileId,
		path: e.path,
		range: t
	};
}
function _e(e, t, n) {
	let r = [
		...q(t, e.content.length),
		...e.language === "markdown" ? G(e.content) : [],
		...n.map((e) => [e.fullRange.startOffset, e.fullRange.endOffset])
	];
	for (let n of t) if (n.type === "comment" || n.type === "verb" || n.type === "open" || n.type === "close") r.push([n.start, n.end]);
	else if (n.type === "command") {
		let t = b.get(n.value);
		r.push([n.start, t === void 0 ? n.end : T(e.content, n.end, t).end]);
	}
	let i = [], a = 0;
	for (let [t, n] of k(r, e.content.length)) A(e.content, a, t, i), a = Math.max(a, n);
	return A(e.content, a, e.content.length, i), i;
}
function T(e, t, n) {
	let r = t;
	e[r] === "*" && r++;
	for (let t of n) {
		for (; /\s/.test(e[r] ?? "");) r++;
		let n = ve(e, r, t);
		if (n !== null && (r = n.end, !n.complete)) return n;
	}
	return {
		end: r,
		complete: !0
	};
}
function ve(e, t, n) {
	return n === "optional" ? e[t] === "[" ? E(e, t, "[", "]") : null : e[t] === "{" ? E(e, t, "{", "}") : {
		end: t,
		complete: !1
	};
}
function E(e, t, n, r) {
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
function ye(e, t) {
	let n = [];
	for (let r of t) if (r.type === "command") {
		if (x.has(r.value)) {
			let t = T(e.content, r.end, S);
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
		D(r.value) && n.push(O(e, r));
	}
	return n;
}
function D(e) {
	return C.has(e);
}
function O(e, t) {
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
	let r = E(e.content, n, "{", "}");
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
function k(e, t) {
	let n = e.map(([e, n]) => [Math.max(0, Math.min(e, t)), Math.max(0, Math.min(n, t))]).filter(([e, t]) => t > e).sort((e, t) => e[0] - t[0] || e[1] - t[1]), r = [];
	for (let [e, t] of n) {
		let n = r[r.length - 1];
		!n || e > n[1] ? r.push([e, t]) : n[1] = Math.max(n[1], t);
	}
	return r;
}
function A(e, t, n, r) {
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
function j(e, t, n, r) {
	let i = [{
		kind: "document",
		parent: null,
		range: {
			startOffset: 0,
			endOffset: e.content.length
		},
		state: "complete"
	}];
	return e.language === "markdown" ? M(i, e) : xe(i, e, n, r), Se(i, e, t), i;
}
function M(e, t) {
	let n = N(t.content), r = [];
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
			source: w(t, {
				startOffset: a.start,
				endOffset: a.sourceEnd
			})
		});
	}
}
function N(e) {
	let t = G(e), n = K(e), r = [];
	for (let e = 0; e < n.length; e++) {
		let [i, a] = n[e];
		if (Y(i, t)) continue;
		let o = P(a);
		if (o) {
			r.push({
				depth: o.depth,
				name: o.name,
				sourceEnd: i + a.length,
				start: i
			});
			continue;
		}
		let s = be(a), c = n[e - 1];
		!s || !c || Y(c[0], t) || !c[1].trim() || r.push({
			depth: s,
			name: c[1].trim(),
			sourceEnd: i + a.length,
			start: c[0]
		});
	}
	return r;
}
function P(e) {
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
function be(e) {
	let t = 0;
	for (; t < e.length && e[t] === " ";) t++;
	if (t > 3 || e[t] !== "=" && e[t] !== "-") return null;
	let n = e[t], r = 0;
	for (; t < e.length && e[t] === n;) r++, t++;
	if (r === 0) return null;
	for (; t < e.length && (e[t] === " " || e[t] === "	");) t++;
	return t === e.length ? n === "=" ? 1 : 2 : null;
}
function xe(e, t, n, i) {
	let a = r(t.content), o = i.sections.map((e) => ({
		level: e.level,
		offset: V(a, e.location),
		name: e.title
	})).sort((e, t) => e.offset - t.offset), s = [];
	for (let r = 0; r < o.length; r++) {
		let i = o[r], a = t.content.length;
		for (let e = r + 1; e < o.length; e++) if (y[o[e].level] <= y[i.level]) {
			a = o[e].offset;
			break;
		}
		let c = 0;
		for (let e = r - 1; e >= 0; e--) if (y[o[e].level] < y[i.level]) {
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
			source: w(t, {
				startOffset: i.offset,
				endOffset: l?.end ?? i.offset
			})
		});
	}
}
function Se(e, t, n) {
	let r = [];
	for (let i of n) {
		let n = W(t.content, i);
		if (!n) continue;
		if (n.kind === "begin") {
			let a = r[r.length - 1]?.index ?? Te(e, i.start), o = e.length;
			e.push({
				kind: "environment",
				parent: a,
				range: {
					startOffset: i.start,
					endOffset: t.content.length
				},
				state: "incomplete",
				name: n.name,
				source: w(t, {
					startOffset: i.start,
					endOffset: n.end
				})
			}), r.push({
				index: o,
				name: n.name
			});
			continue;
		}
		let a = Ce(r, n.name);
		a < 0 || we(e, r, a, n.name, n.end);
	}
}
function Ce(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (e[n].name === t) return n;
	return -1;
}
function we(e, t, n, r, i) {
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
function Te(e, t) {
	for (let n = e.length - 1; n > 0; n--) {
		let r = e[n];
		if (r.kind === "section" && r.range.startOffset <= t && t < r.range.endOffset) return n;
	}
	return 0;
}
function Ee(e, t, n, r, i, a) {
	let o = Le(e.content), s = z([
		...De(e.content, o, i),
		...Oe(n),
		...ke(e.content, o, t),
		...Me(a),
		...e.language === "markdown" ? Ne(e.content, o) : []
	]), c = Pe(e.content, o, s, r, n);
	return z([...s, ...c]).map((e) => ({
		...e,
		parentScope: Be(i, e.range.startOffset)
	}));
}
function De(e, t, n) {
	return n.flatMap((n) => {
		if (n.kind !== "section") return [];
		let r = F(t, n.range.startOffset);
		return r ? [{
			kind: "heading",
			range: I(e, r),
			state: n.state,
			...n.level ? { name: n.level } : {}
		}] : [];
	});
}
function Oe(e) {
	return e.filter((e) => e.delimiter !== "$" && e.delimiter !== "\\(").map((e) => ({
		kind: "display-math",
		range: e.fullRange,
		contentRange: e.contentRange,
		state: e.closed ? "complete" : "incomplete",
		name: e.delimiter
	}));
}
function ke(e, t, n) {
	return n.flatMap((n) => {
		if (n.type !== "command") return [];
		if (n.value === "caption") return [Ae(e, n)];
		if (n.value !== "item") return [];
		let r = F(t, n.start);
		return r ? [je(e, n, r)] : [];
	});
}
function Ae(e, t) {
	let n = T(e, t.end, ["optional", "required"]);
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
function je(e, t, n) {
	return {
		kind: "list-item",
		range: I(e, n),
		contentRange: {
			startOffset: L(e, t.end, n.contentEnd),
			endOffset: R(e, n.start, n.contentEnd)
		},
		state: "complete",
		name: "item"
	};
}
function Me(e) {
	return e.flatMap((e) => e.kind === "glossary" || e.kind === "acronym" ? [{
		kind: "resource-entry",
		range: e.source.range,
		state: e.state ?? "complete",
		name: e.kind
	}] : []);
}
function Ne(e, t) {
	let n = G(e);
	return t.flatMap((t) => {
		if (Y(t.start, n)) return [];
		let r = I(e, t), i = e.slice(r.startOffset, r.endOffset), a = Re(i);
		return a > 0 ? [{
			kind: "list-item",
			range: r,
			contentRange: {
				startOffset: r.startOffset + a,
				endOffset: r.endOffset
			},
			state: "complete",
			name: "markdown"
		}] : ze(i) ? [{
			kind: "table-row",
			range: r,
			state: "complete",
			name: "markdown"
		}] : [];
	});
}
function Pe(e, t, n, r, i) {
	let a = i.filter(Fe), o = n.map((e) => e.range), s = [];
	for (let n of t) {
		let t = I(e, n);
		if (t.startOffset !== t.endOffset) for (let n of Ue(t, o)) {
			let t = {
				startOffset: L(e, n.startOffset, n.endOffset),
				endOffset: R(e, n.startOffset, n.endOffset)
			};
			Ie(t, r, a) && s.push(t);
		}
	}
	return We(e, s, n).map((e) => ({
		kind: "paragraph",
		range: e,
		state: "complete"
	}));
}
function Fe(e) {
	return e.delimiter === "$" || e.delimiter === "\\(";
}
function Ie(e, t, n) {
	return e.startOffset < e.endOffset && (t.some((t) => B(t.range, e)) || n.some((t) => B(t.fullRange, e)));
}
function Le(e) {
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
function F(e, t) {
	return e.find((e) => e.start <= t && t < e.end);
}
function I(e, t) {
	let n = L(e, t.start, t.contentEnd);
	return {
		startOffset: n,
		endOffset: R(e, n, t.contentEnd)
	};
}
function L(e, t, n) {
	for (; t < n && /\s/u.test(e[t]);) t++;
	return t;
}
function R(e, t, n) {
	for (; n > t && /\s/u.test(e[n - 1]);) n--;
	return n;
}
function Re(e) {
	let t = /^(?:[-+*])[ \t]+/u.exec(e);
	return t ? t[0].length : /^\d+[.)][ \t]+/u.exec(e)?.[0].length ?? 0;
}
function ze(e) {
	return e.includes("|") && e.split("|").length >= 3;
}
function Be(e, t) {
	let n = 0, r = 0;
	for (let i = 1; i < e.length; i++) {
		let a = e[i];
		if (a.range.startOffset <= t && t < a.range.endOffset) {
			let t = Ve(e, i);
			t > r && (n = i, r = t);
		}
	}
	return n;
}
function Ve(e, t) {
	let n = 0, r = /* @__PURE__ */ new Set();
	for (; t > 0 && !r.has(t);) r.add(t), n++, t = e[t]?.parent ?? 0;
	return n;
}
function He(e, t) {
	return e.range.startOffset - t.range.startOffset || e.range.endOffset - t.range.endOffset || e.kind.localeCompare(t.kind);
}
function z(e) {
	let t = [];
	for (let n of [...e].sort(He)) {
		let e = t.at(-1);
		(!e || !B(e.range, n.range)) && t.push(n);
	}
	return t;
}
function B(e, t) {
	return e.startOffset < t.endOffset && t.startOffset < e.endOffset;
}
function Ue(e, t) {
	let n = [e];
	for (let e of t) {
		let t = [];
		for (let r of n) {
			if (!B(r, e)) {
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
function We(e, t, n) {
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
		/\n[ \t\r]*\n/u.test(e.slice(a.startOffset, a.endOffset)) || n.some((e) => B(e.range, a)) ? r.push({ ...i }) : t.endOffset = i.endOffset;
	}
	return r;
}
function Ge(e, t, n, i) {
	let a = ee(e, t), o = new Set(a.filter((e) => e.kind === "macro" || e.kind === "operator" || e.kind === "paired-delimiter").map((e) => e.name)), s = r(e.content), c = (t) => {
		let r = V(s, t);
		return w(e, {
			startOffset: r,
			endOffset: n.get(r)?.end ?? r
		});
	}, l = (t, n) => {
		let r = V(s, t);
		return w(e, {
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
function Ke(e) {
	return ne.encode(JSON.stringify(e)).byteLength;
}
function H(e) {
	if (e?.isCancellationRequested) throw new m("Syntax update cancelled");
}
function U(e) {
	return e.reduce((e, t) => e + Ke(t), 0);
}
function qe(e) {
	return e.kind === "error" || e.state === "incomplete" || e.state === "ambiguous" || e.state === "cyclic" || e.state === "truncated";
}
function Je(e, t, n) {
	let r = [...q(t, e.length), ...n ? G(e) : []], i = t.filter((e) => e.type !== "comment" && e.type !== "verb" && !Y(e.start, r)), a = [], o = null;
	for (let t of i) {
		let n = Ye(e, t);
		n && (!o && n.kind !== "close" ? o = {
			delimiter: n.delimiter,
			close: n.close,
			fullStart: t.start,
			contentStart: n.fullEnd
		} : o && n.kind !== "open" && n.close === o.close && (a.push(Xe(o, t.start, n.fullEnd)), o = null));
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
function Ye(e, t) {
	let n = W(e, t);
	if (n && te.has(n.name)) return {
		kind: n.kind === "begin" ? "open" : "close",
		delimiter: `\\begin{${n.name}}`,
		close: `env:${n.name}`,
		fullEnd: n.end
	};
	let r = Ze(t);
	return r ? {
		...r,
		fullEnd: t.end
	} : null;
}
function Xe(e, t, n) {
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
function Ze(e) {
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
	let t = Qe(e);
	t.push(...$e(e), ...et(e));
	for (let [n, r] of K(e)) {
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
function Qe(e) {
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
function $e(e) {
	if (!/^(?:---|\+\+\+)\s*(?:\r?\n|$)/.test(e)) return [];
	let t = /^(?:---|\.\.\.|\+\+\+)\s*$/gm;
	t.lastIndex = e.indexOf("\n") + 1;
	let n = t.exec(e);
	return [[0, n ? n.index + n[0].length : e.length]];
}
function et(e) {
	return [...e.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((e) => [e.index, e.index + e[0].length]);
}
function K(e) {
	let t = [], n = 0;
	for (let r of e.split("\n")) t.push([n, r]), n += r.length + 1;
	return t;
}
function q(e, t) {
	let n = [], r = [];
	for (let t of e) t.type === "command" && tt(t, r, n);
	for (let e of r) e.falseStart >= 0 && n.push([e.falseStart, t]);
	return n;
}
function tt(e, t, n) {
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
		nt(t[t.length - 1], e, n);
		return;
	}
	if (e.value === "fi") {
		J(t.pop(), e, n);
		return;
	}
	e.value.startsWith("if") && e.value !== "iff" && t.push({
		falseStart: -1,
		kind: "other",
		sawElse: !1
	});
}
function nt(e, t, n) {
	!e || e.sawElse || (e.sawElse = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function J(e, t, n) {
	e && (e.kind === "false" && !e.sawElse || e.kind === "true" && e.sawElse) && n.push([e.falseStart, t.start]);
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
					...v(e.surface)
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
export { f as LATEX_SYNTAX_SCHEMA_VERSION, m as LatexSyntaxCancelledError, h as LatexSyntaxService, c as MATH_COMMAND_SPECS, p as assertLatexSyntaxSchemaVersion, me as createLatexSyntaxService, d as findLatexNotationPath, l as getMathCommandSpec };
