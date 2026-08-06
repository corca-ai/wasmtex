//#region src/viewer/scale.ts
var e = .25;
function t(t) {
	return Math.max(e, Math.min(5, t));
}
function n(e, t, n) {
	return t > 0 ? n / t * e : e;
}
function r(e, t) {
	let n = e.aspectRatio.match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/);
	if (!n) return 0;
	let r = Number.parseFloat(n[1]), i = Number.parseFloat(n[2]);
	return !(r > 0) || !(i > 0) ? 0 : e.width * t * (i / r);
}
function i(e, t, n) {
	let i = 0;
	for (let a = 0; a < t - 1; a++) {
		let t = e[a];
		t && (i += r(t, n));
	}
	return i;
}
function a(e) {
	let { scrollTop: t, oldPageOffsetTop: r, newTargetOffsetTop: i, oldScale: a, newScale: o, anchorToTop: s } = e;
	return s || r === null ? i : i + n(t - r, a, o);
}
//#endregion
export { e as MIN_SCALE, t as clampScale, a as computeRestoredScrollTop, i as computeTargetOffsetTop, n as rescaleInPageOffset };
