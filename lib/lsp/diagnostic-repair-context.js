import { boundCompletionSnapshot as e, completionProjectRevision as t } from "../engine/completion-snapshot.js";
import { undefinedCommandEvidence as n } from "./diagnostic-repair-compile.js";
//#region src/lsp/diagnostic-repair-context.ts
async function r(r, i, a) {
	if (a?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	if (i.log.length > 4e6) return {
		ok: !1,
		reason: "limit"
	};
	let o = e(i.snapshot), s = o.identity, c = r.profile;
	if (!c?.mirrorRevision || !r.engine) return {
		ok: !1,
		reason: "unsupported"
	};
	if (s.root !== r.root || s.engine !== r.engine || s.profile.id !== c.id || s.profile.texliveYear !== c.texliveYear || s.profile.mirrorRevision !== c.mirrorRevision) return {
		ok: !1,
		reason: "stale"
	};
	let l = r.fs.listFiles().flatMap((e) => {
		let t = r.fs.readFile(e);
		return t === null ? [] : [{
			path: e,
			content: typeof t == "string" ? t : Uint8Array.from(t)
		}];
	});
	if (!l.some((e) => e.path === r.root)) return {
		ok: !1,
		reason: "stale"
	};
	let u = await t(l);
	return a?.isCancellationRequested ? {
		ok: !1,
		reason: "cancelled"
	} : s.projectRevision === u ? {
		ok: !0,
		evidence: {
			snapshot: o,
			undefinedCommands: n(i.log, r.fs, r.index, r.root, a)
		}
	} : {
		ok: !1,
		reason: "stale"
	};
}
//#endregion
export { r as bindDiagnosticCompileContext };
