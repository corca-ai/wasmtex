import { PersistentCache as e, isIndexedDbSupported as t } from "./persistent-cache.js";
import { fetchBloomFilter as n } from "./bloom-filter.js";
import { engineFormatUrl as r, engineWorkerUrl as i } from "./engine-assets.js";
import { mergeResolverReports as a } from "./resolver-evidence.js";
import { CompileWorkerDriver as o } from "./wasmtex-worker.js";
import { buildDiagnostics as s, parseGlyphGaps as c, parseTexErrors as l } from "./parse-errors.js";
import { buildDependencyGraph as u } from "./dependency-graph.js";
import { readResponseWithProgress as d } from "./fetch-gz.js";
import { enrichGlyphSuggestions as f } from "./glyph-suggestions.js";
import { persistIfNeeded as p } from "./persist-watermark.js";
import { mergeWarmupCaches as m } from "./wasmtex-engine.js";
//#region src/engine/tex-fmt-engine.ts
function h(e, t) {
	let n = t.assetBaseUrl ?? "/", r = t.texliveVersion ?? "2025", a = t.texliveUrl ?? null, s = t.resolverProfile ?? {
		id: `texlive-${r}`,
		texliveYear: r,
		mirrorRevision: null
	}, c = e === "dvipdfm" ? "dvipdfmx" : e;
	return new o(i(n, r, e), a, r, c, s);
}
function g(e, t) {
	let n = t.assetBaseUrl ?? "/", i = t.texliveVersion ?? "2025";
	return r(n, i, e);
}
function _(e) {
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
var v = class {
	tex;
	fmtFile;
	mainBase = "main";
	sources = /* @__PURE__ */ new Map();
	fmtBytes = null;
	fmtInjected = !1;
	formatUrl;
	warmup;
	lastWarmSets = [];
	suppliedWarmup;
	durableCache = null;
	bloomBytes = null;
	persist = {
		downloadCount: 0,
		lastPersisted: -1,
		inFlight: !1
	};
	resolverProfile;
	onProgress;
	onFileDownload;
	constructor(n, r, i, a, o, s, c) {
		this.suppliedWarmup = c ? _(c) : void 0, this.tex = n, this.fmtFile = r, this.formatUrl = i, this.warmup = a, this.resolverProfile = s ?? {
			id: "texlive-2025",
			texliveYear: "2025",
			mirrorRevision: null
		}, o && t() && (this.durableCache = new e({ version: o.version }));
	}
	async initTex() {
		this.tex.onFileDownload = (e) => {
			this.persist.downloadCount++, this.onFileDownload?.(e);
		};
		let e = this.preloadFormat(), t = this.tex.init(), n = await this.loadDurable(), r = n && n.files.length > 0 ? this.durableToAssets(n) : await this.fetchWarmupAssets();
		await t, await e, this.lastWarmSets = [r], this.suppliedWarmup && this.lastWarmSets.push({
			bloom: this.suppliedWarmup.bloomFilter ?? null,
			files: this.suppliedWarmup.files.filter((e) => !r.files.some((t) => t.filename === e.filename && t.format !== e.format)),
			notFound: this.suppliedWarmup.notFound,
			source: "warmup-cache"
		});
		for (let e of this.lastWarmSets) this.injectWarmupAssets(this.tex, e);
	}
	bumpDownloadCount() {
		this.persist.downloadCount++;
	}
	extraCacheDrivers() {
		return [];
	}
	rehydrateExtraDriver(e) {
		for (let t of this.lastWarmSets) this.injectWarmupAssets(e, t);
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
		try {
			let e = await fetch(this.formatUrl);
			if (!e.ok) return;
			let t = await d(e, this.onProgress);
			this.looksLikeFormat(t) && (this.fmtBytes = t);
		} catch {}
	}
	async tryPreloadGzFormat() {
		if (!this.formatUrl || typeof DecompressionStream > "u") return null;
		try {
			let e = await fetch(`${this.formatUrl}.gz`);
			if (!e.ok) return null;
			let t = await d(e, this.onProgress);
			if (t[0] === 31 && t[1] === 139) {
				let e = new Response(t).body?.pipeThrough(new DecompressionStream("gzip"));
				e && (t = new Uint8Array(await new Response(e).arrayBuffer()));
			}
			return this.looksLikeFormat(t) ? t : null;
		} catch {
			return null;
		}
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
		p(this.persist, async () => {
			let n = await Promise.all(t.map((e) => e.dumpCache())), r = {
				files: [],
				notFound: []
			};
			for (let e of n) r = m(r, {
				files: e.files,
				notFound: e.notFound
			});
			this.bloomBytes && (r.bloomFilter = this.bloomBytes), await e.save(r);
		});
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
		this.fmtInjected = !1;
	}
	result(e, t, n, r, i, o, d = []) {
		let p = c(n);
		return p.length > 0 && f(p), {
			success: e,
			pdf: t,
			log: n,
			errors: l(n),
			compileTime: performance.now() - r,
			synctex: null,
			...i ? { inputFiles: i } : {},
			...typeof o == "boolean" ? { inputFilesComplete: o } : {},
			...p.length > 0 ? { glyphCoverage: { gaps: p } } : {},
			telemetry: {
				diagnostics: s(n, p),
				...d.some(Boolean) ? { resolver: a(this.resolverProfile, d) } : {},
				dependencies: u(n, {
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
export { v as BaseTexFmtEngine, h as createCompileWorker, g as unicodeFormatUrl };
