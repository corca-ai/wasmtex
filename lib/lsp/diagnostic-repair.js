import { getStructuralSelectionIndex as e } from "./structural-selection.js";
import { repairInvocations as t } from "./diagnostic-repair-invocations.js";
import { getPackageRepairs as n } from "./diagnostic-repair-package.js";
//#region src/lsp/diagnostic-repair.ts
function r(n, r, a, o) {
	if (o?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	let s = n.index.getRootFiles(n.root);
	if (s.length > 1024) return {
		ok: !1,
		reason: "limit"
	};
	if (!s.includes(r) || !Number.isSafeInteger(a) || a < 0) return {
		ok: !0,
		proposals: []
	};
	let c = n.fs.readFile(r), l = n.index.getFileSymbols(r);
	if (typeof c != "string" || !l) return {
		ok: !0,
		proposals: []
	};
	if (c.length > 1e6 || (e(l)?.commands.length ?? 0) > 1e4) return {
		ok: !1,
		reason: "limit"
	};
	let u = i(n.fs, s, o);
	if (u) return {
		ok: !1,
		reason: u
	};
	let d = f(n, s), p = t(c, l, d, o).find(({ token: e }) => e.start <= a && a < e.end);
	if (o?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	if (!p?.consumption.missing.length || r !== n.root && p.consumption.missingBoundary === "eof") return {
		ok: !0,
		proposals: []
	};
	let { token: m, consumption: h, name: g } = p;
	return {
		ok: !0,
		proposals: [{
			kind: "missing-required-argument",
			root: n.root,
			revision: n.revision,
			contextRevision: n.contextRevision,
			anchor: {
				file: r,
				range: {
					startOffset: m.start,
					endOffset: m.end
				},
				expectedText: c.slice(m.start, m.end)
			},
			diagnostic: {
				code: "missing-required-argument",
				file: r,
				line: m.line,
				column: m.column,
				endColumn: m.column + m.end - m.start,
				severity: "warning",
				message: `Command '\\${g}' is missing ${h.missing.length} required argument(s)`
			},
			command: g,
			missingArguments: h.missing.map((e) => ({ ...e })),
			edits: [{
				file: r,
				range: {
					startOffset: h.insertOffset,
					endOffset: h.insertOffset
				},
				expectedText: "",
				newText: "{}".repeat(h.missing.length)
			}]
		}]
	};
}
function i(e, t, n) {
	let r = 0;
	for (let i of t) {
		if (n?.isCancellationRequested) return "cancelled";
		let t = e.readFile(i);
		if (r += typeof t == "string" ? t.length : 0, r > 4e6) return "limit";
	}
	return null;
}
async function a(e, t, n) {
	if (n?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	if (t.root !== e.root || t.revision !== e.revision || t.contextRevision !== e.contextRevision) return {
		ok: !1,
		reason: "stale"
	};
	let r = await o(e, t.anchor.file, t.anchor.range.startOffset, n);
	if (!r.ok) return r;
	let i = r.proposals.find((e) => l(e, t));
	return i ? {
		ok: !0,
		edits: i.edits
	} : {
		ok: !1,
		reason: "stale"
	};
}
async function o(e, t, i, a) {
	let o = r(e, t, i, a);
	if (!o.ok) return o;
	let s = await n(e, t, i, a);
	return s.ok ? {
		ok: !0,
		proposals: [...o.proposals, ...s.proposals]
	} : s;
}
function s(e, t, n, i, a) {
	if (!i.ok) return i;
	let o = r(e, t, n, a);
	return o.ok ? {
		ok: !0,
		proposals: [...o.proposals, ...i.proposals.filter((e) => e.kind === "missing-package")]
	} : o;
}
function c(e, t, n) {
	let i = r(e, t.anchor.file, t.anchor.range.startOffset, n);
	if (!i.ok) return i;
	let a = i.proposals.find((e) => l(e, t));
	return a ? {
		ok: !0,
		edits: a.edits
	} : {
		ok: !1,
		reason: "stale"
	};
}
function l(e, t) {
	return e.kind === t.kind && e.command === t.command && e.anchor.expectedText === t.anchor.expectedText && e.anchor.range.endOffset === t.anchor.range.endOffset && u(e, t) && JSON.stringify(e.edits) === JSON.stringify(t.edits);
}
function u(e, t) {
	return e.kind === "missing-required-argument" && t.kind === e.kind ? JSON.stringify(e.missingArguments) === JSON.stringify(t.missingArguments) : e.kind === "missing-package" && t.kind === e.kind && e.package === t.package && JSON.stringify(e.evidence) === JSON.stringify(t.evidence);
}
function d(e, t) {
	return t || e.mayRedefine ? null : e.arguments?.map(({ kind: e, balancedOptional: t }) => ({
		kind: e,
		...t === void 0 ? {} : { balancedOptional: t }
	})) ?? null;
}
function f(e, t) {
	let n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Set();
	for (let i of t) {
		let t = e.index.getFileSymbols(i);
		if (t) {
			for (let e of t.commands) {
				let t = d(e, n.has(e.name));
				n.set(e.name, t), n.set(`${e.name}*`, e.acceptsStar ? t : null);
			}
			for (let e of t.environmentDefs) n.set(e.name, null), n.set(`end${e.name}`, null);
			for (let e of t.packages) r.add(`package/${e.name}`);
			for (let e of t.classes) r.add(`class/${e.name}`);
		}
	}
	return { getCommandArguments(t) {
		return n.has(t) ? n.get(t) ?? void 0 : e.registry.getScopedCommandArguments(t, r);
	} };
}
//#endregion
export { r as getArgumentRepairs, o as getDiagnosticRepairs, c as planArgumentRepair, a as planDiagnosticRepair, s as revalidateArgumentRepairs };
