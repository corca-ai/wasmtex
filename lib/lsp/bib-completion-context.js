import { buildLineStarts as e, positionToOffset as t, rangeFromOffsets as n } from "./source-position.js";
//#region src/lsp/bib-completion-context.ts
function r(e) {
	return e !== void 0 && /[A-Za-z0-9_.:+/-]/.test(e);
}
function i(e, t, n) {
	return e === "{" ? {
		braceDepth: n + 1,
		closes: !1
	} : e !== "}" && e !== t ? {
		braceDepth: n,
		closes: !1
	} : e === "}" && n > 0 ? {
		braceDepth: n - 1,
		closes: !1
	} : {
		braceDepth: n,
		closes: e === t
	};
}
function a(e, t) {
	let n = e[t] === "{" ? "}" : ")", r = 0, a = !1;
	for (let o = t + 1; o < e.length; o++) {
		let t = e[o];
		if (t === "\\") {
			o++;
			continue;
		}
		if (t === "\"" && r === 0) {
			a = !a;
			continue;
		}
		if (a) continue;
		let s = i(t, n, r);
		if (r = s.braceDepth, s.closes) return o;
	}
	return e.length;
}
function o(e) {
	let t = [];
	for (let n of e.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)\s*([{(])/g)) {
		let r = n.index + n[0].length - 1;
		t.push({
			type: n[1].toLowerCase(),
			at: n.index,
			open: r,
			close: a(e, r)
		});
	}
	return t;
}
function s(e, t, i, a) {
	let o = e.lastIndexOf("@", t - 1);
	if (o < 0) return null;
	let s = o + 1;
	for (; r(e[s]);) s++;
	let c = e.slice(s, t);
	if (t < o + 1 || t > s && c.trim() !== "") return null;
	let l = e.slice(o + 1, Math.min(t, s));
	return /^[A-Za-z0-9_-]*$/.test(l) ? {
		type: "bibtex",
		domain: "bib-entry-type",
		documentPath: a,
		prefix: l,
		replacementRange: n(i, o + 1, s),
		usedFields: []
	} : null;
}
function c(e, t, n, r) {
	let i = [], a = 0, o = !1;
	for (let s = t; s < n; s++) {
		let t = e[s];
		t === "\\" ? s++ : t === "\"" && a === 0 ? o = !o : !o && t === "{" ? a++ : !o && t === "}" && a > 0 ? a-- : !o && a === 0 && t === r && i.push(s);
	}
	return i;
}
function l(e, t, n) {
	for (; t < n && /\s/.test(e[t]);) t++;
	return t;
}
function u(e, t, n, i) {
	let a = i, o = i;
	for (; a > t && r(e[a - 1]);) a--;
	for (; o < n && r(e[o]);) o++;
	return [a, o];
}
function d(e, t, n, r) {
	let i = c(e, t, n, ","), a = /* @__PURE__ */ new Set(), o = t;
	for (let t of [...i, n]) {
		if (o !== r) {
			let n = c(e, o, t, "=")[0], r = e.slice(o, n ?? t).trim().toLowerCase();
			r && a.add(r);
		}
		o = t + 1;
	}
	return [...a].sort();
}
function f(e, t, r, i, a, o, s, c, d) {
	let f = e.slice(o, c).trim().toLowerCase(), p = l(e, c + 1, s), [m, h] = u(e, p, s, t), g = f === "crossref" || f === "xdata" ? "bib-entry-key" : "bib-string", _ = e[p];
	return g === "bib-string" && (_ === "{" || _ === "\"") ? null : {
		type: "bibtex",
		domain: g,
		documentPath: i,
		entryType: a.type,
		field: f,
		prefix: e.slice(m, t),
		replacementRange: n(r, m, h),
		usedFields: d
	};
}
function p(e, t, r, i, a) {
	let o = c(e, a.open + 1, a.close, ","), s = o[0];
	if (s === void 0 || t <= s) return null;
	let p = o.filter((e) => e < t).at(-1), m = o.find((e) => e >= t) ?? a.close, h = p + 1, g = c(e, h, m, "=")[0], _ = d(e, s + 1, a.close, h);
	if (g !== void 0 && t > g) return f(e, t, r, i, a, h, m, g, _);
	let [v, y] = u(e, l(e, h, m), g ?? m, t);
	return {
		type: "bibtex",
		domain: "bib-field",
		documentPath: i,
		entryType: a.type,
		prefix: e.slice(v, t).toLowerCase(),
		replacementRange: n(r, v, y),
		usedFields: _
	};
}
function m(n, r) {
	try {
		let i = n.getText(), a = e(i), c = t(i, a, r), l = s(i, c, a, n.path);
		if (l) return l;
		let u = o(i).find((e) => c > e.open && c <= e.close);
		return u ? p(i, c, a, n.path, u) : null;
	} catch {
		return null;
	}
}
//#endregion
export { m as analyzeBibCompletionContext };
