class g {
  canvasPool = [];
  /** Render a single page into a wrapper div with canvas.
   *  Reuses canvases from the pool when available. */
  async renderPage(i, a, d) {
    const s = await i.getPage(a), e = s.getViewport({ scale: d }), n = document.createElement("div");
    n.className = "pdf-page-container", n.dataset.pageNum = String(a);
    const t = this.acquireCanvas(), o = window.devicePixelRatio || 1, c = Math.floor(e.width * o), r = Math.floor(e.height * o);
    (t.width !== c || t.height !== r) && (t.width = c, t.height = r), t.style.width = `${e.width}px`, t.style.height = `${e.height}px`, t.style.aspectRatio = `${e.width} / ${e.height}`;
    const h = t.getContext("2d");
    return h.setTransform(o, 0, 0, o, 0, 0), await s.render({ canvasContext: h, viewport: e, canvas: t }).promise, n.appendChild(t), { wrapper: n, canvas: t, pageNum: a };
  }
  /** Return canvases to the pool for reuse. */
  recycle(i) {
    for (const a of i)
      this.canvasPool.push(a);
  }
  acquireCanvas() {
    return this.canvasPool.pop() ?? document.createElement("canvas");
  }
}
export {
  g as PageRenderer
};
