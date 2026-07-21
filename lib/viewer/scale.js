const f = 0.25, l = 5;
function p(t) {
  return Math.max(0.25, Math.min(5, t));
}
function s(t, n, e) {
  return n > 0 ? t * (e / n) : t;
}
function u(t, n) {
  const e = t.aspectRatio.match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/);
  if (!e) return 0;
  const o = Number.parseFloat(e[1]), r = Number.parseFloat(e[2]);
  return !(o > 0) || !(r > 0) ? 0 : t.width * n * (r / o);
}
function i(t, n, e) {
  let o = 0;
  for (let r = 0; r < n - 1; r++) {
    const c = t[r];
    c && (o += u(c, e));
  }
  return o;
}
function m(t) {
  const { scrollTop: n, oldPageOffsetTop: e, newTargetOffsetTop: o, oldScale: r, newScale: c, anchorToTop: a } = t;
  return a || e === null ? o : o + s(n - e, r, c);
}
export {
  l as MAX_SCALE,
  f as MIN_SCALE,
  p as clampScale,
  m as computeRestoredScrollTop,
  i as computeTargetOffsetTop,
  s as rescaleInPageOffset
};
