//#region src/viewer/page-visibility.ts
function e(e) {
	let t = null, n = 0;
	for (let [r, i] of e) i <= 0 || (t === null || i > n || i === n && r < t) && (t = r, n = i);
	return t;
}
//#endregion
export { e as pickMostVisiblePage };
