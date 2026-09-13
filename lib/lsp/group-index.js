//#region src/lsp/group-index.ts
function e(e, t = !1) {
	let i = /* @__PURE__ */ new Map(), a = [], o = /* @__PURE__ */ new Map();
	for (let s = 0; s < e.length; s++) {
		let c = e.charAt(s);
		if (c === "\\") {
			s++;
			continue;
		}
		if (c === "{") a.push(s);
		else if (c === "}") o.delete(a.length), n(i, a.pop(), s);
		else if (c === "[") {
			let e = o.get(a.length) ?? [];
			e.push(s), o.set(a.length, e);
		} else c === "]" && r(i, o, a.length, s, t);
	}
	return i;
}
function t(e, t, n) {
	for (let r of t ?? []) e.set(r, n);
}
function n(e, t, n) {
	t !== void 0 && e.set(t, n);
}
function r(e, r, i, a, o) {
	let s = r.get(i);
	o ? n(e, s?.pop(), a) : (t(e, s, a), r.delete(i));
}
//#endregion
export { e as indexGroupEnds };
