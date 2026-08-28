import { buildDependencyGraph as e } from "./dependency-graph.js";
import { BaseTexFmtEngine as t, createCompileWorker as n, unicodeFormatUrl as r } from "./tex-fmt-engine.js";
import { attachPlacements as i, parseXdv as a } from "./xdv.js";
//#region src/engine/xetex-engine.ts
var o = class extends t {
	dvipdfm;
	constructor(e = {}) {
		let t = e.texliveVersion ?? "2025";
		super(n("xetex", e), "wasmtex-xetex.fmt", r("xetex", e), void 0, e.persistentCache ? { version: t } : void 0, e.resolverProfile ?? {
			id: `texlive-${t}`,
			texliveYear: t,
			mirrorRevision: null
		}), this.dvipdfm = n("dvipdfm", e);
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
		let t = performance.now(), n = await this.ensureFormat(), r = await this.tex.run("compilelatex");
		if (!r.success || !r.out) return this.result(!1, null, `${n}\n${r.log}`.trim(), t, r.inputFiles, !1, [r.resolver]);
		let o = `${this.mainBase}.xdv`;
		await this.dvipdfm.writeFile(o, r.out), this.dvipdfm.setMainFile(o);
		let s = await this.dvipdfm.run("compilepdf"), c = `${r.log}\n${s.log}`, l = this.result(s.success && !!s.out, s.out, c, t, r.inputFiles, r.inputFilesComplete, [r.resolver, s.resolver]), { pages: u, placements: d, reliable: f } = a(r.out);
		if (l.telemetry && (l.telemetry.geometry = {
			pages: u,
			reliable: f
		}), l.glyphCoverage && i(l.glyphCoverage.gaps, d, f, c), l.telemetry) {
			let t = [...new Set(u.flatMap((e) => e.textRuns.map((e) => e.font)))].filter((e) => !!e);
			l.telemetry.dependencies = e(c, {
				inputFiles: r.inputFiles,
				fonts: t,
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
export { o as WasmTexXetexEngine };
