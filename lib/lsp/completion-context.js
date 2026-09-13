import { readBalancedGroup as e } from "./balanced-group.js";
import { tokenize as t } from "./latex-tokenizer.js";
import { buildLineStarts as n, positionToOffset as r, rangeFromOffsets as i } from "./source-position.js";
import { maskSpansFromTokens as a } from "./latex-parser.js";
import { getCommandSignature as o } from "./package-db.js";
import { analyzeBibCompletionContext as s } from "./bib-completion-context.js";
//#region src/lsp/completion-context.ts
var c = (e) => ({
	kind: e,
	valueKind: "free-text"
});
function l(e, t) {
	if (t.length === 0) return e;
	let n = [], r = 0;
	for (let [i, a] of [...t].sort((e, t) => e[0] - t[0])) {
		let t = Math.max(r, i), o = Math.min(e.length, a);
		o <= t || (t > r && n.push(e.slice(r, t)), n.push(e.slice(t, o).replace(/[^\n]/g, " ")), r = o);
	}
	return r < e.length && n.push(e.slice(r)), n.join("");
}
function u(e, t, n) {
	for (let t of e) if (t.type === "comment" && n > t.start && n <= t.end || t.type === "verb" && n >= t.start && n < t.end) return !0;
	return t.some(([e, t]) => n >= e && n < t);
}
function d(e, t, n, r, a) {
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
			replacementRange: i(r, c, s.end)
		};
	}
	return null;
}
function f(e, t) {
	let n = t;
	for (; n < e.length && /\s/.test(e[n]);) n++;
	return n;
}
function p(e, t, n) {
	if (t !== void 0) {
		for (; e[t]?.kind === "optional" && n !== "optional";) t++;
		return e[t]?.kind === n ? t : void 0;
	}
}
function m(e, t, n) {
	if (!/^[a-zA-Z@]+$/.test(t.value)) return null;
	let r = t.end, i = !1;
	e[r] === "*" && (i = !0, r++);
	let a = `${t.value}${i ? "*" : ""}`, s = n?.getCommandArguments(a) ?? o(a) ?? [], c = h(e, r, s);
	return c.length ? {
		command: t.value,
		starred: i,
		groups: c
	} : null;
}
function h(t, n, r) {
	let i = 0, a = [];
	for (let o = 0; o < 64; o++) {
		n = f(t, n);
		let s = t[n];
		if (s !== "{" && s !== "[") break;
		let l = s === "{" ? "required" : "optional";
		i = p(r, i, l);
		let u = i === void 0 ? c(l) : r[i], d = e(t, n, u.balancedOptional);
		if (a.push({
			delimiter: l,
			open: n,
			contentStart: n + 1,
			contentEnd: d.contentEnd,
			end: d.end,
			closed: d.closed,
			argumentIndex: o,
			spec: u,
			...i === void 0 ? {} : { signatureIndex: i }
		}), i !== void 0 && i++, n = d.end, !d.closed) break;
	}
	return a;
}
function g(e, t, n, r) {
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
function _(e, t, n) {
	let r = t;
	for (; r < n && /\s/.test(e[r]);) r++;
	return r;
}
function v(e, t, n) {
	let r = n;
	for (; r > t && /\s/.test(e[r - 1]);) r--;
	return r;
}
function y(e, t, n, r) {
	let i = r ? g(e, t, n, ",") : [], a = [], o = t;
	for (let t of [...i, n]) {
		let n = e.slice(o, t).trim();
		n && a.push(n), o = t + 1;
	}
	return a;
}
function b(e, t) {
	let n = [];
	for (let r of t) {
		let t = r.spec.valueKind ?? "free-text";
		if (t === "free-text" || t === "key-value") continue;
		let i = {
			argumentIndex: r.argumentIndex,
			valueKind: t,
			values: y(e, r.contentStart, r.contentEnd, r.spec.list ?? !1)
		};
		r.signatureIndex !== void 0 && (i.signatureIndex = r.signatureIndex), n.push(i);
	}
	return n;
}
function x(e, t, n) {
	let r = t.spec.list ? g(e, t.contentStart, t.contentEnd, ",") : [], i = t.contentStart, a = t.contentEnd, o = 0;
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
function S(e, t, n) {
	let r = g(e, t.start, t.end, "=")[0];
	if (r === void 0) {
		let n = _(e, t.start, t.end);
		return {
			start: n,
			end: v(e, n, t.end),
			keyValuePosition: "key"
		};
	}
	let i = e.slice(_(e, t.start, r), v(e, t.start, r));
	if (n <= r) {
		let n = _(e, t.start, r);
		return {
			start: n,
			end: v(e, n, r),
			keyValuePosition: "key",
			key: i
		};
	}
	let a = _(e, r + 1, t.end);
	return {
		start: a,
		end: v(e, a, t.end),
		keyValuePosition: "value",
		key: i
	};
}
function C(e, t, n) {
	let r = x(e, t, n), i = t.spec.valueKind === "key-value" ? S(e, r, n) : {
		start: _(e, r.start, r.end),
		end: v(e, r.start, r.end)
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
function w(e, t, n) {
	if (t.spec.valueKind !== "key-value") return [];
	let r = g(e, t.contentStart, t.contentEnd, ","), i = /* @__PURE__ */ new Set(), a = t.contentStart;
	for (let [o, s] of [...r, t.contentEnd].entries()) {
		if (o !== n) {
			let t = g(e, a, s, "=")[0] ?? s, n = e.slice(_(e, a, t), v(e, a, t));
			n && i.add(n);
		}
		a = s + 1;
	}
	return [...i].sort();
}
function T(e, t, n, r, a, o) {
	let s = C(e, o, t), c = o.spec.valueKind ?? "free-text", l = b(e, a.groups), u = o.spec.selectorArgumentIndex === void 0 ? void 0 : l.find((e) => e.signatureIndex === o.spec.selectorArgumentIndex), d = o.spec.keyFamilySelectorArgumentIndex === void 0 ? void 0 : l.find((e) => e.signatureIndex === o.spec.keyFamilySelectorArgumentIndex);
	return {
		type: "argument",
		domain: c,
		documentPath: r,
		command: a.command,
		starred: a.starred,
		argumentIndex: o.argumentIndex,
		delimiter: o.delimiter,
		valueKind: c,
		list: o.spec.list ?? !1,
		listIndex: s.listIndex,
		usedKeys: w(e, o, s.listIndex),
		prefix: s.prefix,
		replacementRange: i(n, s.start, s.end),
		relatedArguments: l,
		...o.signatureIndex === void 0 ? {} : { signatureIndex: o.signatureIndex },
		...o.spec.keyFamily ? { keyFamily: o.spec.keyFamily } : {},
		...s.keyValuePosition ? { keyValuePosition: s.keyValuePosition } : {},
		...s.key ? { key: s.key } : {},
		...u ? { selector: u } : {},
		...d ? { keyFamilySelector: d } : {}
	};
}
function E(e, t, n, r, i, a) {
	for (let o = t.length - 1; o >= 0; o--) {
		let s = t[o];
		if (s.type !== "command" || s.start >= n) continue;
		let c = m(e, s, a);
		if (!c) continue;
		let l = c.groups.find((e) => n >= e.contentStart && n <= e.contentEnd);
		if (l) return T(e, n, r, i, c, l);
	}
	return null;
}
function D(e, i, o) {
	try {
		if (e.path.toLowerCase().endsWith(".bib")) return s(e, i);
		let c = e.getText(), f = n(c), p = r(c, f, i), m = t(c), h = a(m);
		if (u(m, h, p)) return null;
		let g = l(c, h), _ = E(g, m, p, f, e.path, o);
		return _ && _.valueKind !== "free-text" ? _ : d(g, m, p, f, e.path) ?? _;
	} catch {
		return null;
	}
}
//#endregion
export { D as analyzeCompletionContext };
