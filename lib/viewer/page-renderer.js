//#region src/viewer/page-renderer.ts
var e = class {
	canvasPool = [];
	async renderPage(e, t, n) {
		let r = await e.getPage(t), i = r.getViewport({ scale: n }), a = document.createElement("div");
		a.className = "pdf-page-container", a.dataset.pageNum = String(t);
		let o = this.acquireCanvas(), s = window.devicePixelRatio || 1, c = Math.floor(i.width * s), l = Math.floor(i.height * s);
		(o.width !== c || o.height !== l) && (o.width = c, o.height = l), o.style.width = `${i.width}px`, o.style.height = `${i.height}px`, o.style.aspectRatio = `${i.width} / ${i.height}`;
		let u = o.getContext("2d");
		return u.setTransform(s, 0, 0, s, 0, 0), await r.render({
			canvasContext: u,
			viewport: i,
			canvas: o
		}).promise, a.appendChild(o), {
			wrapper: a,
			canvas: o,
			pageNum: t
		};
	}
	recycle(e) {
		for (let t of e) this.canvasPool.push(t);
	}
	acquireCanvas() {
		return this.canvasPool.pop() ?? document.createElement("canvas");
	}
};
//#endregion
export { e as PageRenderer };
