import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { LUATEX_KNOWN_404 as t, LUATEX_PRELOAD as n } from "./luatex-manifest.js";
import { BaseTexFmtEngine as r, createCompileWorker as i, unicodeFormatUrl as a } from "./tex-fmt-engine.js";
//#region src/engine/luatex-engine.ts
var o = class extends r {
	constructor(r = {}) {
		let o = r.texliveVersion ?? "2025";
		super(i("luatex", r), "wasmtex-luatex.fmt", a("luatex", r), {
			texliveUrl: e(r.texliveUrl ?? null, o),
			preload: n,
			notFound: t
		}, r.persistentCache ? { version: o } : void 0);
	}
	async init() {
		await this.initTex();
	}
	async compile() {
		let e = performance.now(), t = await this.ensureFormat(), n = await this.tex.run("compilelatex"), r = `${t}\n${n.log}`.trim(), i = this.result(n.success && !!n.out, n.out, r, e, n.inputFiles, n.inputFilesComplete);
		return i.success && this.maybePersist(), i;
	}
	async flushCache() {
		this.tex.flushCache(), this.clearInjectedFormat();
	}
	terminate() {
		this.tex.terminate();
	}
};
//#endregion
export { o as WasmTexLuatexEngine };
