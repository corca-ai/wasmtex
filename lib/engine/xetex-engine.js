import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { buildDependencyGraph as t } from "./dependency-graph.js";
import { BaseTexFmtEngine as n, createCompileWorker as r, unicodeFormatUrl as i } from "./tex-fmt-engine.js";
import { XETEX_PRELOAD as a } from "./unicode-runtime-manifest.js";
import { attachPlacements as o, parseXdv as s } from "./xdv.js";
//#region src/engine/xetex-engine.ts
var c = class extends n {
	dvipdfm;
	constructor(t = {}) {
		let n = t.texliveVersion ?? "2025";
		super(r("xetex", t), "wasmtex-xetex.fmt", i("xetex", t), {
			texliveUrl: e(t.texliveUrl ?? null, n),
			preload: a,
			notFound: []
		}, t.persistentCache ? { version: n } : void 0, t.resolverProfile ?? {
			id: `texlive-${n}`,
			texliveYear: n,
			mirrorRevision: null
		}, t.warmupCache), this.dvipdfm = r("dvipdfm", t);
	}
	async init() {
		this.dvipdfm.onFileDownload = (e) => {
			this.bumpDownloadCount(), this.onFileDownload?.(e);
		}, await Promise.all([this.initTex(), this.dvipdfm.init()]), this.rehydrateExtraDriver(this.dvipdfm);
	}
	extraCacheDrivers() {
		return [this.dvipdfm];
	}
	async writeFile(e, t) {
		await Promise.all([super.writeFile(e, t), this.dvipdfm.writeFile(e, t)]);
	}
	async mkdir(e) {
		await super.mkdir(e), this.dvipdfm.mkdir(e);
	}
	async compile() {
		let e = performance.now(), n = await this.ensureFormat(), r = await this.tex.run("compilelatex");
		if (!r.success || !r.out) return this.result(!1, null, `${n}\n${r.log}`.trim(), e, r.inputFiles, !1, [r.resolver]);
		let i = `${this.mainBase}.xdv`;
		await this.dvipdfm.writeFile(i, r.out), this.dvipdfm.setMainFile(i);
		let a = await this.dvipdfm.run("compilepdf"), c = `${r.log}\n${a.log}`, l = this.result(a.success && !!a.out, a.out, c, e, r.inputFiles, r.inputFilesComplete, [r.resolver, a.resolver]);
		a.inputFiles && (l.pdfConversionInputs = a.inputFiles);
		let { pages: u, placements: d, reliable: f } = s(r.out);
		if (l.telemetry && (l.telemetry.geometry = {
			pages: u,
			reliable: f
		}), l.glyphCoverage && o(l.glyphCoverage.gaps, d, f, c), l.telemetry) {
			let e = [...new Set(u.flatMap((e) => e.textRuns.map((e) => e.font)))].filter((e) => !!e);
			l.telemetry.dependencies = t(c, {
				inputFiles: r.inputFiles,
				fonts: e,
				source: this.mainSource()
			});
		}
		return l.success && this.maybePersist(), l;
	}
	async flushCache() {
		this.tex.flushCache(), this.dvipdfm.flushCache(), this.clearInjectedFormat();
	}
	terminate() {
		this.tex.terminate(), this.dvipdfm.terminate();
	}
};
//#endregion
export { c as WasmTexXetexEngine };
