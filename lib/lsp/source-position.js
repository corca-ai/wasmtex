function c(e) {
  const t = [0];
  for (let n = 0; n < e.length; n++)
    e[n] === `
` && t.push(n + 1);
  return t;
}
function i(e, t) {
  t < 0 && (t = 0);
  let n = 0, o = e.length - 1;
  for (; n < o; ) {
    const l = n + o + 1 >> 1;
    e[l] <= t ? n = l : o = l - 1;
  }
  return { line: n + 1, column: t - e[n] + 1 };
}
function h(e, t, n) {
  const o = Math.min(Math.max(n.line - 1, 0), t.length - 1), l = t[o], u = o + 1 < t.length ? t[o + 1] - 1 : e.length;
  return Math.min(Math.max(l + n.column - 1, l), u);
}
function m(e, t, n) {
  const o = i(e, t), l = i(e, n);
  return {
    startLine: o.line,
    startColumn: o.column,
    endLine: l.line,
    endColumn: l.column
  };
}
export {
  c as buildLineStarts,
  i as offsetToLineCol,
  h as positionToOffset,
  m as rangeFromOffsets
};
