function p(s, n) {
  for (const [t, e] of s)
    if (e === n || e.endsWith(`/${n}`)) return t;
  return null;
}
function h(s) {
  const n = /* @__PURE__ */ new Map(), t = /* @__PURE__ */ new Map();
  for (const [e, r] of s) {
    const u = [];
    for (const o of r)
      if (o.parent === null && u.push(o), o.line > 0) {
        const a = `${o.input}:${o.line}`;
        let i = t.get(a);
        i || (i = [], t.set(a, i)), i.push(o);
      }
    n.set(e, u);
  }
  return { pageRoots: n, friendIndex: t };
}
function x(s, n) {
  for (const [t, e] of s.inputs)
    if (!(t === n || e.endsWith(".aux")))
      return !1;
  return !0;
}
function M(s, n, t, e, r, u) {
  for (const [o, a] of n.pages) {
    const i = t + o;
    for (const f of a)
      f.page = i, f.input === r && (f.input = u, f.line > 0 && (f.line += e));
    s.set(i, a);
  }
}
function T(s) {
  const { head: n, tail: t, headPageCount: e, tailLineOffset: r, mainFile: u, tailFile: o } = s, a = p(n.inputs, u), i = p(t.inputs, o);
  if (a === null || i === null || !x(t, i)) return null;
  const f = /* @__PURE__ */ new Map();
  for (let l = 1; l <= e; l++) {
    const c = n.pages.get(l);
    c && f.set(l, c);
  }
  M(f, t, e, r, i, a);
  const { pageRoots: g, friendIndex: d } = h(f);
  return {
    inputs: new Map(n.inputs),
    pages: f,
    pageRoots: g,
    friendIndex: d,
    magnification: n.magnification,
    unit: n.unit,
    xOffset: n.xOffset,
    yOffset: n.yOffset
  };
}
export {
  T as mergeTailSynctex
};
