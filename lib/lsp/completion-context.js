import { analyzeBibCompletionContext as k } from "./bib-completion-context.js";
import { maskSpansFromTokens as h } from "./latex-parser.js";
import { tokenize as g } from "./latex-tokenizer.js";
import { getCommandSignature as v } from "./package-db.js";
import { buildLineStarts as I, positionToOffset as S, rangeFromOffsets as y } from "./source-position.js";
const A = (n) => ({
  kind: n,
  valueKind: "free-text"
});
function C(n, s) {
  if (s.length === 0) return n;
  const t = [];
  let e = 0;
  for (const [o, i] of [...s].sort((r, a) => r[0] - a[0])) {
    const r = Math.max(e, o), a = Math.min(n.length, i);
    a <= r || (r > e && t.push(n.slice(e, r)), t.push(n.slice(r, a).replace(/[^\n]/g, " ")), e = a);
  }
  return e < n.length && t.push(n.slice(e)), t.join("");
}
function E(n, s, t) {
  for (const e of n)
    if (e.type === "comment" && t > e.start && t <= e.end || e.type === "verb" && t >= e.start && t < e.end) return !0;
  return s.some(([e, o]) => t >= e && t < o);
}
function b(n, s, t, e, o) {
  for (let i = s.length - 1; i >= 0; i--) {
    const r = s[i];
    if (r.type !== "command" || t < r.start + 1 || t > r.end) continue;
    if (!/^[a-zA-Z@]*$/.test(r.value)) return null;
    const a = r.start + 1;
    return {
      type: "command",
      domain: "command",
      documentPath: o,
      prefix: n.slice(a, t),
      replacementRange: y(e, a, r.end)
    };
  }
  return null;
}
function V(n, s) {
  let t = s;
  for (; t < n.length && /\s/.test(n[t]); ) t++;
  return t;
}
function x(n, s) {
  const t = [n[s] === "{" ? "}" : "]"];
  for (let e = s + 1; e < n.length; e++) {
    const o = n[e];
    if (o === "\\") {
      e++;
      continue;
    }
    if (o === "{") t.push("}");
    else if (o === "[") t.push("]");
    else if (o === t[t.length - 1] && (t.pop(), t.length === 0))
      return { closed: !0, contentEnd: e, end: e + 1 };
  }
  return { closed: !1, contentEnd: n.length, end: n.length };
}
function K(n, s) {
  let t = 0;
  for (const e of n) {
    for (; t < s.length && s[t].kind === "optional" && e.delimiter !== "optional"; )
      t++;
    const o = s[t];
    o?.kind === e.delimiter && (e.signatureIndex = t, e.spec = o, t++);
  }
}
function P(n, s, t) {
  let e = s.end, o = !1;
  n[e] === "*" && (o = !0, e++);
  const i = [];
  for (let a = 0; a < 64; a++) {
    e = V(n, e);
    const l = n[e];
    if (l !== "{" && l !== "[") break;
    const c = l === "{" ? "required" : "optional", u = x(n, e);
    if (i.push({
      delimiter: c,
      open: e,
      contentStart: e + 1,
      contentEnd: u.contentEnd,
      end: u.end,
      closed: u.closed,
      argumentIndex: a,
      spec: A(c)
    }), e = u.end, !u.closed) break;
  }
  if (i.length === 0) return null;
  const r = t?.getCommandArguments(s.value) ?? v(s.value);
  return r && K(i, r), { command: s.value, starred: o, groups: i };
}
function m(n, s, t, e) {
  const o = [], i = [];
  for (let r = s; r < t; r++) {
    const a = n[r];
    if (a === "\\") {
      r++;
      continue;
    }
    a === "{" ? i.push("}") : a === "[" ? i.push("]") : a === i[i.length - 1] ? i.pop() : i.length === 0 && a === e && o.push(r);
  }
  return o;
}
function d(n, s, t) {
  let e = s;
  for (; e < t && /\s/.test(n[e]); ) e++;
  return e;
}
function f(n, s, t) {
  let e = t;
  for (; e > s && /\s/.test(n[e - 1]); ) e--;
  return e;
}
function w(n, s, t, e) {
  const o = e ? m(n, s, t, ",") : [], i = [];
  let r = s;
  for (const a of [...o, t]) {
    const l = n.slice(r, a).trim();
    l && i.push(l), r = a + 1;
  }
  return i;
}
function F(n, s) {
  const t = [];
  for (const e of s) {
    const o = e.spec.valueKind ?? "free-text";
    if (o === "free-text" || o === "key-value") continue;
    const i = {
      argumentIndex: e.argumentIndex,
      valueKind: o,
      values: w(
        n,
        e.contentStart,
        e.contentEnd,
        e.spec.list ?? !1
      )
    };
    e.signatureIndex !== void 0 && (i.signatureIndex = e.signatureIndex), t.push(i);
  }
  return t;
}
function z(n, s, t) {
  const e = s.spec.list ? m(n, s.contentStart, s.contentEnd, ",") : [];
  let o = s.contentStart, i = s.contentEnd, r = 0;
  for (const a of e)
    if (a < t)
      o = a + 1, r++;
    else {
      i = a;
      break;
    }
  return { start: o, end: i, listIndex: r };
}
function L(n, s, t) {
  const e = m(n, s.start, s.end, "=")[0];
  if (e === void 0) {
    const r = d(n, s.start, s.end);
    return { start: r, end: f(n, r, s.end), keyValuePosition: "key" };
  }
  const o = n.slice(
    d(n, s.start, e),
    f(n, s.start, e)
  );
  if (t <= e) {
    const r = d(n, s.start, e);
    return { start: r, end: f(n, r, e), keyValuePosition: "key", key: o };
  }
  const i = d(n, e + 1, s.end);
  return { start: i, end: f(n, i, s.end), keyValuePosition: "value", key: o };
}
function M(n, s, t) {
  const e = z(n, s, t), o = s.spec.valueKind === "key-value" ? L(n, e, t) : {
    start: d(n, e.start, e.end),
    end: f(n, e.start, e.end)
  };
  let { start: i, end: r } = o;
  t < i && (i = t), t > r && (r = t);
  const a = {
    prefix: n.slice(i, t),
    start: i,
    end: r,
    listIndex: e.listIndex
  };
  return "keyValuePosition" in o && (a.keyValuePosition = o.keyValuePosition), "key" in o && o.key && (a.key = o.key), a;
}
function T(n, s, t) {
  if (s.spec.valueKind !== "key-value") return [];
  const e = m(n, s.contentStart, s.contentEnd, ","), o = /* @__PURE__ */ new Set();
  let i = s.contentStart;
  for (const [r, a] of [...e, s.contentEnd].entries()) {
    if (r !== t) {
      const l = m(n, i, a, "=")[0] ?? a, c = n.slice(d(n, i, l), f(n, i, l));
      c && o.add(c);
    }
    i = a + 1;
  }
  return [...o].sort();
}
function q(n, s, t, e, o, i) {
  const r = M(n, i, s), a = i.spec.valueKind ?? "free-text", l = F(n, o.groups), c = i.spec.selectorArgumentIndex === void 0 ? void 0 : l.find((p) => p.signatureIndex === i.spec.selectorArgumentIndex), u = i.spec.keyFamilySelectorArgumentIndex === void 0 ? void 0 : l.find((p) => p.signatureIndex === i.spec.keyFamilySelectorArgumentIndex);
  return {
    type: "argument",
    domain: a,
    documentPath: e,
    command: o.command,
    starred: o.starred,
    argumentIndex: i.argumentIndex,
    delimiter: i.delimiter,
    valueKind: a,
    list: i.spec.list ?? !1,
    listIndex: r.listIndex,
    usedKeys: T(n, i, r.listIndex),
    prefix: r.prefix,
    replacementRange: y(t, r.start, r.end),
    relatedArguments: l,
    ...i.signatureIndex !== void 0 ? { signatureIndex: i.signatureIndex } : {},
    ...i.spec.keyFamily ? { keyFamily: i.spec.keyFamily } : {},
    ...r.keyValuePosition ? { keyValuePosition: r.keyValuePosition } : {},
    ...r.key ? { key: r.key } : {},
    ...c ? { selector: c } : {},
    ...u ? { keyFamilySelector: u } : {}
  };
}
function B(n, s, t, e, o, i) {
  for (let r = s.length - 1; r >= 0; r--) {
    const a = s[r];
    if (a.type !== "command" || a.start >= t) continue;
    const l = P(n, a, i);
    if (!l) continue;
    const c = l.groups.find(
      (u) => t >= u.contentStart && t <= u.contentEnd
    );
    if (c)
      return q(n, t, e, o, l, c);
  }
  return null;
}
function N(n, s, t) {
  try {
    if (n.path.toLowerCase().endsWith(".bib"))
      return k(n, s);
    const e = n.getText(), o = I(e), i = S(e, o, s), r = g(e), a = h(r);
    if (E(r, a, i)) return null;
    const l = C(e, a), c = B(l, r, i, o, n.path, t);
    return c && c.valueKind !== "free-text" ? c : b(l, r, i, o, n.path) ?? c;
  } catch {
    return null;
  }
}
export {
  N as analyzeCompletionContext
};
