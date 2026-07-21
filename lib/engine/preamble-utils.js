function s(n) {
  const t = "\\begin{document}";
  let e = 0;
  for (; ; ) {
    const r = n.indexOf(t, e);
    if (r === -1) return null;
    const i = n.lastIndexOf(`
`, r - 1) + 1;
    if (l(n.substring(i, r))) {
      e = r + t.length;
      continue;
    }
    return {
      preamble: n.substring(0, r),
      body: n.substring(r),
      preambleLineCount: n.substring(0, r).split(`
`).length
    };
  }
}
function l(n) {
  let t = 0;
  for (let e = 0; e < n.length; e++) {
    const r = n[e];
    if (r === "\\") {
      t++;
      continue;
    }
    if (r === "%" && t % 2 === 0) return !0;
    t = 0;
  }
  return !1;
}
function a(n) {
  let t = 0;
  for (let e = 0; e < n.length; e++)
    t = (t << 5) - t + n.charCodeAt(e) | 0;
  return t.toString(36);
}
export {
  s as extractPreamble,
  a as simpleHash
};
