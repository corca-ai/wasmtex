function u(m, e, o, r, M) {
  const n = Math.min(Math.max(m, 1), Math.max(r, 1)), t = M(n), a = Math.min(Math.max(e, 1), t), h = Math.min(Math.max(o, a), t);
  return { startLineNumber: n, startColumn: a, endLineNumber: n, endColumn: h };
}
export {
  u as clampMarkerRange
};
