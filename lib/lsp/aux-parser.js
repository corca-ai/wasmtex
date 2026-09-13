import { tokenize as e } from "./latex-tokenizer.js";
//#region src/lsp/aux-parser.ts
function t(e) {
	let t = n(e, 0);
	return t && t.end === e.length ? t.content : e;
}
function n(e, t) {
	if (e[t] !== "{") return null;
	let n = 0;
	for (let r = t; r < e.length; r++) {
		let i = e[r];
		if (i === "\\") {
			r++;
			continue;
		}
		if (i === "{") n++;
		else if (i === "}" && --n === 0) return {
			content: e.slice(t + 1, r),
			end: r + 1
		};
	}
	return null;
}
function r(e, r, i, a, o) {
	let s = "\\newlabel{";
	for (let c = e.indexOf(s); c !== -1; c = e.indexOf(s, c + 1)) {
		if (!a.has(c)) continue;
		let s = n(e, c + 10 - 1);
		if (!s) continue;
		let l = n(e, s.end);
		if (!l) continue;
		let u = n(l.content, 0);
		if (!u) continue;
		let d = t(u.content), f = n(l.content, u.end), p = s.content.trim();
		r.has(p) && o.add(p), r.set(p, d), i.set(p, {
			number: d,
			...f ? { page: t(f.content) } : {}
		});
	}
}
function i(e, r, i) {
	let a = "\\bibcite{";
	for (let o = e.indexOf(a); o !== -1; o = e.indexOf(a, o + 1)) {
		if (!i.has(o)) continue;
		let a = n(e, o + 9 - 1);
		a && r.add(t(a.content).trim());
	}
}
function a(e, t, r) {
	let i = "\\@input{";
	for (let a = e.indexOf(i); a !== -1; a = e.indexOf(i, a + 1)) {
		if (!r.has(a)) continue;
		let i = n(e, a + 8 - 1);
		i && t.push(i.content);
	}
}
function o(t) {
	let n = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Set(), c = /* @__PURE__ */ new Set(), l = [], u = /* @__PURE__ */ new Set(), d = 0;
	for (let n of e(t)) n.type === "open" ? d += 1 : n.type === "close" ? d = Math.max(0, d - 1) : n.type === "command" && d === 0 && u.add(n.start);
	r(t, n, o, u, s), i(t, c, u), a(t, l, u);
	for (let e of s) n.delete(e), o.delete(e);
	return {
		labels: n,
		labelDetails: o,
		ambiguousLabels: s,
		citations: c,
		includes: l
	};
}
//#endregion
export { o as parseAuxFile };
