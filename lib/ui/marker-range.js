//#region src/ui/marker-range.ts
function e(e, t, n, r, i) {
	let a = Math.min(Math.max(e, 1), Math.max(r, 1)), o = i(a), s = Math.min(Math.max(t, 1), o);
	return {
		startLineNumber: a,
		startColumn: s,
		endLineNumber: a,
		endColumn: Math.min(Math.max(n, s), o)
	};
}
//#endregion
export { e as clampMarkerRange };
