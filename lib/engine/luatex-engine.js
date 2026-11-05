import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { LUATEX_KNOWN_404 as t, LUATEX_PRELOAD as n } from "./luatex-manifest.js";
import { applyHeapCheckpoints as r } from "./wasmtex-engine.js";
import { BaseTexFmtEngine as i, chapterPreviewHook as a, createCompileWorker as o, firstChapterEntry as s, unicodeFormatUrl as c } from "./tex-fmt-engine.js";
//#region src/engine/luatex-engine.ts
var l = "wasmtex-preview-out";
function u(e, t) {
	let n = `\\directlua{luatexbase.add_to_callback("find_write_file",function(_,name) return "${l}/"..name:gsub("/","__") end,"wasmtex-preview")}`;
	return t ? n + a(t.name, "\\directlua{tex.finish()}", t.cap) : `${n}\\directlua{wasmtexPreviewShipped=0}\\AddToHook{shipout/after}{\\directlua{wasmtexPreviewShipped=wasmtexPreviewShipped+1 if wasmtexPreviewShipped>=${e} then tex.finish() end}}`;
}
var d = /^\(\\end occurred (inside a group at level \d+|when .* incomplete)\)$/gm, f = class extends i {
	checkpointBudget = null;
	constructor(r = {}) {
		let i = r.texliveVersion ?? "2025";
		super(o("luatex", r), "wasmtex-luatex.fmt", c("luatex", r), {
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
	get supportsHeapCheckpoints() {
		return this.tex.supportsHeapCheckpoints;
	}
	get supportsLineCheckpoints() {
		return this.tex.supportsLineCheckpoints;
	}
	get supportsFileCheckpoints() {
		return this.tex.supportsFileCheckpoints;
	}
	get supportsResumeRecorder() {
		return this.tex.supportsResumeRecorder;
	}
	setCheckpointBudget(e, t) {
		this.checkpointBudget = {
			maxCount: Math.min(e, 64),
			maxBytes: t
		};
	}
	async compile(e) {
		let t = performance.now(), n = await this.ensureFormat(), r = e?.checkpoints?.length ? e.checkpoints : void 0, i = await this.tex.run("compilelatex", this.withBudget(r ? { checkpoints: r } : {}));
		return this.finishCompile(i, n, t);
	}
	async compileFromHeapCheckpoint(e, t) {
		if (!this.supportsHeapCheckpoints) throw Error("heap checkpoints are not supported by this engine");
		let n = performance.now(), r = await this.tex.run("compileheapcheckpoint", this.withBudget({
			id: e,
			...t?.length ? { checkpoints: t } : {}
		}));
		return this.finishCompile(r, "", n);
	}
	async compileHeapPreview(e, t) {
		if (!this.supportsHeapCheckpoints || !this.tex.supportsPagePreview) return null;
		let n = performance.now(), r = await this.tex.run("compilepagepreview", {
			pageLimit: e,
			id: t
		});
		return this.result(r.success && !!r.out, r.out, r.log.replace(d, "").trim(), n, void 0, void 0, [r.resolver]);
	}
	dropHeapCheckpoints(e) {
		return this.tex.dropHeapCheckpoints(e);
	}
	withBudget(e) {
		return this.checkpointBudget ? {
			...e,
			checkpointBudget: this.checkpointBudget
		} : e;
	}
	finishCompile(e, t, n) {
		let i = `${t}\n${e.log}`.trim(), a = this.result(e.success && !!e.out, e.out, i, n, e.inputFiles, e.inputFilesComplete, [e.resolver]);
		return e.message && r(a, e.message), a.success && (this.recordFullPass(e.inputFiles, e.log, "bytes"), this.maybePersist()), a;
	}
	async compilePagePreview(e, { chapter: t, cold: n = !1 } = {}) {
		let r = t ? this.chapterStart(t, e) : 1;
		if (r === null) return null;
		this.tex.mkdir(l);
		let i = await this.runPreviewJob(u(e, t ? {
			name: t,
			cap: e - r + 1
		} : void 0), void 0, { cold: n });
		if (!i) return null;
		let a = i.run, o = `${i.fmtLog}\n${a.log.replace(d, "")}`.trim(), c = this.result(a.success && !!a.out, a.out, o, i.start, void 0, void 0, [a.resolver]), f = this.attributePreviewErrors(c, i.main);
		if (!t || !c.success) return {
			...f,
			firstPage: 1
		};
		let p = await Promise.all([this.tex.readFile(`${l}/${t.replaceAll("/", "__")}.aux`), this.tex.readFile(`${t}.aux`)]), m = this.placeChapter(t, r, a.log, "bytes", [s(p[0]), s(p[1])]);
		return m === null ? null : {
			...f,
			firstPage: m
		};
	}
	async flushCache() {
		this.tex.flushCache(), this.clearInjectedFormat();
	}
	terminate() {
		this.downloadAbort.abort(), this.tex.terminate();
	}
};
//#endregion
export { l as LUATEX_PREVIEW_OUTPUT_DIR, f as WasmTexLuatexEngine, u as luatexPreviewHook };
