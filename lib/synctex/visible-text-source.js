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
function b(t, n) {
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
function x(e, t, n, r) {
	let i = [], a = C(t);
	for (let o of t) {
		if (o.type !== "command" || r.intersects(o.start, o.end) || !n.has(o.value) && (y(o.value) || m.has(o.value) || h.has(o.value) || g.has(o.value) || _.has(o.value))) continue;
		let t = v(e, o), s = e.indexOf("\n\n", o.end), c = t && u.has(o.value) && !n.has(o.value) ? b(e, t.invocationEnd) : a.get(o.start) ?? (s === -1 ? e.length : s);
		i.push({
			startOffset: o.end,
			endOffset: c
		});
	}
	return new l(i);
}
function S(e, t, n, r, i) {
	let a = x(e, n, r, i), o = new Map(t.proseAnnotations.filter((e) => e.kind === "document-field" && e.state === "complete").map((e) => [e.range.startOffset, e]));
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
function C(e) {
	let t = [], n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
	for (let i of e) if (i.type === "open") t.push(i.start);
	else if (i.type === "close") {
		let e = t.pop();
		e !== void 0 && r.set(e, i.end);
	} else i.type === "command" && t.length && n.set(i.start, t.at(-1));
	return new Map([...n].map(([e, t]) => [e, r.get(t)]));
}
function w(e, t) {
	let n = 0, r = e.length;
	for (; n < r;) {
		let i = n + r >>> 1;
		e[i].end <= t ? n = i + 1 : r = i;
	}
	return n;
}
var T = class {
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
		})).concat(t.mathRoots.map(({ fullRange: e }) => e))), this.parents = C(n), this.extras = S(e, t, n, r, this.masked);
	}
	project(e) {
		let t = e.range.startOffset, n = new l(this.extras.filter((t) => t !== e && t.range.startOffset >= e.range.startOffset && t.range.endOffset <= e.range.endOffset).map(({ structuralRange: e }) => e));
		for (let r = w(this.tokens, e.range.startOffset); r < this.tokens.length; r++) {
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
function E(e, r, i = 1e6) {
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
	let s = new T(e, r, o, new Set(r.macros.filter((e) => e.kind === "call" && e.definitions.length).map(({ name: e }) => e)));
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
export { E as projectVisibleTextSource };
