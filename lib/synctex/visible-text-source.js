import { readBalancedGroup as e } from "../lsp/balanced-group.js";
import { tokenize as t } from "../lsp/latex-tokenizer.js";
import { buildLineStarts as n } from "../lsp/source-position.js";
import { CITE_CMDS as r, REF_CMDS as i } from "../lsp/latex-patterns.js";
import { macroDefinitionSpansFromTokens as a, maskSpansFromTokens as o } from "../lsp/latex-parser.js";
import { normalizeVisibleText as s } from "./visible-text-normalize.js";
import { assertLatexSyntaxSchemaVersion as c } from "../syntax-contract.js";
import { VisibleSourceRanges as l } from "./visible-source-ranges.js";
//#region src/synctex/visible-text-source.ts
var u = /* @__PURE__ */ new Set([
	...r.split("|"),
	...i.split("|"),
	"label",
	"includegraphics",
	"begin",
	"end",
	"documentclass",
	"usepackage",
	"RequirePackage",
	"DocumentMetadata"
]), d = /* @__PURE__ */ new Set([
	"title",
	"author",
	"date",
	"subtitle",
	"institute",
	"keywords"
]), f = /* @__PURE__ */ new Set([
	"part",
	"chapter",
	"section",
	"subsection",
	"subsubsection",
	"paragraph",
	"subparagraph"
]), p = /* @__PURE__ */ new Set([
	"footnote",
	"footnotetext",
	"thanks"
]), m = /* @__PURE__ */ new Set([
	"textbf",
	"textit",
	"emph",
	"textnormal",
	"textrm",
	"textsf",
	"texttt",
	"textsc",
	"textmd",
	"textup",
	"mbox",
	"underline"
]), h = /* @__PURE__ */ new Set([
	"bfseries",
	"itshape",
	"normalfont",
	"small",
	"large",
	"Large",
	"LARGE",
	"huge",
	"Huge",
	"footnotesize",
	"scriptsize",
	"tiny",
	"centering",
	"raggedright",
	"noindent",
	"maketitle",
	"titlepage",
	"newpage",
	"clearpage",
	"cleardoublepage",
	"leavevmode",
	"protect",
	"relax"
]), g = /* @__PURE__ */ new Set([
	"\\",
	"newline",
	"and",
	"linebreak",
	"par",
	"space",
	"quad",
	"qquad",
	"enspace",
	",",
	";",
	":",
	" "
]), _ = /* @__PURE__ */ new Map([
	["&", "&"],
	["%", "%"],
	["$", "$"],
	["#", "#"],
	["_", "_"],
	["{", "{"],
	["}", "}"],
	["textbackslash", "\\"],
	["textasciicircum", "^"],
	["textasciitilde", "~"],
	["ae", "æ"],
	["AE", "Æ"],
	["oe", "œ"],
	["OE", "Œ"],
	["ss", "ß"]
]);
function v(t, n) {
	let r = n.end + Number(t[n.end] === "*");
	for (let n = 0; n < 8; n++) {
		for (; /\s/.test(t[r] ?? "");) r++;
		if (!["[", "{"].includes(t[r] ?? "")) return null;
		let n = e(t, r, !0);
		if (!n.closed) return null;
		if (t[r] === "{") return {
			startOffset: r + 1,
			endOffset: n.contentEnd,
			invocationEnd: n.end
		};
		r = n.end;
	}
	return null;
}
function y(e) {
	return d.has(e) ? "metadata" : f.has(e) ? "heading" : p.has(e) ? "footnote" : e === "caption" ? "caption" : null;
}
function b(e) {
	return y(e) || m.has(e) || h.has(e) || g.has(e) || _.has(e);
}
function x(t, n) {
	let r = n;
	for (let n = 0; n < 8; n++) {
		let n = r;
		for (; /\s/.test(t[n] ?? "");) n++;
		if (t[n] !== "{") break;
		let i = e(t, n, !0);
		if (!i.closed) break;
		r = i.end;
	}
	return r;
}
function S(e, t) {
	let n = t.scopes.filter(({ kind: e }) => e === "environment").sort((e, t) => e.range.startOffset - t.range.startOffset || t.range.endOffset - e.range.endOffset), r = [], i = /* @__PURE__ */ new Map(), a = 0;
	for (let t of e) {
		for (; a < n.length && n[a].range.startOffset <= t.start;) {
			let e = n[a++];
			for (; r.length && r.at(-1).range.endOffset <= e.range.startOffset;) r.pop();
			r.push(e);
		}
		for (; r.length && r.at(-1).range.endOffset <= t.start;) r.pop();
		t.type === "command" && r.length && i.set(t.start, r.at(-1).range.endOffset);
	}
	return i;
}
function C(e, t, n, r, i) {
	let a = [], o = T(t), s = S(t, i);
	for (let i of t) {
		if (i.type !== "command" || r.intersects(i.start, i.end) || !n.has(i.value) && b(i.value)) continue;
		let t = v(e, i), c = e.indexOf("\n\n", i.end), l = t && u.has(i.value) && !n.has(i.value) ? x(e, t.invocationEnd) : o.get(i.start) ?? (c === -1 ? e.length : c);
		a.push({
			startOffset: i.end,
			endOffset: Math.min(l, s.get(i.start) ?? l)
		});
	}
	return new l(a);
}
function w(e, t, n, r, i) {
	let a = C(e, n, r, i, t), o = new Map(t.proseAnnotations.filter((e) => e.kind === "document-field" && e.state === "complete").map((e) => [e.range.startOffset, e]));
	return n.flatMap((t) => {
		if (t.type !== "command" || r.has(t.value) || a.intersects(t.start, t.end)) return [];
		let n = y(t.value);
		if (!n) return [];
		let i = v(e, t);
		if (!i) return [];
		let s = o.get(t.start), c = s?.kind === "document-field" && s.valueRange ? s.valueRange : i;
		return [{
			kind: n,
			name: t.value,
			range: c,
			structuralRange: {
				startOffset: t.start,
				endOffset: i.invocationEnd
			},
			metadata: !0
		}];
	});
}
function T(e) {
	let t = [], n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
	for (let i of e) if (i.type === "open") t.push(i.start);
	else if (i.type === "close") {
		let e = t.pop();
		e !== void 0 && r.set(e, i.end);
	} else i.type === "command" && t.length && n.set(i.start, t.at(-1));
	return new Map([...n].map(([e, t]) => [e, r.get(t)]));
}
function E(e, t) {
	let n = 0, r = e.length;
	for (; n < r;) {
		let i = n + r >>> 1;
		e[i].end <= t ? n = i + 1 : r = i;
	}
	return n;
}
var D = class {
	source;
	tokens;
	overridden;
	blocks = [];
	units = [];
	visible;
	masked;
	parents;
	extras;
	constructor(e, t, n, r) {
		this.source = e, this.tokens = n, this.overridden = r, this.visible = new l(t.visibleProse.map(({ range: e }) => e)), this.masked = new l([...o(n), ...a(e, n)].map(([e, t]) => ({
			startOffset: e,
			endOffset: t
		})).concat(t.mathRoots.map(({ fullRange: e }) => e))), this.parents = T(n), this.extras = w(e, t, n, r, this.masked);
	}
	project(e) {
		let t = e.range.startOffset, n = new l(this.extras.filter((t) => t !== e && t.range.startOffset >= e.range.startOffset && t.range.endOffset <= e.range.endOffset).map(({ structuralRange: e }) => e));
		for (let r = E(this.tokens, e.range.startOffset); r < this.tokens.length; r++) {
			let i = this.tokens[r];
			if (i.start >= e.range.endOffset) break;
			if (!(i.end <= t)) {
				if (this.masked.intersects(i.start, i.end) || n.intersects(i.start, i.end)) {
					this.flush(e);
					continue;
				}
				i.type === "text" ? this.literal(e, Math.max(t, i.start), Math.min(i.end, e.range.endOffset)) : i.type === "command" && (t = this.command(e, i));
			}
		}
		this.flush(e);
	}
	command(e, t) {
		if (this.overridden.has(t.value)) return this.opaque(e, t);
		if (u.has(t.value)) return this.flush(e), v(this.source, t)?.invocationEnd ?? this.opaque(e, t);
		let n = _.get(t.value);
		return n === void 0 ? g.has(t.value) ? (this.units.push({
			text: " ",
			start: t.start,
			end: t.end
		}), this.spacingEnd(t)) : !this.overridden.has(t.value) && (m.has(t.value) || h.has(t.value)) ? this.delimiterEnd(t) : this.opaque(e, t) : (this.units.push({
			text: n,
			start: t.start,
			end: t.end
		}), this.delimiterEnd(t));
	}
	spacingEnd(t) {
		let n = t.value === "\\";
		if (!(n || t.value === "linebreak")) return this.delimiterEnd(t);
		let r = this.whitespaceEnd(t.end);
		return n && this.source[r] === "*" && (r = this.whitespaceEnd(r + 1)), (this.source[r] === "[" ? e(this.source, r) : null)?.end ?? r;
	}
	delimiterEnd(e) {
		return /^[A-Za-z]+$/.test(e.value) ? this.whitespaceEnd(e.end) : e.end;
	}
	whitespaceEnd(e) {
		let t = /^\s*/.exec(this.source.slice(e))?.[0] ?? "";
		return /\n[ \t\r]*\n/.test(t) ? e : e + t.length;
	}
	opaque(e, t) {
		return this.flush(e), Math.min(this.parents.get(t.start) ?? e.range.endOffset, e.range.endOffset);
	}
	literal(e, t, n) {
		let r = this.source.slice(t, n), i = e.metadata || /^\s*$/.test(r) ? [{
			startOffset: t,
			endOffset: n
		}] : this.visible.clips(t, n);
		for (let e of i) {
			let r = e.startOffset, i = e.endOffset;
			for (; r > t && /\s/.test(this.source[r - 1]);) r--;
			for (; i < n && /\s/.test(this.source[i]);) i++;
			this.literalUnits(r, i);
		}
	}
	literalUnits(e, t) {
		let n = this.source.slice(e, t), r = {
			"---": "—",
			"--": "–",
			"``": "“",
			"''": "”"
		}, i = 0;
		for (let t of n.matchAll(/---|--|``|''/g)) this.units.push({
			text: n.slice(i, t.index).replace(/[~&]/g, " "),
			start: e + i,
			end: e + t.index
		}), this.units.push({
			text: r[t[0]],
			start: e + t.index,
			end: e + t.index + t[0].length
		}), i = t.index + t[0].length;
		this.units.push({
			text: n.slice(i).replace(/[~&]/g, " "),
			start: e + i,
			end: t
		});
	}
	flush(e) {
		if (!this.units.length) return;
		let t = s(this.units);
		this.units = [], t.text && this.blocks.push({
			...t,
			kind: e.kind,
			...e.name === void 0 ? {} : { name: e.name },
			structuralRange: e.structuralRange
		});
	}
};
function O(e, r, i = 1e6) {
	c(r);
	let a = {
		fileId: r.fileId,
		file: r.path,
		documentVersion: r.documentVersion,
		sourceLength: e.length,
		lineStarts: /* @__PURE__ */ new Uint32Array(),
		blocks: [],
		truncated: e.length > i
	};
	if (a.truncated) return a;
	a.lineStarts = Uint32Array.from(n(e));
	let o = t(e);
	if (o.length > 1e5 || r.blocks.length > 4096) return a.truncated = !0, a;
	let s = new D(e, r, o, new Set(r.macros.filter((e) => e.kind === "call" && e.definitions.length).map(({ name: e }) => e)));
	if (s.extras.length > 2048) return a.truncated = !0, a;
	let l = r.blocks.filter((e) => e.state === "complete" && ![
		"heading",
		"caption",
		"display-math",
		"resource-entry"
	].includes(e.kind)).map((e) => ({
		kind: e.kind,
		...e.name === void 0 ? {} : { name: e.name },
		range: e.contentRange ?? e.range,
		structuralRange: e.range,
		metadata: !1
	}));
	for (let e of [...l, ...s.extras].sort((e, t) => e.range.startOffset - t.range.startOffset)) s.project(e);
	return a.blocks = s.blocks, a;
}
//#endregion
export { O as projectVisibleTextSource };
