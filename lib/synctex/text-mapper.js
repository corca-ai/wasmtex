class a {
  pageBlocks = /* @__PURE__ */ new Map();
  sourceLines = /* @__PURE__ */ new Map();
  /** Register source file content for matching */
  setSource(t, e) {
    this.sourceLines.set(t, e.split(`
`));
  }
  /**
   * Replace the entire set of registered source files. Use this when the project
   * file set may have changed (rename/delete) so stale files are dropped and can
   * no longer be matched by inverse search.
   */
  setSources(t) {
    this.sourceLines.clear();
    for (const [e, i] of t)
      this.sourceLines.set(e, i.split(`
`));
  }
  /** Extract text blocks from a PDF page */
  async indexPage(t, e) {
    const i = await t.getTextContent(), n = t.getViewport({ scale: 1 }), r = [];
    for (const s of i.items) {
      if (!("str" in s) || !s.str.trim()) continue;
      const o = s.transform;
      if (!o) continue;
      const c = s.height || Math.abs(o[3]), [l, u] = n.convertToViewportPoint(o[4], o[5]);
      r.push({
        text: s.str,
        x: l,
        // vy is the baseline position; shift up by height so highlight covers the text
        y: u - c,
        width: s.width ?? 0,
        height: c
      });
    }
    this.pageBlocks.set(e, r);
  }
  /** Find the source line for a click at (x, y) on the given page */
  lookup(t, e, i) {
    const n = this.pageBlocks.get(t);
    if (!n || n.length === 0) return null;
    const r = this.findClosestBlock(n, e, i);
    return r ? this.matchTextToSource(r.text) : null;
  }
  /** Forward search: find PDF position for a source line */
  forwardLookup(t, e) {
    const i = this.sourceLines.get(t);
    if (!i) return null;
    const n = i[e - 1];
    if (!n) return null;
    const r = this.stripTexCommands(n);
    if (r.length < 3) return null;
    let s = null;
    for (const [c, l] of this.pageBlocks)
      for (const u of l) {
        const h = this.matchScore(r, u.text);
        h > 0 && (!s || h > s.score) && (s = { page: c, block: u, score: h });
      }
    if (!s) return null;
    const o = s.block;
    return { page: s.page, x: o.x, y: o.y, width: o.width, height: o.height };
  }
  /** Clear all indexed data */
  clear() {
    this.pageBlocks.clear();
  }
  findClosestBlock(t, e, i) {
    let n = null, r = 1 / 0;
    for (const s of t) {
      const o = s.x + s.width / 2, c = s.y + s.height / 2, l = Math.hypot(e - o, i - c);
      l < r && (r = l, n = s);
    }
    return n;
  }
  matchTextToSource(t) {
    const e = t.trim();
    if (!e) return null;
    const i = this.findInSources(e);
    return i || (e.length >= 10 ? this.findInSources(e.slice(0, 10)) : null);
  }
  stripTexCommands(t) {
    return t.replace(/\\[a-zA-Z]+(\{[^}]*\}|\[[^\]]*\])*/g, " ").replace(/[{}\\$%&]/g, "").replace(/\s+/g, " ").trim();
  }
  /** Score how well cleanText matches a PDF block's text. Higher = better match. 0 = no match. */
  matchScore(t, e) {
    if (e.includes(t)) return t.length * 2;
    if (t.includes(e)) return e.length * 2;
    const i = Math.min(8, Math.min(t.length, e.length));
    for (let n = Math.min(t.length, e.length); n >= i; n--)
      if (t.slice(-n) === e.slice(0, n) || t.slice(0, n) === e.slice(-n)) return n;
    return 0;
  }
  findInSources(t) {
    for (const [e, i] of this.sourceLines)
      for (let n = 0; n < i.length; n++)
        if (i[n].includes(t))
          return { file: e, line: n + 1 };
    return null;
  }
}
export {
  a as TextMapper
};
