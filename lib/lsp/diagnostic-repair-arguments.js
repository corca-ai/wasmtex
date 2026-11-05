import { newlineLength as e } from "./source-position.js";
//#region src/lsp/diagnostic-repair-arguments.ts
function t(e, t, a, o, s) {
	if (s.length > 64) return null;
	let c = [], l = o;
	for (let o = 0; o < s.length; o++) {
		let u = s[o], d = i(e, t.masked, l);
		if (u.kind === "optional" && (d === null || t.masked[d] !== "[")) continue;
		if (d === null) return null;
		let f = t.masked[d];
		if (d === e.length || f === "}") return n(c, s.slice(o), l, d === e.length);
		let p = r(e, t, a, d, u);
		if (!p) return null;
		c.push(p), l = p.end;
	}
	return {
		arguments: c,
		missing: [],
		insertOffset: l
	};
}
function n(e, t, n, r) {
	return {
		arguments: e,
		missing: t.filter((e) => e.kind === "required"),
		insertOffset: n,
		missingBoundary: r ? "eof" : "group"
	};
}
function r(e, t, n, r, i) {
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
function i(t, n, r) {
	let i = r, o = 0;
	for (; i < t.length;) {
		let r = t[i];
		if (r === "%" && n[i] === " ") {
			i = a(t, i);
			continue;
		}
		let s = e(t, i);
		if (s) {
			if (++o > 1) return null;
			i += s;
			continue;
		}
		if (!/[ \t]/.test(r)) return t[i] === n[i] ? i : null;
		i++;
	}
	return i;
}
function a(e, t) {
	let n = /\r\n|\r|\n/.exec(e.slice(t));
	return n ? t + n.index + n[0].length : e.length;
}
//#endregion
export { t as consumeRepairArguments };
