import { resolveTexliveUrl as e } from "./base-worker-engine.js";
import { buildDependencyGraph as t } from "./dependency-graph.js";
import { BaseTexFmtEngine as n, chapterPreviewHook as r, createCompileWorker as i, firstChapterEntry as a, unicodeFormatUrl as o } from "./tex-fmt-engine.js";
import { attachPlacements as s, parseXdv as c } from "./xdv.js";
//#region src/engine/xetex-engine.ts
function l(e, t) {
	let n = "\\immediate\\write16{}\\batchmode\\read16 to\\wasmtexPreviewStop";
	return t ? r(t.name, n, t.cap) : `\\gdef\\wasmtexPreviewShipped{0}\\AddToHook{shipout/after}{\\xdef\\wasmtexPreviewShipped{\\the\\numexpr\\wasmtexPreviewShipped+1}\\ifnum\\wasmtexPreviewShipped<${e} \\else${n}\\fi}`;
}
var u = class extends n {
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
		}, t.warmupCache), this.dvipdfm = i("dvipdfm", t);
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
	async mkdir(e) {
		await super.mkdir(e), this.dvipdfm.mkdir(e);
	}
	async compile() {
		let e = performance.now(), n = await this.ensureFormat(), r = this.jobName(), i = `${r}.xdv`;
		await this.tex.writeFile(i, /* @__PURE__ */ new Uint8Array());
		let a = await this.tex.run("compilelatex");
		if (!a.success || !a.out?.length) return this.result(!1, null, `${n}\n${a.log}`.trim(), e, a.inputFiles, !1, [a.resolver]);
		let o = await this.convert(r, a.out), l = `${a.log}\n${o.log}`, u = this.result(o.success && !!o.out?.length, o.out?.length ? o.out : null, l, e, a.inputFiles, a.inputFilesComplete, [a.resolver, o.resolver]);
		o.inputFiles && (u.pdfConversionInputs = o.inputFiles);
		let { pages: d, placements: f, reliable: p } = c(a.out);
		if (u.telemetry && (u.telemetry.geometry = {
			pages: d,
			reliable: p
		}), u.glyphCoverage && s(u.glyphCoverage.gaps, f, p, l), u.telemetry) {
			let e = [...new Set(d.flatMap((e) => e.textRuns.map((e) => e.font)))].filter((e) => !!e);
			u.telemetry.dependencies = t(l, {
				inputFiles: a.inputFiles,
				fonts: e,
				source: this.mainSource()
			});
		}
		return u.success && (this.recordFullPass(a.inputFiles, a.log, "characters"), await this.keepChapterAux(a.inputFiles, r), this.maybePersist()), u;
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
			i = await this.runPreviewJob(l(e, t ? {
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
		let u = await this.convert(i.job, s.out), d = this.result(u.success && !!u.out?.length, u.out?.length ? u.out : null, `${s.log}\n${u.log}`, i.start, void 0, void 0, [s.resolver, u.resolver]);
		return {
			...this.attributePreviewErrors(d, i.main),
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
		this.tex.terminate(), this.dvipdfm.terminate();
	}
};
//#endregion
export { u as WasmTexXetexEngine, l as xetexPreviewHook };
