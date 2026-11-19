import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { buildDependencyGraph as t } from "./dependency-graph.js";
import { BaseTexFmtEngine as n, chapterPreviewHook as r, createCompileWorker as i, firstChapterEntry as a, unicodeFormatUrl as o } from "./tex-fmt-engine.js";
import { epsConversionFailure as s, xetexEpsSpecial as c } from "./eps-graphics.js";
import { attachPlacements as l, parseXdv as u } from "./xdv.js";
//#region src/engine/xetex-engine.ts
function d(e, t) {
	let n = "\\immediate\\write16{}\\batchmode\\read16 to\\wasmtexPreviewStop";
	return t ? r(t.name, n, t.cap) : `\\gdef\\wasmtexPreviewShipped{0}\\AddToHook{shipout/after}{\\xdef\\wasmtexPreviewShipped{\\the\\numexpr\\wasmtexPreviewShipped+1}\\ifnum\\wasmtexPreviewShipped<${e} \\else${n}\\fi}`;
}
var f = class extends n {
	dvipdfm;
	chapterAux = /* @__PURE__ */ new Map();
	constructor(t = {}) {
		let n = t.texliveVersion ?? "2025";
		super(i("xetex", t), "wasmtex-xetex.fmt", o("xetex", t), void 0, t.persistentCache ? {
			version: n,
			texliveUrl: e(t.texliveUrl ?? null, n)
		} : void 0, t.resolverProfile ?? {
			id: `texlive-${n}`,
			texliveYear: n,
			mirrorRevision: null
		}, t.warmupCache), this.dvipdfm = i("dvipdfm", t), this.dvipdfm.setAssetDownloadSession(this.downloads);
	}
	setAssetDownloadSession(e) {
		super.setAssetDownloadSession(e), this.dvipdfm.setAssetDownloadSession(e);
	}
	async init() {
		this.dvipdfm.onFileDownload = (e) => {
			this.bumpDownloadCount(), this.onFileDownload?.(e);
		};
		let [e] = await Promise.all([this.initTex(), this.dvipdfm.init()]);
		this.rehydrateExtraDriver(this.dvipdfm, e);
	}
	extraCacheDrivers() {
		return [this.dvipdfm];
	}
	async writeFile(e, t) {
		await Promise.all([super.writeFile(e, t), this.dvipdfm.writeFile(e, t)]);
	}
	writeConvertedEps(e, t) {
		return this.dvipdfm.writeFile(e, t);
	}
	async mkdir(e) {
		await super.mkdir(e), this.dvipdfm.mkdir(e);
	}
	async compile() {
		return this.compileWithEpsPreparation();
	}
	async compileWithEpsPreparation(e) {
		let n = performance.now(), r = await this.ensureFormat(), i = this.jobName(), a = `${i}.xdv`;
		await this.tex.writeFile(a, /* @__PURE__ */ new Uint8Array());
		let o = await this.tex.run("compilelatex");
		if (!o.success || !o.out?.length) return this.result(!1, null, `${r}\n${o.log}`.trim(), n, o.inputFiles, !1, [o.resolver]);
		let d;
		if (e) {
			let t = /* @__PURE__ */ new Set();
			d = u(o.out, (e) => {
				let n = c(e);
				n && t.add(n);
			});
			let r = t.size ? await e(t) : void 0;
			if (r) return s(this.result(!1, null, o.log, n, o.inputFiles, !1, [o.resolver]), r.path, r.error);
		}
		let f = await this.convert(i, o.out), p = `${o.log}\n${f.log}`, m = this.result(f.success && !!f.out?.length, f.out?.length ? f.out : null, p, n, o.inputFiles, o.inputFilesComplete, [o.resolver, f.resolver]);
		f.inputFiles && (m.pdfConversionInputs = f.inputFiles);
		let { pages: h, placements: g, reliable: _ } = d ?? u(o.out);
		if (m.telemetry && (m.telemetry.geometry = {
			pages: h,
			reliable: _
		}), m.glyphCoverage && l(m.glyphCoverage.gaps, g, _, p), m.telemetry) {
			let e = [...new Set(h.flatMap((e) => e.textRuns.map((e) => e.font)))].filter((e) => !!e);
			m.telemetry.dependencies = t(p, {
				inputFiles: o.inputFiles,
				fonts: e,
				source: this.mainSource()
			});
		}
		return m.success && (this.recordFullPass(o.inputFiles, o.log, "characters"), await this.keepChapterAux(o.inputFiles, i), this.maybePersist()), m;
	}
	async keepChapterAux(e, t) {
		let n = (e ?? []).filter((e) => e.startsWith("./") && e.endsWith(".aux")).map((e) => e.slice(2)).filter((e) => e !== `${t}.aux`), r = await Promise.all(n.map((e) => this.tex.readFile(e)));
		this.chapterAux = new Map(n.flatMap((e, t) => r[t] === null ? [] : [[e, r[t]]]));
	}
	async compilePagePreview(e, { chapter: t, cold: n = !1 } = {}) {
		let r = t ? this.chapterStart(t, e) : 1;
		if (r === null) return null;
		let i, o = null;
		try {
			i = await this.runPreviewJob(d(e, t ? {
				name: t,
				cap: e - r + 1
			} : void 0), (e) => this.tex.writeFile(`${e}.xdv`, /* @__PURE__ */ new Uint8Array()), { cold: n }), t && i && (o = a(await this.tex.readFile(`${t}.aux`)));
		} finally {
			await Promise.allSettled([...this.chapterAux].map(([e, t]) => this.tex.writeFile(e, t)));
		}
		if (!i) return null;
		let s = i.run;
		if (!s.success || !s.out?.length) {
			let e = this.result(!1, null, `${i.fmtLog}\n${s.log}`.trim(), i.start, void 0, void 0, [s.resolver]);
			return {
				...this.attributePreviewErrors(e, i.main),
				firstPage: 1
			};
		}
		let c = t ? this.placeChapter(t, r, s.log, "characters", [o, a(this.chapterAux.get(`${t}.aux`) ?? null)]) : 1;
		if (c === null) return null;
		let l = await this.convert(i.job, s.out), u = this.result(l.success && !!l.out?.length, l.out?.length ? l.out : null, `${s.log}\n${l.log}`, i.start, void 0, void 0, [s.resolver, l.resolver]);
		return {
			...this.attributePreviewErrors(u, i.main),
			firstPage: c
		};
	}
	async convert(e, t) {
		let n = `${e}.xdv`;
		return await this.dvipdfm.writeFile(n, t), await this.dvipdfm.writeFile(`${e}.pdf`, /* @__PURE__ */ new Uint8Array()), this.dvipdfm.setMainFile(n), this.dvipdfm.run("compilepdf");
	}
	async flushCache() {
		this.tex.flushCache(), this.dvipdfm.flushCache(), this.clearInjectedFormat(), this.chapterAux.clear();
	}
	terminate() {
		this.downloadAbort.abort(), this.tex.terminate(), this.dvipdfm.terminate();
	}
};
//#endregion
export { f as WasmTexXetexEngine, d as xetexPreviewHook };
