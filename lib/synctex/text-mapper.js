//#region src/synctex/text-mapper.ts
var e = class {
	pageBlocks = /* @__PURE__ */ new Map();
	sourceLines = /* @__PURE__ */ new Map();
	setSource(e, t) {
		this.sourceLines.set(e, t.split("\n"));
	}
	setSources(e) {
		this.sourceLines.clear();
		for (let [t, n] of e) this.sourceLines.set(t, n.split("\n"));
	}
	async indexPage(e, t) {
		let n = await e.getTextContent(), r = e.getViewport({ scale: 1 }), i = [];
		for (let e of n.items) {
			if (!("str" in e) || !e.str.trim()) continue;
			let t = e.transform;
			if (!t) continue;
			let n = e.height || Math.abs(t[3]), [a, o] = r.convertToViewportPoint(t[4], t[5]);
			i.push({
				text: e.str,
				x: a,
				y: o - n,
				width: e.width ?? 0,
				height: n
			});
		}
		this.pageBlocks.set(t, i);
	}
	lookup(e, t, n) {
		let r = this.pageBlocks.get(e);
		if (!r || r.length === 0) return null;
		let i = this.findClosestBlock(r, t, n);
		return i ? this.matchTextToSource(i.text) : null;
	}
	forwardLookup(e, t) {
		let n = this.sourceLines.get(e);
		if (!n) return null;
		let r = n[t - 1];
		if (!r) return null;
		let i = this.stripTexCommands(r);
		if (i.length < 3) return null;
		let a = null;
		for (let [e, t] of this.pageBlocks) for (let n of t) {
			let t = this.matchScore(i, n.text);
			t > 0 && (!a || t > a.score) && (a = {
				page: e,
				block: n,
				score: t
			});
		}
		if (!a) return null;
		let o = a.block;
		return {
			page: a.page,
			x: o.x,
			y: o.y,
			width: o.width,
			height: o.height
		};
	}
	clear() {
		this.pageBlocks.clear();
	}
	findClosestBlock(e, t, n) {
		let r = null, i = Infinity;
		for (let a of e) {
			let e = a.x + a.width / 2, o = a.y + a.height / 2, s = Math.hypot(t - e, n - o);
			s < i && (i = s, r = a);
		}
		return r;
	}
	matchTextToSource(e) {
		let t = e.trim();
		return t ? this.findInSources(t) || (t.length >= 10 ? this.findInSources(t.slice(0, 10)) : null) : null;
	}
	stripTexCommands(e) {
		return e.replace(/\\[a-zA-Z]+(\{[^}]*\}|\[[^\]]*\])*/g, " ").replace(/[{}\\$%&]/g, "").replace(/\s+/g, " ").trim();
	}
	matchScore(e, t) {
		if (t.includes(e)) return e.length * 2;
		if (e.includes(t)) return t.length * 2;
		let n = Math.min(8, Math.min(e.length, t.length));
		for (let r = Math.min(e.length, t.length); r >= n; r--) if (e.slice(-r) === t.slice(0, r) || e.slice(0, r) === t.slice(-r)) return r;
		return 0;
	}
	findInSources(e) {
		for (let [t, n] of this.sourceLines) for (let r = 0; r < n.length; r++) if (n[r].includes(e)) return {
			file: t,
			line: r + 1
		};
		return null;
	}
};
//#endregion
export { e as TextMapper };
