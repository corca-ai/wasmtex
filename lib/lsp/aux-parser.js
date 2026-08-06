//#region src/lsp/aux-parser.ts
var e = /\\@input\{(.+?)\}/g;
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
function r(e, r) {
	let i = "\\newlabel{";
	for (let a = e.indexOf(i); a !== -1; a = e.indexOf(i, a + 1)) {
		let i = n(e, a + 10 - 1);
		if (!i) continue;
		let o = n(e, i.end);
		if (!o) continue;
		let s = n(o.content, 0);
		if (!s) continue;
		let c = t(s.content);
		r.set(i.content.trim(), c);
	}
}
function i(e, r) {
	let i = "\\bibcite{";
	for (let a = e.indexOf(i); a !== -1; a = e.indexOf(i, a + 1)) {
		let i = n(e, a + 9 - 1);
		i && r.add(t(i.content).trim());
	}
}
function a(t) {
	let n = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), o = [];
	r(t, n), i(t, a);
	for (let n of t.matchAll(e)) o.push(n[1]);
	return {
		labels: n,
		citations: a,
		includes: o
	};
}
//#endregion
export { a as parseAuxFile };
