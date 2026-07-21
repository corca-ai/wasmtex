function o(l) {
  let e = null, i = 0;
  for (const [n, t] of l)
    t <= 0 || (e === null || t > i || t === i && n < e) && (e = n, i = t);
  return e;
}
export {
  o as pickMostVisiblePage
};
