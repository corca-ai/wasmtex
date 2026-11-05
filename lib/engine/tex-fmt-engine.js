import { PersistentCache as e, isIndexedDbSupported as t } from "./persistent-cache.js";
import { fetchBloomFilter as n } from "./bloom-filter.js";
import { engineFormatUrl as r, engineWorkerUrl as i, formatAssetBase as a } from "./engine-assets.js";
import { mergeResolverReports as o } from "./resolver-evidence.js";
import { CompileWorkerDriver as s } from "./wasmtex-worker.js";
import { readResponseWithProgress as c } from "./fetch-gz.js";
import { AssetDownloadError as l, AssetDownloadSession as u } from "./asset-download.js";
import { buildDiagnostics as d, parseGlyphGaps as f, parseTexErrors as p } from "./parse-errors.js";
import { buildDependencyGraph as m } from "./dependency-graph.js";
import { enrichGlyphSuggestions as h } from "./glyph-suggestions.js";
import { persistIfNeeded as g } from "./persist-watermark.js";
import { mergeWarmupCaches as _ } from "./wasmtex-engine.js";
//#region src/engine/tex-fmt-engine.ts
function v(e, t) {
	let n = t.assetBaseUrl ?? "/", r = t.texliveVersion ?? "2025", a = t.texliveUrl ?? null, o = t.resolverProfile ?? {
		id: `texlive-${r}`,
		texliveYear: r,
		mirrorRevision: null
	}, c = e === "dvipdfm" ? "dvipdfmx" : e, l = i(n, r, e);
	return new s(e === "luatex" && t.luatexHeapCheckpoints ? `${l}?engine=checkpoint` : l, a, r, c, o);
}
function y(e, t) {
	let n = a(t.assetBaseUrl ?? "/", t.formatAssetBaseUrl), i = t.texliveVersion ?? "2025";
	return r(n, i, e);
}
function b(e) {
	let t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Set();
	for (let r of e.files) {
		let e = new Uint8Array(r.data), i = t.get(r.filename);
		i && (i.length !== e.length || i.some((t, n) => t !== e[n])) ? n.add(r.filename) : t.set(r.filename, e);
	}
	return {
		...e,
		files: e.files.filter((e) => !n.has(e.filename))
	};
}
var x = "-wasmtex-preview";
function S(e, t) {
	let n = `./${t}.`, r = /* @__PURE__ */ new Set();
	for (let t of e ?? []) {
		if (!t.startsWith(n)) continue;
		let e = t.slice(n.length);
		e && e !== "tex" && !e.includes("/") && r.add(e);
	}
	return [...r];
}
function C(e, t) {
	let { starts: n, numbers: r, written: i } = w(e, t);
	return i === r.length ? {
		starts: n,
		numbers: r
	} : null;
}
function w(e, t) {
	let n = new TextEncoder(), r = (e) => t === "characters" ? [...e].length : n.encode(e).length, i = !1, a = e.split("\n").map((e) => {
		let t = i;
		return i = /^(?:Overfull|Underfull|Loose|Tight) \\[hv]box/.test(e) || i && r(e) === 79, t ? r(e) === 79 ? "" : "\n" : r(e) === 79 ? e : `${e}\n`;
	}).join(""), o = /* @__PURE__ */ new Map(), s = [];
	for (let e of a.matchAll(/\[(-?\d+)|\((?:\.\/)?([^\s()[\]]+\.tex)/g)) e[2] === void 0 ? (e.index === 0 || /\s/.test(a[e.index - 1])) && s.push(Number(e[1])) : o.has(e[2]) || o.set(e[2], s.length + 1);
	let c = /Output written on \S+ \((\d+) pages?/.exec(a);
	return {
		starts: o,
		numbers: s,
		written: c ? Number(c[1]) : null
	};
}
var T = /\/(?:biblatex|glossaries|glossaries-extra|acro|acronym|excludeonly|jurabib|titletoc)\.sty$/;
function E(e, t, n) {
	return `\\includeonly{${e}}\\gdef\\wasmtexChapterOpen{0}\\gdef\\wasmtexChapterKept{0}\\AddToHook{shipout/before}{\\ifcase\\wasmtexChapterOpen\\DiscardShipoutBox\\or\\IfMarksEqualTF{2e-left}{top}{last}{\\DiscardShipoutBox}{\\gdef\\wasmtexChapterOpen{2}}\\fi}\\AddToHook{shipout/after}{\\ifnum\\wasmtexChapterOpen=2 \\xdef\\wasmtexChapterKept{\\the\\numexpr\\wasmtexChapterKept+1}\\ifnum\\wasmtexChapterKept<${n} \\else${t}\\fi\\fi}\\AddToHook{include/before}{\\gdef\\wasmtexChapterOpen{1}}\\AddToHook{include/after}{${t}}`;
}
function D(e) {
	return /\\@writefile\{toc\}\{\\contentsline \{chapter\}.*/.exec(e ?? "")?.[0] ?? null;
}
var O = class {
	tex;
	fmtFile;
	mainBase = "main";
	fullPass = null;
	sources = /* @__PURE__ */ new Map();
	fmtBytes = null;
	fmtInjected = !1;
	formatUrl;
	warmup;
	suppliedWarmup;
	durableCache = null;
	bloomBytes = null;
	persist = {
		downloadCount: 0,
		lastPersisted: -1,
		inFlight: !1
	};
	resolverProfile;
	onAssetDownload;
	downloadAbort = new AbortController();
	downloads = new u((e) => this.onAssetDownload?.(e));
	onProgress;
	onFileDownload;
	constructor(n, r, i, a, o, s, c) {
		this.suppliedWarmup = c ? b(c) : void 0, this.tex = n, this.fmtFile = r, this.formatUrl = i, this.warmup = a, this.resolverProfile = s ?? {
			id: "texlive-2025",
			texliveYear: "2025",
			mirrorRevision: null
		}, o && t() && (this.durableCache = new e({
			...o,
			mirrorRevision: this.resolverProfile.mirrorRevision
		}));
	}
	async initTex() {
		this.downloadAbort = new AbortController(), this.downloads = new u((e) => this.onAssetDownload?.(e)), this.tex.onFileDownload = (e) => {
			this.persist.downloadCount++, this.onFileDownload?.(e);
		};
		let e = this.preloadFormat(), t = this.tex.init(), n = this.loadDurable().then((e) => e && e.files.length > 0 ? this.durableToAssets(e) : this.fetchWarmupAssets()), [, , r] = await Promise.all([
			e,
			t,
			n
		]), i = [r];
		this.suppliedWarmup && i.push({
			bloom: this.suppliedWarmup.bloomFilter ?? null,
			files: this.suppliedWarmup.files.filter((e) => !r.files.some((t) => t.filename === e.filename && t.format !== e.format)),
			notFound: this.suppliedWarmup.notFound,
			source: "warmup-cache"
		});
		for (let e of i) this.injectWarmupAssets(this.tex, e);
		return i;
	}
	bumpDownloadCount() {
		this.persist.downloadCount++;
	}
	extraCacheDrivers() {
		return [];
	}
	rehydrateExtraDriver(e, t) {
		for (let n of t) this.injectWarmupAssets(e, n);
	}
	async loadDurable() {
		if (!this.durableCache) return null;
		try {
			let e = await this.durableCache.load();
			return e && (this.persist.lastPersisted = 0), e;
		} catch {
			return null;
		}
	}
	durableToAssets(e) {
		return e.bloomFilter && (this.bloomBytes = e.bloomFilter), {
			bloom: e.bloomFilter ?? null,
			files: e.files.map((e) => ({
				format: e.format,
				filename: e.filename,
				data: e.data
			})),
			notFound: e.notFound,
			source: "persistent-cache"
		};
	}
	async preloadFormat() {
		if (!this.formatUrl || this.fmtBytes) return;
		let e = await this.tryPreloadGzFormat();
		if (e) {
			this.fmtBytes = e;
			return;
		}
		let t = await this.downloadFormatBytes(this.formatUrl);
		t !== null && (this.fmtBytes = t);
	}
	downloadFormatBytes(e, t = !1) {
		return this.downloads.read(e, {
			asset: "format",
			signal: this.downloadAbort.signal,
			validate: async (e) => {
				if (t && e[0] === 31 && e[1] === 139) {
					let t = new Response(e).body?.pipeThrough(new DecompressionStream("gzip"));
					t && (e = await c(new Response(t), void 0, void 0, this.downloadAbort.signal));
				}
				if (!this.looksLikeFormat(e)) throw new l("invalid");
				return e;
			},
			...this.onProgress ? { onPercent: this.onProgress } : {}
		});
	}
	async tryPreloadGzFormat() {
		return !this.formatUrl || typeof DecompressionStream > "u" ? null : this.downloadFormatBytes(`${this.formatUrl}.gz`, !0);
	}
	looksLikeFormat(e) {
		return e.length > 65536 && e[0] !== 60;
	}
	async fetchWarmupAssets() {
		if (!this.warmup) return {
			bloom: null,
			files: [],
			notFound: [],
			source: "warmup-cache"
		};
		let { texliveUrl: e, preload: t, notFound: r, concurrency: i = 8 } = this.warmup, a = async (e) => {
			try {
				let t = await fetch(e);
				return t.ok ? await t.arrayBuffer() : null;
			} catch {
				return null;
			}
		}, o = this.suppliedWarmup?.bloomFilter ? Promise.resolve(this.suppliedWarmup.bloomFilter) : n(e).catch(() => null), s = new Set(this.suppliedWarmup?.files.map((e) => `${e.format}/${e.filename}`) ?? []), c = [], l = 0;
		await Promise.all([...Array.from({ length: Math.min(i, t.length) }, async () => {
			for (; l < t.length;) {
				let n = t[l++];
				if (s.has(`${n.format}/${n.name}`)) continue;
				let r = await a(`${e}pdftex/${n.dir}/${n.name}`);
				r && c.push({
					format: n.format,
					filename: n.name,
					data: r
				});
			}
		})]);
		let u = await o;
		return u && this.durableCache && (this.bloomBytes = u), {
			bloom: u,
			files: c,
			notFound: r,
			source: "warmup-cache"
		};
	}
	injectWarmupAssets(e, t) {
		t.bloom && e.loadBloom(t.bloom), e.preload404(t.notFound, t.source === "persistent-cache" ? "durable-negative" : "warmup-negative");
		for (let n of t.files) e.preloadTexlive(n.format, n.filename, n.data.slice(0), t.source);
	}
	maybePersist() {
		if (!this.durableCache) return;
		let e = this.durableCache, t = [this.tex, ...this.extraCacheDrivers()];
		g(this.persist, () => e.saveFrom(async () => {
			let e = await Promise.all(t.map((e) => e.dumpCache())), n = {
				files: [],
				notFound: []
			};
			for (let t of e) n = _(n, {
				files: t.files,
				notFound: t.notFound
			});
			return this.bloomBytes && (n.bloomFilter = this.bloomBytes), n;
		}));
	}
	async ensureFormat() {
		let e = "";
		if (!this.fmtBytes) {
			let t = await this.tex.run("compileformat");
			e = t.log, t.success && t.out && (this.fmtBytes = t.out);
		}
		return this.fmtBytes && !this.fmtInjected && (await this.tex.writeFile(this.fmtFile, this.fmtBytes), this.fmtInjected = !0), e;
	}
	clearInjectedFormat() {
		this.fmtInjected = !1, this.fullPass = null;
	}
	result(e, t, n, r, i, a, s = []) {
		let c = f(n);
		return c.length > 0 && h(c), {
			success: e,
			pdf: t,
			log: n,
			errors: p(n),
			compileTime: performance.now() - r,
			synctex: null,
			...i ? { inputFiles: i } : {},
			...typeof a == "boolean" ? { inputFilesComplete: a } : {},
			...c.length > 0 ? { glyphCoverage: { gaps: c } } : {},
			telemetry: {
				diagnostics: d(n, c),
				...s.some(Boolean) ? { resolver: o(this.resolverProfile, s) } : {},
				dependencies: m(n, {
					inputFiles: i,
					source: this.mainSource()
				})
			}
		};
	}
	writeFile(e, t) {
		return typeof t == "string" && this.sources.set(e, t), this.tex.writeFile(e, t);
	}
	mainSource() {
		return this.sources.get(`${this.mainBase}.tex`);
	}
	async mkdir(e) {
		this.tex.mkdir(e);
	}
	setMainFile(e) {
		this.mainBase = e.replace(/\.tex$/, ""), this.tex.setMainFile(e);
	}
	readFile(e) {
		return this.tex.readFile(e);
	}
	jobName() {
		return this.mainBase.slice(this.mainBase.lastIndexOf("/") + 1);
	}
	recordFullPass(e, t, n) {
		let r = this.jobName(), i = /* @__PURE__ */ new Set();
		for (let t of e ?? []) {
			if (t === `./${r}.aux`) break;
			t.startsWith("./") && t.endsWith(".tex") && i.add(t.slice(2));
		}
		let a = (e ?? []).some((e) => T.test(e));
		this.fullPass = {
			jobInputs: S(e, r),
			preambleInputs: i,
			pages: a ? null : C(t, n),
			refused: /* @__PURE__ */ new Set()
		};
	}
	readsInPreamble(e) {
		return this.fullPass?.preambleInputs.has(e) ?? !0;
	}
	async runPreviewJob(e, t, { cold: n = !1 } = {}) {
		let r = this.mainSource();
		if (r === void 0 || !(this.fullPass || n)) return null;
		let i = performance.now(), a = await this.ensureFormat(), o = this.jobName(), s = `${o}${x}`;
		await Promise.all((this.fullPass?.jobInputs ?? []).map(async (e) => {
			let t = await this.tex.readFile(`${o}.${e}`);
			t !== null && await this.tex.writeFile(`${s}.${e}`, t);
		})), this.fullPass || await this.tex.writeFile(`${s}.aux`, "");
		let c = `${this.mainBase.slice(0, this.mainBase.length - o.length)}${s}.tex`;
		await this.tex.writeFile(c, e + r), await t?.(s), this.tex.setMainFile(c);
		try {
			return {
				job: s,
				main: c,
				start: i,
				fmtLog: a,
				run: await this.tex.run("compilelatex")
			};
		} finally {
			this.tex.setMainFile(`${this.mainBase}.tex`);
		}
	}
	chapterStart(e, t) {
		let n = this.fullPass;
		if (!n?.pages || n.refused.has(e)) return null;
		let r = n.pages.starts.get(`${e}.tex`);
		return r !== void 0 && r <= t ? r : null;
	}
	refuseChapter(e) {
		this.fullPass?.refused.add(e);
	}
	placeChapter(e, t, n, r, i) {
		let a = this.fullPass?.pages?.numbers, o = w(n, r).numbers[0], s = [0, 1].find((e) => o !== void 0 && a?.[t - 1 + e] === o);
		return s === void 0 || i[0] === null || i[0] !== i[1] ? (this.refuseChapter(e), null) : t + s;
	}
	attributePreviewErrors(e, t) {
		let n = `${this.mainBase}.tex`;
		for (let r of e.errors) r.file === t && (r.file = n);
		for (let r of e.telemetry?.diagnostics ?? []) r.file === t && (r.file = n);
		return e;
	}
	async clearCache() {
		await this.durableCache?.clear();
	}
	isPersistentCacheEnabled() {
		return this.durableCache !== null;
	}
	getStatus() {
		return this.tex.getStatus();
	}
};
//#endregion
export { O as BaseTexFmtEngine, x as PREVIEW_JOB_SUFFIX, E as chapterPreviewHook, v as createCompileWorker, D as firstChapterEntry, S as jobInputExtensions, C as transcriptPages, y as unicodeFormatUrl };
