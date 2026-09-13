import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { buildDependencyGraph as t } from "./dependency-graph.js";
import { BaseTexFmtEngine as n, createCompileWorker as r, unicodeFormatUrl as i } from "./tex-fmt-engine.js";
import { attachPlacements as a, parseXdv as o } from "./xdv.js";
//#region src/engine/xetex-engine.ts
var s = class extends n {
	dvipdfm;
	constructor(t = {}) {
		let n = t.texliveVersion ?? "2025";
		super(r("xetex", t), "wasmtex-xetex.fmt", i("xetex", t), void 0, t.persistentCache ? {
			version: n,
			texliveUrl: e(t.texliveUrl ?? null, n)
		} : void 0, t.resolverProfile ?? {
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
		let e = performance.now(), n = await this.ensureFormat(), r = this.mainBase.slice(this.mainBase.lastIndexOf("/") + 1), i = `${r}.xdv`;
		await this.tex.writeFile(i, /* @__PURE__ */ new Uint8Array());
		let s = await this.tex.run("compilelatex");
		if (!s.success || !s.out?.length) return this.result(!1, null, `${n}\n${s.log}`.trim(), e, s.inputFiles, !1, [s.resolver]);
		await this.dvipdfm.writeFile(i, s.out), await this.dvipdfm.writeFile(`${r}.pdf`, /* @__PURE__ */ new Uint8Array()), this.dvipdfm.setMainFile(i);
		let c = await this.dvipdfm.run("compilepdf"), l = `${s.log}\n${c.log}`, u = this.result(c.success && !!c.out?.length, c.out?.length ? c.out : null, l, e, s.inputFiles, s.inputFilesComplete, [s.resolver, c.resolver]);
		c.inputFiles && (u.pdfConversionInputs = c.inputFiles);
		let { pages: d, placements: f, reliable: p } = o(s.out);
		if (u.telemetry && (u.telemetry.geometry = {
			pages: d,
			reliable: p
		}), u.glyphCoverage && a(u.glyphCoverage.gaps, f, p, l), u.telemetry) {
			let e = [...new Set(d.flatMap((e) => e.textRuns.map((e) => e.font)))].filter((e) => !!e);
			u.telemetry.dependencies = t(l, {
				inputFiles: s.inputFiles,
				fonts: e,
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
export { s as WasmTexXetexEngine };
