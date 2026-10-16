//#region src/synctex/synctex-query-result.ts
function e(e, t) {
	return {
		file: e.inputs.get(t.input) ?? "",
		line: t.line,
		...t.column > 0 ? { column: t.column } : {}
	};
}
function t(e) {
	let t = [
		"hbox",
		"vbox",
		"void_hbox",
		"void_vbox"
	].includes(e.type), n = t ? e.h + e.width : e.type === "kern" ? e.h - e.width : e.h, r = e.v - (t ? e.height : e.parent?.height ?? 0), i = e.v + (t ? e.depth : 0);
	return {
		page: e.page,
		x: Math.min(e.h, n),
		y: Math.min(r, i),
		width: Math.abs(n - e.h),
		height: Math.abs(i - r)
	};
}
function n(n, r, i, a, o, s = null) {
	for (; s && ![
		"hbox",
		"vbox",
		"void_hbox",
		"void_vbox"
	].includes(s.type);) s = s.parent;
	let c = t(r), l = Math.max(c.x - i, i - c.x - c.width, 0) + Math.max(c.y - a, a - c.y - c.height, 0);
	return {
		source: e(n, r),
		region: c,
		container: s ? t(s) : null,
		nodeType: r.type,
		method: o,
		distance: l,
		match: l === 0 ? "contains" : "nearby"
	};
}
//#endregion
export { n as describeSynctexInverseMatch, e as synctexSourceLocation };
