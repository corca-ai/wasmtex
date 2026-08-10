import { NEWCMD_CMDS as e } from "./lsp/latex-patterns.js";
//#region src/structural-declarations.ts
var t = new Set(e.split("|")), n = /* @__PURE__ */ new Map([
	["DeclareMathOperator", a],
	["DeclarePairedDelimiter", o],
	["newglossaryentry", s],
	["longnewglossaryentry", s],
	["newacronym", c]
]);
function r(e, r) {
	let a = [];
	for (let o of r) {
		if (o.type !== "command") continue;
		let r = (t.has(o.value) ? i : n.get(o.value))?.(e, o);
		r && a.push(r);
	}
	return a;
}
function i(e, t) {
	let n = f(e.content, t), r = d(n), i = n.groups.filter((e) => e.syntax === "optional"), a = S(r[0]?.text);
	if (!a) return null;
	let o = r[1], s = i[0]?.text.trim();
	return {
		kind: "macro",
		name: a,
		...s === void 0 || !/^\d+$/.test(s) ? {} : { parameters: Number.parseInt(s, 10) },
		...i[1] === void 0 ? {} : { optionalDefault: i[1].text },
		...o === void 0 ? {} : {
			body: o.text,
			bodySource: C(e, o.contentRange)
		},
		source: C(e, n.range),
		state: n.complete && o !== void 0 ? "complete" : "incomplete"
	};
}
function a(e, t) {
	let n = l(e, t);
	if (!n) return null;
	let { invocation: r, name: i, required: a, source: o, nameSource: s } = n;
	return {
		kind: "operator",
		name: i,
		surface: a[1]?.text.trim() ?? "",
		limits: r.starred,
		source: o,
		nameSource: s,
		surfaceSource: C(e, a[1]?.contentRange ?? w(r.range.endOffset)),
		state: r.complete && a.length >= 2 ? "complete" : "incomplete"
	};
}
function o(e, t) {
	let n = l(e, t);
	if (!n) return null;
	let { invocation: r, name: i, required: a, source: o, nameSource: s } = n;
	return {
		kind: "paired-delimiter",
		name: i,
		left: a[1]?.text.trim() ?? "",
		right: a[2]?.text.trim() ?? "",
		source: o,
		nameSource: s,
		state: r.complete && a.length >= 3 ? "complete" : "incomplete"
	};
}
function s(e, t) {
	let n = u(e, t);
	if (!n) return null;
	let { invocation: r, key: i, keySource: a, optional: o, required: s, source: c } = n;
	return {
		kind: "glossary",
		key: i,
		options: o ? h(e, o) : [],
		fields: s[1] ? h(e, s[1]) : [],
		source: c,
		keySource: a,
		state: r.complete && s.length >= 2 ? "complete" : "incomplete"
	};
}
function c(e, t) {
	let n = u(e, t);
	if (!n) return null;
	let { invocation: r, key: i, keySource: a, optional: o, required: s, source: c } = n;
	return {
		kind: "acronym",
		key: i,
		short: s[1]?.text.trim() ?? "",
		long: s[2]?.text.trim() ?? "",
		options: o ? h(e, o) : [],
		source: c,
		keySource: a,
		shortSource: C(e, s[1]?.contentRange ?? w(r.range.endOffset)),
		longSource: C(e, s[2]?.contentRange ?? w(r.range.endOffset)),
		state: r.complete && s.length >= 3 ? "complete" : "incomplete"
	};
}
function l(e, t) {
	let n = f(e.content, t), r = d(n), i = S(r[0]?.text);
	return i ? {
		invocation: n,
		required: r,
		name: i,
		source: C(e, n.range),
		nameSource: C(e, r[0].contentRange)
	} : null;
}
function u(e, t) {
	let n = f(e.content, t), r = d(n), i = r[0]?.text.trim();
	return i ? {
		invocation: n,
		required: r,
		key: i,
		optional: n.groups.find((e) => e.syntax === "optional"),
		source: C(e, n.range),
		keySource: C(e, r[0].contentRange)
	} : null;
}
function d(e) {
	return e.groups.filter((e) => e.syntax === "required");
}
function f(e, t) {
	let n = t.end, r = !1;
	e[n] === "*" && (r = !0, n++);
	let i = [];
	for (let t = 0; t < 8; t++) {
		for (; /\s/.test(e[n] ?? "");) n++;
		let t = e[n];
		if (t !== "{" && t !== "[") break;
		let r = p(e, n);
		if (i.push(r), n = r.range.endOffset, !r.complete) break;
	}
	return {
		starred: r,
		groups: i,
		range: {
			startOffset: t.start,
			endOffset: n
		},
		complete: i.every((e) => e.complete)
	};
}
function p(e, t) {
	let n = e[t], r = [n === "{" ? "}" : "]"];
	for (let i = t + 1; i < e.length; i++) {
		let a = e[i];
		if (a === "\\") {
			i++;
			continue;
		}
		if (m(a, r)) return {
			syntax: n === "{" ? "required" : "optional",
			range: {
				startOffset: t,
				endOffset: i + 1
			},
			contentRange: {
				startOffset: t + 1,
				endOffset: i
			},
			text: e.slice(t + 1, i),
			complete: !0
		};
	}
	return {
		syntax: n === "{" ? "required" : "optional",
		range: {
			startOffset: t,
			endOffset: e.length
		},
		contentRange: {
			startOffset: t + 1,
			endOffset: e.length
		},
		text: e.slice(t + 1),
		complete: !1
	};
}
function m(e, t) {
	return e === "{" ? t.push("}") : e === "[" ? t.push("]") : e === t[t.length - 1] && t.pop(), t.length === 0;
}
function h(e, t) {
	let n = [];
	for (let [r, i] of g(t.text)) {
		let a = y(t.text, r, i), o = b(t.text, a, i);
		if (o <= a) continue;
		let s = _(t.text, a, o), c = s < 0 ? o : b(t.text, a, s), l = s < 0 ? o : y(t.text, s + 1, o), u = b(t.text, l, o), d = t.text.slice(a, c);
		d && n.push({
			name: d,
			value: x(t.text.slice(l, u)),
			source: C(e, {
				startOffset: t.contentRange.startOffset + a,
				endOffset: t.contentRange.startOffset + o
			})
		});
	}
	return n;
}
function g(e) {
	let t = [], n = 0;
	for (let r of v(e, 0, e.length, ",")) t.push([n, r]), n = r + 1;
	return t.push([n, e.length]), t;
}
function _(e, t, n) {
	return v(e, t, n, "=")[0] ?? -1;
}
function v(e, t, n, r) {
	let i = [], a = [];
	for (let o = t; o < n; o++) {
		let t = e[o];
		if (t === "\\") {
			o++;
			continue;
		}
		t === "{" ? a.push("}") : t === "[" ? a.push("]") : t === a[a.length - 1] ? a.pop() : t === r && a.length === 0 && i.push(o);
	}
	return i;
}
function y(e, t, n) {
	for (; t < n && /\s/.test(e[t]);) t++;
	return t;
}
function b(e, t, n) {
	for (; n > t && /\s/.test(e[n - 1]);) n--;
	return n;
}
function x(e) {
	return e.startsWith("{") && e.endsWith("}") ? e.slice(1, -1) : e;
}
function S(e) {
	let t = e?.trim();
	if (!t?.startsWith("\\")) return null;
	let n = t.slice(1);
	return /^[A-Za-z@]+$/.test(n) ? n : null;
}
function C(e, t) {
	return {
		fileId: e.fileId,
		path: e.path,
		range: t
	};
}
function w(e) {
	return {
		startOffset: e,
		endOffset: e
	};
}
//#endregion
export { r as collectRichStructuralDeclarations };
