import { referenceInventory as e, validReferenceKey as t } from "./reference-repair-source.js";
//#region src/lsp/reference-repair.ts
function n(t, n, r, i) {
	if (!Number.isSafeInteger(r) || r < 0) return {
		ok: !0,
		problem: null
	};
	let a = e(t, i);
	if (typeof a == "string") return {
		ok: !1,
		reason: a
	};
	let o = (e) => e.file === n && e.range.startOffset <= r && r < e.range.endOffset, s = a.definitions.find((e) => o(e.definition)), c = s ? a.definitions.filter((e) => e.definition.key === s.definition.key) : [];
	if (s && c.length > 1 && c.length === a.names.get(s.definition.key)) return {
		ok: !0,
		problem: {
			kind: "duplicate-label",
			anchor: s.definition,
			definitions: c,
			references: a.references.filter((e) => e.key === s.definition.key)
		}
	};
	let l = a.references.find(o);
	return !l || a.names.has(l.key) || t.index.getAuxLabels().has(l.key) || t.index.getSemanticTrace()?.labels.has(l.key) ? {
		ok: !0,
		problem: null
	} : {
		ok: !0,
		problem: {
			kind: "undefined-reference",
			anchor: l,
			candidates: a.definitions.filter((e) => a.names.get(e.definition.key) === 1)
		}
	};
}
function r(e, t, r) {
	let s = n(e, t.anchor.file, t.anchor.range.startOffset, r);
	if (!s.ok) return s;
	let c = s.problem;
	if (!c || c.kind !== t.kind || !o(c.anchor, t.anchor)) return {
		ok: !1,
		reason: "stale"
	};
	if (c.kind === "undefined-reference" && t.kind === "undefined-reference") {
		let e = c.candidates.find((e) => o(e.definition, t.target));
		return e ? {
			ok: !0,
			edits: [a(c.anchor, e.definition.key)]
		} : {
			ok: !1,
			reason: "stale"
		};
	}
	return c.kind !== "duplicate-label" || t.kind !== "duplicate-label" ? {
		ok: !1,
		reason: "stale"
	} : i(e, t, c, r);
}
function i(n, r, i, o) {
	if (!t(r.newKey)) return {
		ok: !1,
		reason: "invalid-key"
	};
	let c = e(n, o);
	if (typeof c == "string") return {
		ok: !1,
		reason: c
	};
	if (c.names.has(r.newKey) || n.index.getAuxLabels().has(r.newKey) || n.index.getSemanticTrace()?.labels.has(r.newKey)) return {
		ok: !1,
		reason: "invalid-key"
	};
	if (r.references.length > i.references.length) return {
		ok: !1,
		reason: "stale"
	};
	let l = new Set(r.references.map(s)), u = i.references.filter((e) => l.has(s(e)));
	return u.length === r.references.length ? o?.isCancellationRequested ? {
		ok: !1,
		reason: "cancelled"
	} : {
		ok: !0,
		edits: [i.anchor, ...u].map((e) => a(e, r.newKey))
	} : {
		ok: !1,
		reason: "stale"
	};
}
function a(e, t) {
	return {
		file: e.file,
		range: { ...e.range },
		expectedText: e.key,
		newText: t
	};
}
function o(e, t) {
	return e.file === t.file && e.key === t.key && e.command === t.command && e.range.startOffset === t.range.startOffset && e.range.endOffset === t.range.endOffset && e.line === t.line && e.column === t.column;
}
function s(e) {
	return JSON.stringify([
		e.file,
		e.key,
		e.command,
		e.range.startOffset,
		e.range.endOffset,
		e.line,
		e.column
	]);
}
//#endregion
export { n as getReferenceProblem, r as planReferenceRepair };
