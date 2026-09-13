import { readBalancedGroup as e } from "./balanced-group.js";
import { getStructuralSelectionIndex as t } from "./structural-selection.js";
import { LatexSyntaxService as n } from "../syntax.js";
import { wrapBoundary as r } from "./wrap-boundary.js";
import { activeWrapDefinitions as i, publicWrapOption as a } from "./wrap-catalog.js";
//#region src/lsp/wrap-selection.ts
function o(e, n, o) {
	let s = i(e.index, e.path), c = r(e.source, n, e.syntax, t(e.index.getFileSymbols(e.path)), e.metadata, s, new Set(e.index.getCommandDefs(e.path).map((e) => e.name)), o);
	if (!c.ok) return c;
	let l = t(e.index.getFileSymbols(e.path))?.groups, u = l && [...l].some(([e, t]) => e < n.startOffset && t >= n.endOffset), d = t(e.index.getFileSymbols(e.path))?.commands.some((e) => (e.value === "begin" || e.value === "end") && e.start >= n.startOffset && e.start < n.endOffset), f = e.syntax?.nodes.some((e) => e.kind === "alignment" && e.ranges.full.startOffset < n.endOffset && e.ranges.full.endOffset > n.startOffset);
	return {
		ok: !0,
		options: s.filter((t) => t.context === c.context && !(u && t.kind === "environment" && c.context === "text") && (t.kind !== "command" || !d && !f && !/\n\s*\n/.test(e.source.slice(n.startOffset, n.endOffset)))).map(a)
	};
}
function s(e, t, n) {
	let r = o(e, t.range, n);
	if (!r.ok) return r;
	let i = r.options.find((e) => e.kind === t.kind && e.name === t.name);
	if (!i) return {
		ok: !1,
		reason: "unknown-wrapper"
	};
	if (t.arguments.length !== i.arguments.length) return {
		ok: !1,
		reason: "missing-argument"
	};
	let a = e.source.slice(t.range.startOffset, t.range.endOffset);
	if (i.kind === "environment" && i.name === "equation") {
		let t = u(e, a, !0, n);
		if (t) return {
			ok: !1,
			reason: t
		};
	}
	let s = c(e, i, t.arguments, a, n);
	if (!s.ok) return s;
	let l = i.kind === "command" ? `\\${i.name}${s.text}` : `\\begin{${i.name}}${s.text}\n${a}\n\\end{${i.name}}`;
	return n?.isCancellationRequested ? {
		ok: !1,
		reason: "cancelled"
	} : {
		ok: !0,
		edit: {
			range: { ...t.range },
			expectedText: a,
			newText: l
		}
	};
}
function c(e, t, n, r, i) {
	let a = "";
	for (let [o, s] of t.arguments.entries()) {
		let c = o === t.selectionArgument ? n[o] === null ? {
			ok: !0,
			text: `{${r}}`
		} : {
			ok: !1,
			reason: "invalid-argument"
		} : l(e, t, s, n[o], i);
		if (!c.ok) return c;
		a += c.text;
	}
	return {
		ok: !0,
		text: a
	};
}
function l(t, n, r, a, o) {
	if (a === null) return r.kind === "optional" ? {
		ok: !0,
		text: ""
	} : {
		ok: !1,
		reason: "missing-argument"
	};
	if (typeof a != "string" || a.length > 16384 || !a.trim()) return {
		ok: !1,
		reason: "invalid-argument"
	};
	let s = r.kind === "optional" ? `[${a}]` : `{${a}}`, c = e(s, 0, r.balancedOptional);
	if (!c.closed || c.end !== s.length) return {
		ok: !1,
		reason: "invalid-argument"
	};
	let l = u(t, a, i(t.index, t.path).find((e) => e.kind === n.kind && e.name === n.name)?.context === "math", o);
	return l ? {
		ok: !1,
		reason: l
	} : {
		ok: !0,
		text: s
	};
}
function u(e, a, o, s) {
	let c = i(e.index, e.path), l = o ? `$${a}$` : a, u = new n(), d = u.upsert({
		fileId: "argument",
		path: "argument.tex",
		content: l,
		documentVersion: 1
	}), f = t(u.getProjectIndex().getFileSymbols("argument.tex")), p = r(l, {
		startOffset: +!!o,
		endOffset: l.length - +!!o
	}, d, f, e.metadata, c, new Set(e.index.getCommandDefs(e.path).map((e) => e.name)), s);
	return p.ok ? null : p.reason === "cancelled" ? "cancelled" : "invalid-argument";
}
//#endregion
export { o as getWrapOptions, s as planWrapSelection };
