import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { LUATEX_KNOWN_404 as t, LUATEX_PRELOAD as n } from "./luatex-manifest.js";
import { BaseTexFmtEngine as r, createCompileWorker as i, unicodeFormatUrl as a } from "./tex-fmt-engine.js";
//#region src/engine/luatex-engine.ts
var o = "wasmtex-preview-out";
function s(e) {
	return `\\directlua{wasmtexPreviewShipped=0 luatexbase.add_to_callback("find_write_file",function(_,name) return "${o}/"..name:gsub("/","__") end,"wasmtex-preview")}\\AddToHook{shipout/after}{\\directlua{wasmtexPreviewShipped=wasmtexPreviewShipped+1 if wasmtexPreviewShipped>=${e} then tex.finish() end}}`;
}
var c = /^\(\\end occurred (inside a group at level \d+|when .* incomplete)\)$/gm, l = class extends r {
	constructor(r = {}) {
		let o = r.texliveVersion ?? "2025";
		super(i("luatex", r), "wasmtex-luatex.fmt", a("luatex", r), {
			texliveUrl: e(r.texliveUrl ?? null, o),
			preload: n,
			notFound: t
		}, r.persistentCache ? {
			version: o,
			texliveUrl: e(r.texliveUrl ?? null, o)
		} : void 0, r.resolverProfile ?? {
			id: `texlive-${o}`,
			texliveYear: o,
			mirrorRevision: null
		}, r.warmupCache);
	}
	async init() {
		await this.initTex();
	}
	async compile() {
		let e = performance.now(), t = await this.ensureFormat(), n = await this.tex.run("compilelatex"), r = `${t}\n${n.log}`.trim(), i = this.result(n.success && !!n.out, n.out, r, e, n.inputFiles, n.inputFilesComplete, [n.resolver]);
		return i.success && (this.recordFullPass(n.inputFiles), this.maybePersist()), i;
	}
	async compilePagePreview(e) {
		this.tex.mkdir(o);
		let t = await this.runPreviewJob(s(e));
		if (!t) return null;
		let n = t.run, r = `${t.fmtLog}\n${n.log.replace(c, "")}`.trim(), i = this.result(n.success && !!n.out, n.out, r, t.start, void 0, void 0, [n.resolver]);
		return this.attributePreviewErrors(i, t.main);
	}
	async flushCache() {
		this.tex.flushCache(), this.clearInjectedFormat();
	}
	terminate() {
		this.tex.terminate();
	}
};
//#endregion
export { o as LUATEX_PREVIEW_OUTPUT_DIR, l as WasmTexLuatexEngine, s as luatexPreviewHook };
