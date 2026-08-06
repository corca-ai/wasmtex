//#region src/synctex/synctex-merge.ts
function e(e, t) {
	for (let [n, r] of e) if (r === t) return n;
	for (let [n, r] of e) if (r.endsWith(`/${t}`)) return n;
	return null;
}
function t(e) {
	let t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map();
	for (let [r, i] of e) {
		let e = [];
		for (let t of i) if (t.parent === null && e.push(t), t.line > 0) {
			let e = `${t.input}:${t.line}`, r = n.get(e);
			r || (r = [], n.set(e, r)), r.push(t);
		}
		t.set(r, e);
	}
	return {
		pageRoots: t,
		friendIndex: n
	};
}
function n(e, t, n, r, i, a) {
	for (let [o, s] of t.pages) {
		let t = n + o, c = [];
		for (let e of s) {
			let n = a.get(e.input);
			n !== void 0 && (e.page = t, e.input === i && e.line > 0 && (e.line += r), e.input = n, c.push(e));
		}
		e.set(t, c);
	}
}
function r(r) {
	let { head: i, tail: a, headPageCount: o, tailLineOffset: s, mainFile: c, tailFile: l } = r, u = e(i.inputs, c), d = e(a.inputs, l);
	if (u === null || d === null) return null;
	let f = [...i.inputs.keys()].reduce((e, t) => Math.max(e, t), 0), p = /* @__PURE__ */ new Map([[d, u]]), m = new Map(i.inputs);
	for (let [t, n] of a.inputs) {
		if (t === d || n.endsWith(".aux")) continue;
		let r = e(i.inputs, n) ?? f + t;
		p.set(t, r), m.has(r) || m.set(r, n);
	}
	let h = /* @__PURE__ */ new Map();
	for (let e = 1; e <= o; e++) {
		let t = i.pages.get(e);
		t && h.set(e, t);
	}
	n(h, a, o, s, d, p);
	let { pageRoots: g, friendIndex: _ } = t(h);
	return {
		inputs: m,
		pages: h,
		pageRoots: g,
		friendIndex: _,
		magnification: i.magnification,
		unit: i.unit,
		xOffset: i.xOffset,
		yOffset: i.yOffset
	};
}
//#endregion
export { r as mergeTailSynctex };
