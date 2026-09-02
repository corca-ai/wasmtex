//#region src/engine/tikz-externalization.ts
var e = "wasmtex-figure", t = "_preamble", n = "\\begin{document}";
function r(e) {
	return e.replace(/(^|[^\\])(\\\\)*%.*$/gm, (e, t, n) => `${t}${n ?? ""}`);
}
function i(e) {
	for (let t of e.matchAll(/\\begin\{document\}/g)) {
		let n = e.lastIndexOf("\n", t.index) + 1, r = e.slice(n, t.index);
		if (!/(^|[^\\])(\\\\)*%/.test(r)) return t.index;
	}
	return -1;
}
function a(e) {
	let t = i(e), n = r(t >= 0 ? e.slice(0, t) : e);
	return /\\tikzexternalize\b/.test(n);
}
function o(e) {
	let t = i(e), n = r(t >= 0 ? e.slice(0, t) : e);
	return /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:tikz|pgfplots)\b[^}]*\}/.test(n);
}
function s(e, t = "document") {
	return t === "off" || i(e) < 0 ? null : a(e) ? "document" : t === "auto" && o(e) ? "inject" : null;
}
function c(e, t) {
	let r = i(e);
	if (r < 0) return e;
	let a = e.slice(0, r), o = e.slice(r + 16);
	return t === "inject" ? `${a}\\usetikzlibrary{external}\\tikzexternalize[mode=list and make]${n}${o}` : `${a}${n}\\tikzset{external/mode=list and make}${o}`;
}
function l(t, r, a, o) {
	let s = c(t, r), l = i(s);
	return l < 0 ? s : `\\def\\tikzexternalrealjob{${a}}\\def\\jobname{${e}}${s.slice(0, l)}${n}\\def\\pgfactualjobname{${o}}${s.slice(l + 16)}`;
}
function u(e) {
	if (!e) return [];
	let t = /* @__PURE__ */ new Set(), n = [];
	for (let r of e.split("\n")) {
		let e = r.trim();
		!e || t.has(e) || /[\s\\{}]/.test(e) || (t.add(e), n.push(e));
	}
	return n;
}
function d(e) {
	if (!e) return null;
	let t = /\\tikzexternallastkey\s*\{([^}]*)\}/.exec(e);
	return t && t[1].trim() || null;
}
function f(e) {
	return Math.max(1, Math.min(3, Math.max(2, e ?? 2) - 1));
}
var p = class {
	factory;
	size;
	mainFile;
	workers = [];
	cache = /* @__PURE__ */ new Map();
	constructor(e, t, n) {
		this.factory = e, this.size = t, this.mainFile = n;
	}
	isCurrent(e, t) {
		let n = this.cache.get(e);
		return !!n && t !== null && n.md5 === t;
	}
	retain(e) {
		let t = new Set(e);
		for (let e of this.cache.keys()) t.has(e) || this.cache.delete(e);
	}
	async render(e, t, n) {
		let r = performance.now(), i = /* @__PURE__ */ new Map(), a = [];
		if (e.length === 0) return {
			rendered: i,
			failures: a,
			elapsedMs: 0
		};
		let o = Math.max(1, Math.min(this.size, e.length));
		for (; this.workers.length < o;) this.workers.push(this.spawn());
		let s = 0;
		return await Promise.all(this.workers.slice(0, o).map(async (r) => {
			for (await r.ready; s < e.length;) {
				let o = e[s++];
				this.syncProject(r, n()), r.compiler.setFile(this.mainFile, t(o.name)), r.synced.delete(this.mainFile);
				let c = await r.compiler.compile();
				if (!c.success || !c.pdf) {
					a.push({
						name: o.name,
						log: c.log
					});
					continue;
				}
				let l = await r.compiler.readOutput(`${o.name}.dpth`), u = {
					md5: o.md5,
					pdf: c.pdf,
					dpth: l
				};
				i.set(o.name, u), this.cache.set(o.name, u);
			}
		})), {
			rendered: i,
			failures: a,
			elapsedMs: performance.now() - r
		};
	}
	dispose() {
		for (let e of this.workers) e.compiler.dispose();
		this.workers.length = 0, this.cache.clear();
	}
	spawn() {
		let e = this.factory();
		return {
			compiler: e,
			ready: e.init(),
			synced: /* @__PURE__ */ new Map()
		};
	}
	syncProject(e, t) {
		for (let [n, r] of t) n !== this.mainFile && e.synced.get(n) !== r && (e.compiler.setFile(n, r), e.synced.set(n, r));
	}
};
//#endregion
export { e as FIGURE_JOBNAME, t as PREAMBLE_SNAPSHOT_JOBNAME, p as TikzFigurePool, f as defaultFigureWorkers, s as detectTikzExternalization, a as documentExternalizes, l as figureJobSource, i as findBeginDocument, o as loadsTikz, c as mainJobSource, u as parseFigureList, d as parseFigureMd5 };
