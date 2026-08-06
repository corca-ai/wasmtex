//#region src/engine/preamble-utils.ts
function e(e) {
	let n = 0;
	for (;;) {
		let r = e.indexOf("\\begin{document}", n);
		if (r === -1) return null;
		let i = e.lastIndexOf("\n", r - 1) + 1;
		if (t(e.substring(i, r))) {
			n = r + 16;
			continue;
		}
		return {
			preamble: e.substring(0, r),
			body: e.substring(r),
			preambleLineCount: e.substring(0, r).split("\n").length
		};
	}
}
function t(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		if (r === "\\") {
			t++;
			continue;
		}
		if (r === "%" && t % 2 == 0) return !0;
		t = 0;
	}
	return !1;
}
function n(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) t = (t << 5) - t + e.charCodeAt(n) | 0;
	return t.toString(36);
}
//#endregion
export { e as extractPreamble, n as simpleHash };
