//#region src/synctex/visible-source-ranges.ts
var e = class {
	ranges;
	constructor(e) {
		let t = [];
		for (let n of [...e].sort((e, t) => e.startOffset - t.startOffset)) {
			if (n.endOffset <= n.startOffset) continue;
			let e = t.at(-1);
			e && n.startOffset <= e.endOffset ? e.endOffset = Math.max(e.endOffset, n.endOffset) : t.push({ ...n });
		}
		this.ranges = t;
	}
	first(e) {
		let t = 0, n = this.ranges.length;
		for (; t < n;) {
			let r = t + n >>> 1;
			this.ranges[r].endOffset <= e ? t = r + 1 : n = r;
		}
		return t;
	}
	intersects(e, t) {
		let n = this.ranges[this.first(e)];
		return n !== void 0 && n.startOffset < t;
	}
	clips(e, t) {
		let n = [];
		for (let r = this.first(e); r < this.ranges.length; r++) {
			let i = this.ranges[r];
			if (i.startOffset >= t) break;
			n.push({
				startOffset: Math.max(e, i.startOffset),
				endOffset: Math.min(t, i.endOffset)
			});
		}
		return n;
	}
};
//#endregion
export { e as VisibleSourceRanges };
