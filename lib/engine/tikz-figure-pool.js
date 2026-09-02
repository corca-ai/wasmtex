//#region src/engine/tikz-figure-pool.ts
var e = class {
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
//#endregion
export { e as TikzFigurePool };
