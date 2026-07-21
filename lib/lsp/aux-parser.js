const s = /\\@input\{(.+?)\}/g;
function u(n) {
  const t = o(n, 0);
  return t && t.end === n.length ? t.content : n;
}
function o(n, t) {
  if (n[t] !== "{") return null;
  let i = 0;
  for (let e = t; e < n.length; e++) {
    const c = n[e];
    if (c === "\\") {
      e++;
      continue;
    }
    if (c === "{") i++;
    else if (c === "}" && --i === 0) return { content: n.slice(t + 1, e), end: e + 1 };
  }
  return null;
}
function a(n, t) {
  const i = "\\newlabel{";
  for (let e = n.indexOf(i); e !== -1; e = n.indexOf(i, e + 1)) {
    const c = o(n, e + i.length - 1);
    if (!c) continue;
    const l = o(n, c.end);
    if (!l) continue;
    const r = o(l.content, 0);
    if (!r) continue;
    const f = u(r.content);
    t.set(c.content.trim(), f);
  }
}
function d(n, t) {
  const i = "\\bibcite{";
  for (let e = n.indexOf(i); e !== -1; e = n.indexOf(i, e + 1)) {
    const c = o(n, e + i.length - 1);
    c && t.add(u(c.content).trim());
  }
}
function p(n) {
  const t = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Set(), e = [];
  a(n, t), d(n, i);
  for (const c of n.matchAll(s))
    e.push(c[1]);
  return { labels: t, citations: i, includes: e };
}
export {
  p as parseAuxFile
};
