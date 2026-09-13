//#region src/lsp/balanced-group.ts
function e(e, t, n = !1) {
	let r = [e[t] === "{" ? "}" : "]"];
	for (let i = t + 1; i < e.length; i++) {
		let t = e[i];
		if (t === "\\") {
			i++;
			continue;
		}
		if (t === "{") r.push("}");
		else if (n && t === "[" && r[r.length - 1] === "]") r.push("]");
		else if (t === r[r.length - 1] && (r.pop(), r.length === 0)) return {
			closed: !0,
			contentEnd: i,
			end: i + 1
		};
	}
	return {
		closed: !1,
		contentEnd: e.length,
		end: e.length
	};
}
//#endregion
export { e as readBalancedGroup };
