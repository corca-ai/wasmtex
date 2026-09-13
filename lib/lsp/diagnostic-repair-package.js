import { getCommandPackage as e } from "./package-db.js";
import { getStructuralSelectionIndex as t } from "./structural-selection.js";
import { packagePreambleEdit as n } from "./diagnostic-repair-preamble.js";
//#region src/lsp/diagnostic-repair-package.ts
async function r(t, r, o, s) {
	if (s?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	let c = t.compileEvidence, l = c?.undefinedCommands.find((e) => e.file === r && e.range.startOffset <= o && o < e.range.endOffset);
	if (!c || !l) return {
		ok: !0,
		proposals: []
	};
	let u = e(l.command);
	if (!u || !i(t, u, l.command)) return {
		ok: !0,
		proposals: []
	};
	let d = await a(t, u, s);
	if (s?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	if (!d) return {
		ok: !0,
		proposals: []
	};
	let f = t.fs.readFile(t.root), p = t.index.getFileSymbols(t.root);
	if (typeof f != "string" || !p) return {
		ok: !0,
		proposals: []
	};
	let m = n(f, p, t.root, u, r === t.root ? l.range.startOffset : void 0);
	if (!m) return {
		ok: !0,
		proposals: []
	};
	let h = t.fs.readFile(r);
	if (typeof h != "string" || h.slice(l.range.startOffset, l.range.endOffset) !== l.expectedText) return {
		ok: !1,
		reason: "stale"
	};
	let g = h.slice(0, l.range.startOffset), _ = g.split("\n").length, v = g.length - g.lastIndexOf("\n");
	return {
		ok: !0,
		proposals: [{
			kind: "missing-package",
			root: t.root,
			revision: t.revision,
			contextRevision: t.contextRevision,
			anchor: {
				file: r,
				range: l.range,
				expectedText: l.expectedText
			},
			command: l.command,
			package: u,
			diagnostic: {
				code: "missing-package-dependency",
				file: r,
				line: _,
				column: v,
				endColumn: v + l.expectedText.length,
				severity: "warning",
				message: `Command '\\${l.command}' requires package '${u}'`
			},
			evidence: {
				kind: l.evidence,
				loadedResources: "complete-recorder",
				resource: d
			},
			edits: [m]
		}]
	};
}
function i(e, n, r) {
	let i = e.compileEvidence?.snapshot.fields.loadedResources;
	if (!i || i.status !== "observed" || !i.complete || i.truncated || i.values.some(({ path: e }) => e.split("/").at(-1) === `${n}.sty`)) return !1;
	for (let i of e.index.getRootFiles(e.root)) {
		let a = e.index.getFileSymbols(i);
		if (a?.packages.some((e) => e.name === n) || a?.commands.some((e) => e.name === r || e.name === "usepackage" || e.name === "RequirePackage") || a?.environmentDefs.some((e) => [
			r,
			"usepackage",
			"RequirePackage"
		].includes(e.name)) || i !== e.root && t(a)?.commands.some((e) => e.value === "PassOptionsToPackage")) return !1;
	}
	return !e.fs.listFiles().some((e) => e.split("/").at(-1) === `${n}.sty`);
}
async function a(e, t, n) {
	let r = e.resourceCatalog, i = e.compileEvidence?.snapshot.identity;
	if (!r || !i || r.identity.texliveYear !== i.profile.texliveYear || r.identity.mirrorRevision !== i.profile.mirrorRevision) return null;
	let a = await r.load("tex-package", n);
	if (a.status !== "ready" || a.shard.texliveYear !== i.profile.texliveYear || a.shard.mirrorRevision !== i.profile.mirrorRevision) return null;
	let o = a.shard.resources.find((e) => e.name === t && e.fileName === `${t}.sty`);
	return !o || o.engines && !o.engines.includes({
		pdflatex: "pdftex",
		xelatex: "xetex",
		lualatex: "luatex"
	}[i.engine]) ? null : structuredClone(o);
}
//#endregion
export { r as getPackageRepairs };
