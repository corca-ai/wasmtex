//#region src/lsp/source-position.ts
function e(e) {
	let t = [0];
	for (let n = 0; n < e.length; n++) e[n] === "\r" ? (e[n + 1] === "\n" && n++, t.push(n + 1)) : e[n] === "\n" && t.push(n + 1);
	return t;
}
function t(e, t) {
	t < 0 && (t = 0);
	let n = 0, r = e.length - 1;
	for (; n < r;) {
		let i = n + r + 1 >> 1;
		e[i] <= t ? n = i : r = i - 1;
	}
	return {
		line: n + 1,
		column: t - e[n] + 1
	};
}
function n(e, t, n) {
	let r = Math.min(Math.max(n.line - 1, 0), t.length - 1), i = t[r], a = r + 1 < t.length ? t[r + 1] - 1 : e.length;
	return e[a] === "\n" && e[a - 1] === "\r" && a--, Math.min(Math.max(i + n.column - 1, i), a);
}
function r(e, n, r) {
	let i = t(e, n), a = t(e, r);
	return {
		startLine: i.line,
		startColumn: i.column,
		endLine: a.line,
		endColumn: a.column
	};
}
function i(e) {
	return /\r\n|\r|\n/.exec(e)?.[0] ?? "\n";
}
function a(e, t) {
	return e[t] === "\r" ? e[t + 1] === "\n" ? 2 : 1 : +(e[t] === "\n");
}
//#endregion
export { e as buildLineStarts, a as newlineLength, t as offsetToLineCol, n as positionToOffset, r as rangeFromOffsets, i as sourceNewline };
