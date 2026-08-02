import { buildLineStarts as v, positionToOffset as L, rangeFromOffsets as g } from "./source-position.js";
function w(e) {
  return e !== void 0 && /[A-Za-z0-9_.:+/-]/.test(e);
}
function z(e, t, n) {
  return e === "{" ? { braceDepth: n + 1, closes: !1 } : e !== "}" && e !== t ? { braceDepth: n, closes: !1 } : e === "}" && n > 0 ? { braceDepth: n - 1, closes: !1 } : { braceDepth: n, closes: e === t };
}
function A(e, t) {
  const n = e[t] === "{" ? "}" : ")";
  let r = 0, s = !1;
  for (let o = t + 1; o < e.length; o++) {
    const i = e[o];
    if (i === "\\") {
      o++;
      continue;
    }
    if (i === '"' && r === 0) {
      s = !s;
      continue;
    }
    if (s) continue;
    const l = z(i, n, r);
    if (r = l.braceDepth, l.closes) return o;
  }
  return e.length;
}
function F(e) {
  const t = [];
  for (const n of e.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)\s*([{(])/g)) {
    const r = n.index + n[0].length - 1;
    t.push({
      type: n[1].toLowerCase(),
      at: n.index,
      open: r,
      close: A(e, r)
    });
  }
  return t;
}
function O(e, t, n, r) {
  const s = e.lastIndexOf("@", t - 1);
  if (s < 0) return null;
  let o = s + 1;
  for (; w(e[o]); ) o++;
  const i = e.slice(o, t);
  if (t < s + 1 || t > o && i.trim() !== "") return null;
  const l = e.slice(s + 1, Math.min(t, o));
  return /^[A-Za-z0-9_-]*$/.test(l) ? {
    type: "bibtex",
    domain: "bib-entry-type",
    documentPath: r,
    prefix: l,
    replacementRange: g(n, s + 1, o),
    usedFields: []
  } : null;
}
function b(e, t, n, r) {
  const s = [];
  let o = 0, i = !1;
  for (let l = t; l < n; l++) {
    const f = e[l];
    f === "\\" ? l++ : f === '"' && o === 0 ? i = !i : !i && f === "{" ? o++ : !i && f === "}" && o > 0 ? o-- : !i && o === 0 && f === r && s.push(l);
  }
  return s;
}
function h(e, t, n) {
  for (; t < n && /\s/.test(e[t]); ) t++;
  return t;
}
function C(e, t, n, r) {
  let s = r, o = r;
  for (; s > t && w(e[s - 1]); ) s--;
  for (; o < n && w(e[o]); ) o++;
  return [s, o];
}
function T(e, t, n, r) {
  const s = b(e, t, n, ","), o = /* @__PURE__ */ new Set();
  let i = t;
  for (const l of [...s, n]) {
    if (i !== r) {
      const f = b(e, i, l, "=")[0], c = e.slice(i, f ?? l).trim().toLowerCase();
      c && o.add(c);
    }
    i = l + 1;
  }
  return [...o].sort();
}
function R(e, t, n, r, s, o, i, l, f) {
  const c = e.slice(o, l).trim().toLowerCase(), u = h(e, l + 1, i), [a, p] = C(e, u, i, t), m = c === "crossref" || c === "xdata" ? "bib-entry-key" : "bib-string", d = e[u];
  return m === "bib-string" && (d === "{" || d === '"') ? null : {
    type: "bibtex",
    domain: m,
    documentPath: r,
    entryType: s.type,
    field: c,
    prefix: e.slice(a, t),
    replacementRange: g(n, a, p),
    usedFields: f
  };
}
function Z(e, t, n, r, s) {
  const o = s.open + 1, i = b(e, o, s.close, ","), l = i[0];
  if (l === void 0 || t <= l) return null;
  const f = i.filter((y) => y < t).at(-1), c = i.find((y) => y >= t) ?? s.close, u = f + 1, a = b(e, u, c, "=")[0], p = T(e, l + 1, s.close, u);
  if (a !== void 0 && t > a)
    return R(
      e,
      t,
      n,
      r,
      s,
      u,
      c,
      a,
      p
    );
  const m = h(e, u, c), [d, S] = C(e, m, a ?? c, t);
  return {
    type: "bibtex",
    domain: "bib-field",
    documentPath: r,
    entryType: s.type,
    prefix: e.slice(d, t).toLowerCase(),
    replacementRange: g(n, d, S),
    usedFields: p
  };
}
function _(e, t) {
  try {
    const n = e.getText(), r = v(n), s = L(n, r, t), o = O(n, s, r, e.path);
    if (o) return o;
    const i = F(n).find(
      (l) => s > l.open && s <= l.close
    );
    return i ? Z(n, s, r, e.path, i) : null;
  } catch {
    return null;
  }
}
export {
  _ as analyzeBibCompletionContext
};
