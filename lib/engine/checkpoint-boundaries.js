const r = /\\(?:clearpage|cleardoublepage|newpage)\b|\\include\{[^}]*\}/g;
function s(n) {
  const t = [];
  for (const i of n.matchAll(r)) {
    const e = i.index, o = n.lastIndexOf(`
`, e - 1) + 1;
    c(n.slice(o, e)) || t.push(e + i[0].length);
  }
  return t;
}
const a = /\\(?:include|input|subfile)\{([^}]+)\}/g;
function f(n) {
  const t = /* @__PURE__ */ new Map();
  for (const i of n.matchAll(a)) {
    const e = i.index, o = n.lastIndexOf(`
`, e - 1) + 1;
    if (c(n.slice(o, e))) continue;
    const l = i[1].trim().replace(/\.tex$/, "");
    t.has(l) || t.set(l, e);
  }
  return t;
}
function c(n) {
  for (let t = 0; t < n.length; t++) {
    if (n[t] !== "%") continue;
    let i = 0;
    for (let e = t - 1; e >= 0 && n[e] === "\\"; e--) i++;
    if (i % 2 === 0) return !0;
  }
  return !1;
}
function u(n, t) {
  const i = Math.min(n.length, t.length);
  let e = 0;
  for (; e < i && n.charCodeAt(e) === t.charCodeAt(e); ) e++;
  return e;
}
function h(n, t, i = 0) {
  let e = null;
  for (const o of n)
    o <= t && o >= i && (e === null || o > e) && (e = o);
  return e;
}
function d(n, t) {
  return { headText: n.slice(0, t), tailText: n.slice(t) };
}
function g(n) {
  let t = 0;
  for (let i = 0; i < n.length; i++)
    t = (t << 5) - t + n.charCodeAt(i) | 0;
  return (t >>> 0).toString(36);
}
export {
  h as chooseBoundary,
  s as findPageBreaks,
  u as firstDifference,
  g as hashString,
  f as includePositions,
  d as splitAtBoundary
};
