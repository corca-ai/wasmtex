//#region src/lsp/diagnostic-repair-arguments.ts
function e(e, i, a, o, s) {
	if (s.length > 64) return null;
	let c = [], l = o;
	for (let o = 0; o < s.length; o++) {
		let u = s[o], d = r(e, i.masked, l);
		if (u.kind === "optional" && (d === null || i.masked[d] !== "[")) continue;
		if (d === null) return null;
		let f = i.masked[d];
		if (d === e.length || f === "}") return t(c, s.slice(o), l, d === e.length);
		let p = n(e, i, a, d, u);
		if (!p) return null;
		c.push(p), l = p.end;
	}
	return {
		arguments: c,
		missing: [],
		insertOffset: l
	};
}
function t(e, t, n, r) {
	return {
		arguments: e,
		missing: t.filter((e) => e.kind === "required"),
		insertOffset: n,
		missingBoundary: r ? "eof" : "group"
	};
}
function n(e, t, n, r, i) {
	let a = t.masked[r];
	if (a === "{" || i.kind === "optional") {
		let e = (i.balancedOptional ? t.balancedGroups : t.groups).get(r);
		return e === void 0 ? null : {
			spec: i,
			start: r,
			end: e + 1,
			grouped: !0
		};
	}
	let o = n.get(r);
	return o ? {
		spec: i,
		start: r,
		end: o.end,
		grouped: !1,
		commandOffset: r
	} : e[r] !== a || /[\\$&#_^~]/.test(a) || a.charCodeAt(0) > 127 ? null : {
		spec: i,
		start: r,
		end: r + 1,
		grouped: !1
	};
}
function r(e, t, n) {
	let r = n, i = 0;
	for (; r < e.length;) {
		let n = e[r];
		if (n === "%" && t[r] === " ") {
			let t = e.indexOf("\n", r);
			if (t < 0) return e.length;
			r = t + 1;
			continue;
		}
		if (!/[ \t\r\n]/.test(n)) return e[r] === t[r] ? r : null;
		if (n === "\n" && ++i > 1) return null;
		r++;
	}
	return r;
}
//#endregion
export { e as consumeRepairArguments };
