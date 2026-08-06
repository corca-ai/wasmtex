//#region src/engine/checkpoint-boundaries.ts
var e = /\\(?:clearpage|cleardoublepage|newpage)\b|\\include\{[^}]*\}/g;
function t(t) {
	let n = [];
	for (let r of t.matchAll(e)) {
		let e = r.index, a = t.lastIndexOf("\n", e - 1) + 1;
		i(t.slice(a, e)) || n.push(e + r[0].length);
	}
	return n;
}
var n = /\\(?:include|input|subfile)\{([^}]+)\}/g;
function r(e) {
	let t = /* @__PURE__ */ new Map();
	for (let r of e.matchAll(n)) {
		let n = r.index, a = e.lastIndexOf("\n", n - 1) + 1;
		if (i(e.slice(a, n))) continue;
		let o = r[1].trim().replace(/\.tex$/, "");
		t.has(o) || t.set(o, n);
	}
	return t;
}
function i(e) {
	for (let t = 0; t < e.length; t++) {
		if (e[t] !== "%") continue;
		let n = 0;
		for (let r = t - 1; r >= 0 && e[r] === "\\"; r--) n++;
		if (n % 2 == 0) return !0;
	}
	return !1;
}
function a(e, t) {
	let n = Math.min(e.length, t.length), r = 0;
	for (; r < n && e.charCodeAt(r) === t.charCodeAt(r);) r++;
	return r;
}
function o(e, t, n = 0) {
	let r = null;
	for (let i of e) i <= t && i >= n && (r === null || i > r) && (r = i);
	return r;
}
function s(e, t) {
	return {
		headText: e.slice(0, t),
		tailText: e.slice(t)
	};
}
function c(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) t = (t << 5) - t + e.charCodeAt(n) | 0;
	return (t >>> 0).toString(36);
}
//#endregion
export { o as chooseBoundary, t as findPageBreaks, a as firstDifference, c as hashString, r as includePositions, s as splitAtBoundary };
