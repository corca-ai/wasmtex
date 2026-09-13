import { rangeFromOffsets as e } from "./source-position.js";
import { indexGroupEnds as t } from "./group-index.js";
import { confirmedInvocationSelectionRanges as n } from "./completion-context.js";
//#region src/lsp/structural-selection.ts
var r = /* @__PURE__ */ new WeakMap();
function i(e) {
	return e ? r.get(e) : void 0;
}
function a(e) {
	let t = r.get(e);
	return t ? t.masked.length * 2 + t.lineStarts.length * 8 + (t.groups.size + t.balancedGroups.size + t.ranges.length + t.excluded.length) * 16 + t.commands.reduce((e, t) => e + t.value.length * 2 + 40, 0) : 0;
}
function o(e, n, i, a, o, s, c) {
	let l = c ?? t(n), u = [...s];
	for (let [e, t] of l) n[e] === "{" && u.push([e + 1, t], [e, t + 1]);
	let d = [...l.keys()].some((e) => n[e] === "[");
	r.set(e, {
		masked: n,
		lineStarts: a,
		commands: i.filter((e) => e.type === "command" && n[e.start] === "\\"),
		groups: l,
		balancedGroups: d ? t(n, !0) : l,
		ranges: u,
		excluded: o
	});
}
function s(e, t, r, i, a) {
	if (a?.isCancellationRequested || !e) return [];
	let o = c(e, t, r);
	if (o === null) return [];
	let s = e.ranges.filter((e) => u(e, o)), d = (t, n, r = !1) => {
		let i = (r ? e.balancedGroups : e.groups).get(n);
		return i === void 0 ? {
			closed: !1,
			contentEnd: e.masked.length,
			end: e.masked.length
		} : {
			closed: !0,
			contentEnd: i,
			end: i + 1
		};
	};
	for (let t of e.commands) {
		if (a?.isCancellationRequested) return [];
		if (t.start > o) break;
		let r = n(e.masked, t, i, d);
		for (let e of r) u(e, o) && s.push(e);
	}
	return l(s, e.lineStarts);
}
function c(e, t, n) {
	if (!Number.isInteger(t) || !Number.isInteger(n) || n < 1) return null;
	let r = e.lineStarts[t - 1];
	if (r === void 0) return null;
	let i = r + n - 1, a = (e.lineStarts[t] ?? e.masked.length + 1) - 1;
	return e.masked[a - 1] === "\r" && a--, i > a || e.excluded.some(([e, t]) => i >= e && i < t) ? null : i;
}
function l(t, n) {
	t.sort((e, t) => e[1] - e[0] - (t[1] - t[0]) || t[0] - e[0]);
	let r = [], i;
	for (let a of t) i && (a[0] > i[0] || a[1] < i[1]) || i && a[0] === i[0] && a[1] === i[1] || (r.push(e(n, ...a)), i = a);
	return r;
}
function u([e, t], n) {
	return e < t && e <= n && n < t;
}
//#endregion
export { o as cacheStructuralSelectionIndex, i as getStructuralSelectionIndex, a as structuralSelectionEstimatedBytes, s as structuralSelectionRanges };
