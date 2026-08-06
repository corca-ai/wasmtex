//#region src/viewer/render-gate.ts
var e = class {
	generation = 0;
	begin() {
		return ++this.generation;
	}
	isCurrent(e) {
		return e === this.generation;
	}
	claim(e, t) {
		return t === this.generation ? e : (e.destroy(), null);
	}
};
//#endregion
export { e as RenderGate };
