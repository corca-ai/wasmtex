//#region src/engine/texlive-dependencies.ts
var e = {
	format: 11,
	filename: "pdftex.map"
};
function t(e) {
	let t = e.attempts.find((e) => e.source === "network" && e.outcome === "hit");
	return t?.candidate && t.candidate !== e.requestedName ? t.candidate : void 0;
}
function n(e, n, r) {
	let i = t(r), a = e.files.get(n);
	(!a || i && !a.candidate) && e.files.set(n, {
		format: r.format,
		filename: r.requestedName,
		...i ? { candidate: i } : {}
	}), e.notFound.delete(n);
}
function r(e, t) {
	if (t.format === 10) return;
	let r = `${t.format}/${t.requestedName}`;
	t.outcome === "resolved" ? n(e, r, t) : t.outcome === "mirror-absent" && !e.files.has(r) && e.notFound.set(r, {
		format: t.format,
		filename: t.requestedName
	});
}
function i(t, n, i, a = {}) {
	let o = i.filter((e) => !!e);
	if (o.length === 0) return;
	let s = {
		files: /* @__PURE__ */ new Map(),
		notFound: /* @__PURE__ */ new Map(),
		complete: !0
	}, c = !1;
	for (let e of o) {
		e.complete || (s.complete = !1);
		for (let t of e.entries) t.stage === "pdftex" && (c = !0), !(a.excludeNames?.has(t.requestedName) && t.outcome !== "resolved") && r(s, t);
	}
	let l = `${e.format}/${e.filename}`;
	return c && !s.files.has(l) && s.files.set(l, { ...e }), {
		schemaVersion: 1,
		texliveVersion: t,
		profile: { ...n },
		files: [...s.files.values()],
		notFound: [...s.notFound.values()],
		complete: s.complete
	};
}
function a(e, t) {
	if (!e) return t;
	let n = /* @__PURE__ */ new Map();
	for (let t of e.files) n.set(`${t.format}/${t.filename}`, t);
	for (let e of t.files) {
		let t = `${e.format}/${e.filename}`, r = n.get(t);
		n.set(t, r?.candidate && !e.candidate ? r : e);
	}
	let r = /* @__PURE__ */ new Map();
	for (let i of [...e.notFound, ...t.notFound]) {
		let e = `${i.format}/${i.filename}`;
		n.has(e) || r.set(e, i);
	}
	return {
		schemaVersion: 1,
		texliveVersion: t.texliveVersion,
		profile: { ...t.profile },
		files: [...n.values()],
		notFound: [...r.values()],
		complete: e.complete && t.complete
	};
}
//#endregion
export { i as buildTexliveDependencySet, a as mergeTexliveDependencySets };
