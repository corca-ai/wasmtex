function m(f, n) {
  for (const [t, o] of f) if (o === n) return t;
  for (const [t, o] of f) if (o.endsWith(`/${n}`)) return t;
  return null;
}
function w(f) {
  const n = /* @__PURE__ */ new Map(), t = /* @__PURE__ */ new Map();
  for (const [o, l] of f) {
    const p = [];
    for (const i of l)
      if (i.parent === null && p.push(i), i.line > 0) {
        const c = `${i.input}:${i.line}`;
        let e = t.get(c);
        e || (e = [], t.set(c, e)), e.push(i);
      }
    n.set(o, p);
  }
  return { pageRoots: n, friendIndex: t };
}
function T(f, n, t, o, l, p) {
  for (const [i, c] of n.pages) {
    const e = t + i, g = [];
    for (const s of c) {
      const r = p.get(s.input);
      r !== void 0 && (s.page = e, s.input === l && s.line > 0 && (s.line += o), s.input = r, g.push(s));
    }
    f.set(e, g);
  }
}
function y(f) {
  const { head: n, tail: t, headPageCount: o, tailLineOffset: l, mainFile: p, tailFile: i } = f, c = m(n.inputs, p), e = m(t.inputs, i);
  if (c === null || e === null) return null;
  const g = [...n.inputs.keys()].reduce((a, u) => Math.max(a, u), 0), s = /* @__PURE__ */ new Map([[e, c]]), r = new Map(n.inputs);
  for (const [a, u] of t.inputs) {
    if (a === e || u.endsWith(".aux")) continue;
    const h = m(n.inputs, u) ?? g + a;
    s.set(a, h), r.has(h) || r.set(h, u);
  }
  const d = /* @__PURE__ */ new Map();
  for (let a = 1; a <= o; a++) {
    const u = n.pages.get(a);
    u && d.set(a, u);
  }
  T(d, t, o, l, e, s);
  const { pageRoots: x, friendIndex: M } = w(d);
  return {
    inputs: r,
    pages: d,
    pageRoots: x,
    friendIndex: M,
    magnification: n.magnification,
    unit: n.unit,
    xOffset: n.xOffset,
    yOffset: n.yOffset
  };
}
export {
  y as mergeTailSynctex
};
