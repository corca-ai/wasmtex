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
		}, e.warmupCache), this.dvipdfm = n("dvipdfm", e);
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
		let t = performance.now(), n = await this.ensureFormat(), r = this.mainBase.slice(this.mainBase.lastIndexOf("/") + 1), o = `${r}.xdv`;
		await this.tex.writeFile(o, /* @__PURE__ */ new Uint8Array());
		let s = await this.tex.run("compilelatex");
		if (!s.success || !s.out?.length) return this.result(!1, null, `${n}\n${s.log}`.trim(), t, s.inputFiles, !1, [s.resolver]);
		await this.dvipdfm.writeFile(o, s.out), await this.dvipdfm.writeFile(`${r}.pdf`, /* @__PURE__ */ new Uint8Array()), this.dvipdfm.setMainFile(o);
		let c = await this.dvipdfm.run("compilepdf"), l = `${s.log}\n${c.log}`, u = this.result(c.success && !!c.out?.length, c.out?.length ? c.out : null, l, t, s.inputFiles, s.inputFilesComplete, [s.resolver, c.resolver]);
		c.inputFiles && (u.pdfConversionInputs = c.inputFiles);
		let { pages: d, placements: f, reliable: p } = a(s.out);
		if (u.telemetry && (u.telemetry.geometry = {
			pages: d,
			reliable: p
		}), u.glyphCoverage && i(u.glyphCoverage.gaps, f, p, l), u.telemetry) {
			let t = [...new Set(d.flatMap((e) => e.textRuns.map((e) => e.font)))].filter((e) => !!e);
			u.telemetry.dependencies = e(l, {
				inputFiles: s.inputFiles,
				fonts: t,
				source: this.mainSource()
			});
		}
		return u.success && this.maybePersist(), u;
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
