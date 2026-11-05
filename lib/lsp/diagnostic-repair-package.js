import { buildLineStarts as e, offsetToLineCol as t } from "./source-position.js";
import { getCommandPackage as n } from "./package-db.js";
import { getStructuralSelectionIndex as r } from "./structural-selection.js";
import { packagePreambleEdit as i } from "./diagnostic-repair-preamble.js";
//#region src/lsp/diagnostic-repair-package.ts
async function a(r, a, c, l) {
	if (l?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	let u = r.compileEvidence, d = u?.undefinedCommands.find((e) => e.file === a && e.range.startOffset <= c && c < e.range.endOffset);
	if (!u || !d) return {
		ok: !0,
		proposals: []
	};
	let f = n(d.command);
	if (!f || !o(r, f, d.command)) return {
		ok: !0,
		proposals: []
	};
	let p = await s(r, f, l);
	if (l?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	if (!p) return {
		ok: !0,
		proposals: []
	};
	let m = r.fs.readFile(r.root), h = r.index.getFileSymbols(r.root);
	if (typeof m != "string" || !h) return {
		ok: !0,
		proposals: []
	};
	let g = i(m, h, r.root, f, a === r.root ? d.range.startOffset : void 0);
	if (!g) return {
		ok: !0,
		proposals: []
	};
	let _ = r.fs.readFile(a);
	if (typeof _ != "string" || _.slice(d.range.startOffset, d.range.endOffset) !== d.expectedText) return {
		ok: !1,
		reason: "stale"
	};
	let { line: v, column: y } = t(e(_), d.range.startOffset);
	return {
		ok: !0,
		proposals: [{
			kind: "missing-package",
			root: r.root,
			revision: r.revision,
			contextRevision: r.contextRevision,
			anchor: {
				file: a,
				range: d.range,
				expectedText: d.expectedText
			},
			command: d.command,
			package: f,
			diagnostic: {
				code: "missing-package-dependency",
				file: a,
				line: v,
				column: y,
				endColumn: y + d.expectedText.length,
				severity: "warning",
				message: `Command '\\${d.command}' requires package '${f}'`
			},
			evidence: {
				kind: d.evidence,
				loadedResources: "complete-recorder",
				resource: p
			},
			edits: [g]
		}]
	};
}
function o(e, t, n) {
	let i = e.compileEvidence?.snapshot.fields.loadedResources;
	if (!i || i.status !== "observed" || !i.complete || i.truncated || i.values.some(({ path: e }) => e.split("/").at(-1) === `${t}.sty`)) return !1;
	for (let i of e.index.getRootFiles(e.root)) {
		let a = e.index.getFileSymbols(i);
		if (a?.packages.some((e) => e.name === t) || a?.commands.some((e) => e.name === n || e.name === "usepackage" || e.name === "RequirePackage") || a?.environmentDefs.some((e) => [
			n,
			"usepackage",
			"RequirePackage"
		].includes(e.name)) || i !== e.root && r(a)?.commands.some((e) => e.value === "PassOptionsToPackage")) return !1;
	}
	return !e.fs.listFiles().some((e) => e.split("/").at(-1) === `${t}.sty`);
}
async function s(e, t, n) {
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
export { a as getPackageRepairs };
