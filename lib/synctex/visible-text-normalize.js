//#region src/synctex/visible-text-normalize.ts
var e, t = class {
	chars = [];
	starts = [];
	ends = [];
	appendUnit(t) {
		e ??= new Intl.Segmenter("und", { granularity: "grapheme" });
		for (let n of e.segment(t.text)) {
			let e = t.end - t.start === t.text.length, r = e ? t.start + n.index : t.start, i = e ? r + n.segment.length : t.end, a = n.segment.normalize("NFKC").toLowerCase().replaceAll("­", "");
			for (let e of a) this.appendCharacter(e, r, i);
		}
	}
	appendCharacter(e, t, n) {
		if (/\s/u.test(e)) {
			if (!this.chars.length) return;
			if (this.chars.at(-1) === " ") {
				this.ends[this.ends.length - 1] = n;
				return;
			}
			e = " ";
		}
		this.chars.push(e);
		for (let r = 0; r < e.length; r++) this.starts.push(t), this.ends.push(n);
	}
	finish() {
		return this.chars.at(-1) === " " && (this.chars.pop(), this.starts.pop(), this.ends.pop()), {
			text: this.chars.join(""),
			starts: Uint32Array.from(this.starts),
			ends: Uint32Array.from(this.ends)
		};
	}
};
function n(e) {
	let n = new t();
	for (let t of e) n.appendUnit(t);
	return n.finish();
}
function r(e) {
	return n([{
		text: e,
		start: 0,
		end: e.length
	}]);
}
//#endregion
export { r as normalizeNavigationText, n as normalizeVisibleText };
