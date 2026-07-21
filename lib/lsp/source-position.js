function t(l) {
  const i = [0];
  for (let n = 0; n < l.length; n++)
    l[n] === `
` && i.push(n + 1);
  return i;
}
function u(l, i) {
  i < 0 && (i = 0);
  let n = 0, e = l.length - 1;
  for (; n < e; ) {
    const o = n + e + 1 >> 1;
    l[o] <= i ? n = o : e = o - 1;
  }
  return { line: n + 1, column: i - l[n] + 1 };
}
export {
  t as buildLineStarts,
  u as offsetToLineCol
};
