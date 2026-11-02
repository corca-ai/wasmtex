import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { LUATEX_KNOWN_404 as t, LUATEX_PRELOAD as n } from "./luatex-manifest.js";
import { BaseTexFmtEngine as r, chapterPreviewHook as i, createCompileWorker as a, firstChapterEntry as o, unicodeFormatUrl as s } from "./tex-fmt-engine.js";
//#region src/engine/luatex-engine.ts
var c = "wasmtex-preview-out";
function l(e, t) {
	let n = `\\directlua{luatexbase.add_to_callback("find_write_file",function(_,name) return "${c}/"..name:gsub("/","__") end,"wasmtex-preview")}`;
	return t ? n + i(t.name, "\\directlua{tex.finish()}", t.cap) : `${n}\\directlua{wasmtexPreviewShipped=0}\\AddToHook{shipout/after}{\\directlua{wasmtexPreviewShipped=wasmtexPreviewShipped+1 if wasmtexPreviewShipped>=${e} then tex.finish() end}}`;
}
var u = /^\(\\end occurred (inside a group at level \d+|when .* incomplete)\)$/gm, d = class extends r {
	constructor(r = {}) {
		let i = r.texliveVersion ?? "2025";
		super(a("luatex", r), "wasmtex-luatex.fmt", s("luatex", r), {
			texliveUrl: e(r.texliveUrl ?? null, i),
			preload: n,
			notFound: t
		}, r.persistentCache ? {
			version: i,
			texliveUrl: e(r.texliveUrl ?? null, i)
		} : void 0, r.resolverProfile ?? {
			id: `texlive-${i}`,
			texliveYear: i,
			mirrorRevision: null
		}, r.warmupCache);
	}
	async init() {
		await this.initTex();
	}
	async compile() {
		let e = performance.now(), t = await this.ensureFormat(), n = await this.tex.run("compilelatex"), r = `${t}\n${n.log}`.trim(), i = this.result(n.success && !!n.out, n.out, r, e, n.inputFiles, n.inputFilesComplete, [n.resolver]);
		return i.success && (this.recordFullPass(n.inputFiles, n.log, "bytes"), this.maybePersist()), i;
	}
	async compilePagePreview(e, { chapter: t, cold: n = !1 } = {}) {
		let r = t ? this.chapterStart(t, e) : 1;
		if (r === null) return null;
		this.tex.mkdir(c);
		let i = await this.runPreviewJob(l(e, t ? {
			name: t,
			cap: e - r + 1
		} : void 0), void 0, { cold: n });
		if (!i) return null;
		let a = i.run, s = `${i.fmtLog}\n${a.log.replace(u, "")}`.trim(), d = this.result(a.success && !!a.out, a.out, s, i.start, void 0, void 0, [a.resolver]), f = this.attributePreviewErrors(d, i.main);
		if (!t || !d.success) return {
			...f,
			firstPage: 1
		};
		let p = await Promise.all([this.tex.readFile(`${c}/${t.replaceAll("/", "__")}.aux`), this.tex.readFile(`${t}.aux`)]), m = this.placeChapter(t, r, a.log, "bytes", [o(p[0]), o(p[1])]);
		return m === null ? null : {
			...f,
			firstPage: m
		};
	}
	async flushCache() {
		this.tex.flushCache(), this.clearInjectedFormat();
	}
	terminate() {
		this.tex.terminate();
	}
};
//#endregion
export { c as LUATEX_PREVIEW_OUTPUT_DIR, d as WasmTexLuatexEngine, l as luatexPreviewHook };
