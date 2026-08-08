//#region src/lsp/aux-parser.ts
function e(e) {
	let n = t(e, 0);
	return n && n.end === e.length ? n.content : e;
}
function t(e, t) {
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
function n(n, r) {
	let i = "\\newlabel{";
	for (let a = n.indexOf(i); a !== -1; a = n.indexOf(i, a + 1)) {
		let i = t(n, a + 10 - 1);
		if (!i) continue;
		let o = t(n, i.end);
		if (!o) continue;
		let s = t(o.content, 0);
		if (!s) continue;
		let c = e(s.content);
		r.set(i.content.trim(), c);
	}
}
function r(n, r) {
	let i = "\\bibcite{";
	for (let a = n.indexOf(i); a !== -1; a = n.indexOf(i, a + 1)) {
		let i = t(n, a + 9 - 1);
		i && r.add(e(i.content).trim());
	}
}
function i(e, n) {
	let r = "\\@input{";
	for (let i = e.indexOf(r); i !== -1; i = e.indexOf(r, i + 1)) {
		let r = t(e, i + 8 - 1);
		r && n.push(r.content);
	}
}
function a(e) {
	let t = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), o = [];
	return n(e, t), r(e, a), i(e, o), {
		labels: t,
		citations: a,
		includes: o
	};
}
//#endregion
export { a as parseAuxFile };
