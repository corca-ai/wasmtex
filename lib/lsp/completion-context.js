import { tokenize as e } from "./latex-tokenizer.js";
import { buildLineStarts as t, positionToOffset as n, rangeFromOffsets as r } from "./source-position.js";
import { maskSpansFromTokens as i } from "./latex-parser.js";
import { getCommandSignature as a } from "./package-db.js";
import { analyzeBibCompletionContext as o } from "./bib-completion-context.js";
//#region src/lsp/completion-context.ts
var s = (e) => ({
	kind: e,
	valueKind: "free-text"
});
function c(e, t) {
	if (t.length === 0) return e;
	let n = [], r = 0;
	for (let [i, a] of [...t].sort((e, t) => e[0] - t[0])) {
		let t = Math.max(r, i), o = Math.min(e.length, a);
		o <= t || (t > r && n.push(e.slice(r, t)), n.push(e.slice(t, o).replace(/[^\n]/g, " ")), r = o);
	}
	return r < e.length && n.push(e.slice(r)), n.join("");
}
function l(e, t, n) {
	for (let t of e) if (t.type === "comment" && n > t.start && n <= t.end || t.type === "verb" && n >= t.start && n < t.end) return !0;
	return t.some(([e, t]) => n >= e && n < t);
}
function u(e, t, n, i, a) {
	for (let o = t.length - 1; o >= 0; o--) {
		let s = t[o];
		if (s.type !== "command" || n < s.start + 1 || n > s.end) continue;
		if (!/^[a-zA-Z@]*$/.test(s.value)) return null;
		let c = s.start + 1;
		return {
			type: "command",
			domain: "command",
			documentPath: a,
			prefix: e.slice(c, n),
			replacementRange: r(i, c, s.end)
		};
	}
	return null;
}
function d(e, t) {
	let n = t;
	for (; n < e.length && /\s/.test(e[n]);) n++;
	return n;
}
function f(e, t) {
	let n = [e[t] === "{" ? "}" : "]"];
	for (let r = t + 1; r < e.length; r++) {
		let t = e[r];
		if (t === "\\") {
			r++;
			continue;
		}
		if (t === "{") n.push("}");
		else if (t === "[") n.push("]");
		else if (t === n[n.length - 1] && (n.pop(), n.length === 0)) return {
			closed: !0,
			contentEnd: r,
			end: r + 1
		};
	}
	return {
		closed: !1,
		contentEnd: e.length,
		end: e.length
	};
}
function p(e, t) {
	let n = 0;
	for (let r of e) {
		for (; n < t.length && t[n].kind === "optional" && r.delimiter !== "optional";) n++;
		let e = t[n];
		e?.kind === r.delimiter && (r.signatureIndex = n, r.spec = e, n++);
	}
}
function m(e, t, n) {
	let r = t.end, i = !1;
	e[r] === "*" && (i = !0, r++);
	let o = [];
	for (let t = 0; t < 64; t++) {
		r = d(e, r);
		let n = e[r];
		if (n !== "{" && n !== "[") break;
		let i = n === "{" ? "required" : "optional", a = f(e, r);
		if (o.push({
			delimiter: i,
			open: r,
			contentStart: r + 1,
			contentEnd: a.contentEnd,
			end: a.end,
			closed: a.closed,
			argumentIndex: t,
			spec: s(i)
		}), r = a.end, !a.closed) break;
	}
	if (o.length === 0) return null;
	let c = n?.getCommandArguments(t.value) ?? a(t.value);
	return c && p(o, c), {
		command: t.value,
		starred: i,
		groups: o
	};
}
function h(e, t, n, r) {
	let i = [], a = [];
	for (let o = t; o < n; o++) {
		let t = e[o];
		if (t === "\\") {
			o++;
			continue;
		}
		t === "{" ? a.push("}") : t === "[" ? a.push("]") : t === a[a.length - 1] ? a.pop() : a.length === 0 && t === r && i.push(o);
	}
	return i;
}
function g(e, t, n) {
	let r = t;
	for (; r < n && /\s/.test(e[r]);) r++;
	return r;
}
function _(e, t, n) {
	let r = n;
	for (; r > t && /\s/.test(e[r - 1]);) r--;
	return r;
}
function v(e, t, n, r) {
	let i = r ? h(e, t, n, ",") : [], a = [], o = t;
	for (let t of [...i, n]) {
		let n = e.slice(o, t).trim();
		n && a.push(n), o = t + 1;
	}
	return a;
}
function y(e, t) {
	let n = [];
	for (let r of t) {
		let t = r.spec.valueKind ?? "free-text";
		if (t === "free-text" || t === "key-value") continue;
		let i = {
			argumentIndex: r.argumentIndex,
			valueKind: t,
			values: v(e, r.contentStart, r.contentEnd, r.spec.list ?? !1)
		};
		r.signatureIndex !== void 0 && (i.signatureIndex = r.signatureIndex), n.push(i);
	}
	return n;
}
function b(e, t, n) {
	let r = t.spec.list ? h(e, t.contentStart, t.contentEnd, ",") : [], i = t.contentStart, a = t.contentEnd, o = 0;
	for (let e of r) if (e < n) i = e + 1, o++;
	else {
		a = e;
		break;
	}
	return {
		start: i,
		end: a,
		listIndex: o
	};
}
function x(e, t, n) {
	let r = h(e, t.start, t.end, "=")[0];
	if (r === void 0) {
		let n = g(e, t.start, t.end);
		return {
			start: n,
			end: _(e, n, t.end),
			keyValuePosition: "key"
		};
	}
	let i = e.slice(g(e, t.start, r), _(e, t.start, r));
	if (n <= r) {
		let n = g(e, t.start, r);
		return {
			start: n,
			end: _(e, n, r),
			keyValuePosition: "key",
			key: i
		};
	}
	let a = g(e, r + 1, t.end);
	return {
		start: a,
		end: _(e, a, t.end),
		keyValuePosition: "value",
		key: i
	};
}
function S(e, t, n) {
	let r = b(e, t, n), i = t.spec.valueKind === "key-value" ? x(e, r, n) : {
		start: g(e, r.start, r.end),
		end: _(e, r.start, r.end)
	}, { start: a, end: o } = i;
	n < a && (a = n), n > o && (o = n);
	let s = {
		prefix: e.slice(a, n),
		start: a,
		end: o,
		listIndex: r.listIndex
	};
	return "keyValuePosition" in i && (s.keyValuePosition = i.keyValuePosition), "key" in i && i.key && (s.key = i.key), s;
}
function C(e, t, n) {
	if (t.spec.valueKind !== "key-value") return [];
	let r = h(e, t.contentStart, t.contentEnd, ","), i = /* @__PURE__ */ new Set(), a = t.contentStart;
	for (let [o, s] of [...r, t.contentEnd].entries()) {
		if (o !== n) {
			let t = h(e, a, s, "=")[0] ?? s, n = e.slice(g(e, a, t), _(e, a, t));
			n && i.add(n);
		}
		a = s + 1;
	}
	return [...i].sort();
}
function w(e, t, n, i, a, o) {
	let s = S(e, o, t), c = o.spec.valueKind ?? "free-text", l = y(e, a.groups), u = o.spec.selectorArgumentIndex === void 0 ? void 0 : l.find((e) => e.signatureIndex === o.spec.selectorArgumentIndex), d = o.spec.keyFamilySelectorArgumentIndex === void 0 ? void 0 : l.find((e) => e.signatureIndex === o.spec.keyFamilySelectorArgumentIndex);
	return {
		type: "argument",
		domain: c,
		documentPath: i,
		command: a.command,
		starred: a.starred,
		argumentIndex: o.argumentIndex,
		delimiter: o.delimiter,
		valueKind: c,
		list: o.spec.list ?? !1,
		listIndex: s.listIndex,
		usedKeys: C(e, o, s.listIndex),
		prefix: s.prefix,
		replacementRange: r(n, s.start, s.end),
		relatedArguments: l,
		...o.signatureIndex === void 0 ? {} : { signatureIndex: o.signatureIndex },
		...o.spec.keyFamily ? { keyFamily: o.spec.keyFamily } : {},
		...s.keyValuePosition ? { keyValuePosition: s.keyValuePosition } : {},
		...s.key ? { key: s.key } : {},
		...u ? { selector: u } : {},
		...d ? { keyFamilySelector: d } : {}
	};
}
function T(e, t, n, r, i, a) {
	for (let o = t.length - 1; o >= 0; o--) {
		let s = t[o];
		if (s.type !== "command" || s.start >= n) continue;
		let c = m(e, s, a);
		if (!c) continue;
		let l = c.groups.find((e) => n >= e.contentStart && n <= e.contentEnd);
		if (l) return w(e, n, r, i, c, l);
	}
	return null;
}
function E(r, a, s) {
	try {
		if (r.path.toLowerCase().endsWith(".bib")) return o(r, a);
		let d = r.getText(), f = t(d), p = n(d, f, a), m = e(d), h = i(m);
		if (l(m, h, p)) return null;
		let g = c(d, h), _ = T(g, m, p, f, r.path, s);
		return _ && _.valueKind !== "free-text" ? _ : u(g, m, p, f, r.path) ?? _;
	} catch {
		return null;
	}
}
//#endregion
export { E as analyzeCompletionContext };
