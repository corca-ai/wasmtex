import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { LUATEX_KNOWN_404 as t, LUATEX_PRELOAD as n } from "./luatex-manifest.js";
import { BaseTexFmtEngine as r, createCompileWorker as i, unicodeFormatUrl as a } from "./tex-fmt-engine.js";
//#region src/engine/luatex-engine.ts
var o = "-wasmtex-preview", s = "wasmtex-preview-out";
function c(e) {
	return `\\directlua{wasmtexPreviewShipped=0 luatexbase.add_to_callback("find_write_file",function(_,name) return "${s}/"..name:gsub("/","__") end,"wasmtex-preview")}\\AddToHook{shipout/after}{\\directlua{wasmtexPreviewShipped=wasmtexPreviewShipped+1 if wasmtexPreviewShipped>=${e} then tex.finish() end}}`;
}
function l(e, t) {
	let n = `./${t}.`, r = /* @__PURE__ */ new Set();
	for (let t of e ?? []) {
		if (!t.startsWith(n)) continue;
		let e = t.slice(n.length);
		e && e !== "tex" && !e.includes("/") && r.add(e);
	}
	return [...r];
}
var u = /^\(\\end occurred (inside a group at level \d+|when .* incomplete)\)$/gm, d = class extends r {
	jobInputs = [];
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
		return this.jobInputs = l(n.inputFiles, this.jobName()), i.success && this.maybePersist(), i;
	}
	async compilePagePreview(e) {
		let t = this.mainSource();
		if (t === void 0) return null;
		let n = performance.now(), r = await this.ensureFormat(), i = this.jobName(), a = `${i}${o}`;
		for (let e of this.jobInputs) {
			let t = await this.tex.readFile(`${i}.${e}`);
			t !== null && await this.tex.writeFile(`${a}.${e}`, t);
		}
		let l = `${this.mainBase.slice(0, this.mainBase.length - i.length)}${a}.tex`;
		this.tex.mkdir(s), await this.tex.writeFile(l, c(e) + t), this.tex.setMainFile(l);
		let d;
		try {
			d = await this.tex.run("compilelatex");
		} finally {
			this.tex.setMainFile(`${this.mainBase}.tex`);
		}
		let f = `${r}\n${d.log.replace(u, "")}`.trim(), p = this.result(d.success && !!d.out, d.out, f, n, void 0, void 0, [d.resolver]);
		for (let e of p.errors) e.file === l && (e.file = `${this.mainBase}.tex`);
		return p;
	}
	async flushCache() {
		this.tex.flushCache(), this.clearInjectedFormat(), this.jobInputs = [];
	}
	terminate() {
		this.tex.terminate();
	}
	jobName() {
		return this.mainBase.slice(this.mainBase.lastIndexOf("/") + 1);
	}
};
//#endregion
export { o as LUATEX_PREVIEW_JOB_SUFFIX, s as LUATEX_PREVIEW_OUTPUT_DIR, d as WasmTexLuatexEngine, l as luatexJobInputExtensions, c as luatexPreviewHook };
