import { boundCompletionSnapshot as e, completionFileDigest as t, completionProjectRevision as n } from "../engine/completion-snapshot.js";
import { undefinedCommandEvidence as r } from "./diagnostic-repair-compile.js";
//#region src/lsp/diagnostic-repair-context.ts
async function i(t, i, a) {
	if (a?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	if (i.log.length > 4e6) return {
		ok: !1,
		reason: "limit"
	};
	let s = e(i.snapshot), c = s.identity, l = t.profile;
	if (!l?.mirrorRevision || !t.engine) return {
		ok: !1,
		reason: "unsupported"
	};
	if (c.root !== t.root || c.engine !== t.engine || c.profile.id !== l.id || c.profile.texliveYear !== l.texliveYear || c.profile.mirrorRevision !== l.mirrorRevision) return {
		ok: !1,
		reason: "stale"
	};
	let u = o(t.fs, i.binaryInputs ?? []);
	if (!u) return {
		ok: !1,
		reason: "unsupported"
	};
	if (!u.some((e) => e.path === t.root)) return {
		ok: !1,
		reason: "stale"
	};
	let d = await n(u);
	return a?.isCancellationRequested ? {
		ok: !1,
		reason: "cancelled"
	} : c.projectRevision === d ? {
		ok: !0,
		evidence: {
			snapshot: s,
			undefinedCommands: r(i.log, t.fs, t.index, t.root, a)
		}
	} : {
		ok: !1,
		reason: "stale"
	};
}
async function a(e) {
	let n = [];
	for (let [r, i] of Object.entries(e)) typeof i != "string" && n.push({
		path: r,
		digest: await t(i)
	});
	return n;
}
function o(e, t) {
	if (t.length > 8192) return null;
	let n = e.listFiles().flatMap((t) => {
		let n = e.readFile(t);
		return n === null ? [] : [{
			path: t,
			content: typeof n == "string" ? n : Uint8Array.from(n)
		}];
	}), r = new Set(n.map((e) => e.path));
	for (let e of t) {
		if (!e.path || r.has(e.path) || !/^[a-f0-9]{64}$/.test(e.digest) || /\.(?:tex|sty|cls|ltx|def|cfg|clo|ldf)$/i.test(e.path)) return null;
		r.add(e.path), n.push({
			path: e.path,
			content: /* @__PURE__ */ new Uint8Array(),
			digest: e.digest
		});
	}
	return n;
}
//#endregion
export { i as bindDiagnosticCompileContext, a as diagnosticCompileBinaryInputs };
