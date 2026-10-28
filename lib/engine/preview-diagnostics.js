//#region src/engine/preview-diagnostics.ts
function e(e, t) {
	let n = /* @__PURE__ */ new Map(), r = (e) => JSON.stringify([
		e.message,
		e.line > 0 ? e.file ?? null : null,
		e.line
	]);
	for (let t of e) {
		if (t.severity !== "error") continue;
		let e = r(t);
		n.set(e, (n.get(e) ?? 0) + 1);
	}
	for (let e of t) {
		if (e.severity !== "error") continue;
		let t = r(e), i = n.get(t) ?? 0;
		if (!i) return !1;
		n.set(t, i - 1);
	}
	return !0;
}
//#endregion
export { e as previewErrorsCovered };
