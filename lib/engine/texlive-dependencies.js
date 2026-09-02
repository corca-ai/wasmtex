function e(e) {
	let t = e.attempts.find((e) => e.source === "network" && e.outcome === "hit");
	return t?.candidate && t.candidate !== e.requestedName ? t.candidate : void 0;
}
function t(t, n, r) {
	let i = e(r), a = t.files.get(n);
	(!a || i && !a.candidate) && t.files.set(n, {
		format: r.format,
		filename: r.requestedName,
		...i ? { candidate: i } : {}
	}), t.notFound.delete(n);
}
function n(e, n) {
	if (n.format === 10) return;
	let r = `${n.format}/${n.requestedName}`;
	n.outcome === "resolved" ? t(e, r, n) : n.outcome === "mirror-absent" && !e.files.has(r) && e.notFound.set(r, {
		format: n.format,
		filename: n.requestedName
	});
}
function r(e, t, r) {
	let i = r.filter((e) => !!e);
	if (i.length === 0) return;
	let a = {
		files: /* @__PURE__ */ new Map(),
		notFound: /* @__PURE__ */ new Map(),
		complete: !0
	};
	for (let e of i) {
		e.complete || (a.complete = !1);
		for (let t of e.entries) n(a, t);
	}
	return {
		schemaVersion: 1,
		texliveVersion: e,
		profile: { ...t },
		files: [...a.files.values()],
		notFound: [...a.notFound.values()],
		complete: a.complete
	};
}
//#endregion
export { r as buildTexliveDependencySet };
