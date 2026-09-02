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
function s(e) {
	let t = /^\s*%\s*!WASMTEX\s+tikz-externali[sz]ation\s*[=:]\s*(off|document|auto)\b/im.exec(e);
	return t ? t[1].toLowerCase() : null;
}
function c(e, t = "document") {
	let n = s(e) ?? t;
	return n === "off" || i(e) < 0 ? null : a(e) ? "document" : n === "auto" && o(e) ? "inject" : null;
}
function l(e, t) {
	let r = i(e);
	if (r < 0) return e;
	let a = e.slice(0, r), o = e.slice(r + 16);
	return t === "inject" ? `${a}\\usetikzlibrary{external}\\tikzexternalize[mode=list and make]${n}${o}` : `${a}${n}\\tikzset{external/mode=list and make}${o}`;
}
function u(t, r, a, o) {
	let s = l(t, r), c = i(s);
	return c < 0 ? s : `\\def\\tikzexternalrealjob{${a}}\\def\\jobname{${e}}${s.slice(0, c)}${n}\\def\\pgfactualjobname{${o}}${s.slice(c + 16)}`;
}
function d(e) {
	if (!e) return [];
	let t = /* @__PURE__ */ new Set(), n = [];
	for (let r of e.split("\n")) {
		let e = r.trim();
		!e || t.has(e) || /[\s\\{}]/.test(e) || (t.add(e), n.push(e));
	}
	return n;
}
function f(e) {
	if (!e) return null;
	let t = /\\tikzexternallastkey\s*\{([^}]*)\}/.exec(e);
	return t && t[1].trim() || null;
}
function p(e, t) {
	let n = Math.max(1, Math.min(3, Math.max(2, e ?? 2) - 1));
	return t !== void 0 && t <= 4 ? 1 : n;
}
var m = class {
	factory;
	size;
	mainFile;
	idleMs;
	workers = [];
	cache = /* @__PURE__ */ new Map();
	idleTimer = null;
	constructor(e, t, n, r = 3e5) {
		this.factory = e, this.size = t, this.mainFile = n, this.idleMs = r;
	}
	get liveWorkers() {
		return this.workers.length;
	}
	releaseWorkers() {
		for (let e of this.workers) e.compiler.dispose();
		this.workers.length = 0, this.idleTimer && clearTimeout(this.idleTimer), this.idleTimer = null;
	}
	scheduleRelease() {
		this.idleTimer && clearTimeout(this.idleTimer), this.idleTimer = setTimeout(() => this.releaseWorkers(), this.idleMs);
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
		this.idleTimer && clearTimeout(this.idleTimer);
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
					dpth: l,
					log: c.log
				};
				i.set(o.name, u), this.cache.set(o.name, u);
			}
		})), this.scheduleRelease(), {
			rendered: i,
			failures: a,
			elapsedMs: performance.now() - r
		};
	}
	dispose() {
		this.releaseWorkers(), this.cache.clear();
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
function h(e) {
	let t = 0;
	for (let n of e) {
		let e = r(n);
		t += e.match(/\\begin\s*\{tikzpicture\}|\\tikz\s*[[{]/g)?.length ?? 0;
	}
	return t;
}
function g(e) {
	for (let t of e) if (/\\(?:foreach|pgfplotsforeachungrouped|pgfplotsinvokeforeach)\b/.test(r(t))) return !0;
	return !1;
}
function _(e, t) {
	let n = [...t], i = r(e);
	if (/\\documentclass\s*(?:\[[^\]]*\])?\s*\{beamer\}/.test(i)) return "beamer";
	for (let e of n) {
		let t = r(e);
		if (/remember\s+picture|(?:\[|,)\s*overlay\s*(?:,|\]|=)|current\s+page|\\tikzmark\b|\\usetikzlibrary\s*\{[^}]*\btikzmark\b/.test(t)) return "remember-picture";
		if (/\\(?:re)?newenvironment\s*\*?\s*\{[^}]*\}(?:\s*\[[^\]]*\])*\s*\{[^{}]*\\begin\s*\{tikzpicture\}/.test(t) || /\\NewDocumentEnvironment\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^{}]*\\begin\s*\{tikzpicture\}/.test(t) || /\\(?:re)?newcommand\s*\*?\s*\{?\\[A-Za-z@]+\}?(?:\s*\[[^\]]*\])*\s*\{[^{}]*\\begin\s*\{tikzpicture\}/.test(t)) return "wrapped-environment";
	}
	return h(n) < 3 && !g(n) ? "too-few-pictures" : null;
}
//#endregion
export { e as FIGURE_JOBNAME, t as PREAMBLE_SNAPSHOT_JOBNAME, m as TikzFigurePool, h as countPictures, p as defaultFigureWorkers, _ as detectAutoBlocker, c as detectTikzExternalization, s as documentExternalizationMode, a as documentExternalizes, u as figureJobSource, i as findBeginDocument, g as hasPictureLoops, o as loadsTikz, l as mainJobSource, d as parseFigureList, f as parseFigureMd5 };
