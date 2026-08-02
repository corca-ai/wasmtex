import { maskSpansFromTokens as k } from "./latex-parser.js";
import { tokenize as g } from "./latex-tokenizer.js";
import { getCommandSignature as y } from "./package-db.js";
import { buildLineStarts as v, offsetToLineCol as p } from "./source-position.js";
const I = (t) => ({
  kind: t,
  valueKind: "free-text"
});
function S(t, s, e) {
  const n = Math.min(Math.max(e.line - 1, 0), s.length - 1), o = s[n], r = n + 1 < s.length ? s[n + 1] - 1 : t.length;
  return Math.min(Math.max(o + e.column - 1, o), r);
}
function h(t, s, e) {
  const n = p(t, s), o = p(t, e);
  return {
    startLine: n.line,
    startColumn: n.column,
    endLine: o.line,
    endColumn: o.column
  };
}
function C(t, s) {
  if (s.length === 0) return t;
  const e = [];
  let n = 0;
  for (const [o, r] of [...s].sort((i, a) => i[0] - a[0])) {
    const i = Math.max(n, o), a = Math.min(t.length, r);
    a <= i || (i > n && e.push(t.slice(n, i)), e.push(t.slice(i, a).replace(/[^\n]/g, " ")), n = a);
  }
  return n < t.length && e.push(t.slice(n)), e.join("");
}
function x(t, s, e) {
  for (const n of t)
    if (n.type === "comment" && e > n.start && e <= n.end || n.type === "verb" && e >= n.start && e < n.end) return !0;
  return s.some(([n, o]) => e >= n && e < o);
}
function A(t, s, e, n, o) {
  for (let r = s.length - 1; r >= 0; r--) {
    const i = s[r];
    if (i.type !== "command" || e < i.start + 1 || e > i.end) continue;
    if (!/^[a-zA-Z@]*$/.test(i.value)) return null;
    const a = i.start + 1;
    return {
      type: "command",
      domain: "command",
      documentPath: o,
      prefix: t.slice(a, e),
      replacementRange: h(n, a, i.end)
    };
  }
  return null;
}
function E(t, s) {
  let e = s;
  for (; e < t.length && /\s/.test(t[e]); ) e++;
  return e;
}
function V(t, s) {
  const e = [t[s] === "{" ? "}" : "]"];
  for (let n = s + 1; n < t.length; n++) {
    const o = t[n];
    if (o === "\\") {
      n++;
      continue;
    }
    if (o === "{") e.push("}");
    else if (o === "[") e.push("]");
    else if (o === e[e.length - 1] && (e.pop(), e.length === 0))
      return { closed: !0, contentEnd: n, end: n + 1 };
  }
  return { closed: !1, contentEnd: t.length, end: t.length };
}
function b(t, s) {
  let e = 0;
  for (const n of t) {
    for (; e < s.length && s[e].kind === "optional" && n.delimiter !== "optional"; )
      e++;
    const o = s[e];
    o?.kind === n.delimiter && (n.signatureIndex = e, n.spec = o, e++);
  }
}
function P(t, s, e) {
  let n = s.end, o = !1;
  t[n] === "*" && (o = !0, n++);
  const r = [];
  for (let a = 0; a < 64; a++) {
    n = E(t, n);
    const l = t[n];
    if (l !== "{" && l !== "[") break;
    const u = l === "{" ? "required" : "optional", c = V(t, n);
    if (r.push({
      delimiter: u,
      open: n,
      contentStart: n + 1,
      contentEnd: c.contentEnd,
      end: c.end,
      closed: c.closed,
      argumentIndex: a,
      spec: I(u)
    }), n = c.end, !c.closed) break;
  }
  if (r.length === 0) return null;
  const i = e?.getCommandArguments(s.value) ?? y(s.value);
  return i && b(r, i), { command: s.value, starred: o, groups: r };
}
function m(t, s, e, n) {
  const o = [], r = [];
  for (let i = s; i < e; i++) {
    const a = t[i];
    if (a === "\\") {
      i++;
      continue;
    }
    a === "{" ? r.push("}") : a === "[" ? r.push("]") : a === r[r.length - 1] ? r.pop() : r.length === 0 && a === n && o.push(i);
  }
  return o;
}
function d(t, s, e) {
  let n = s;
  for (; n < e && /\s/.test(t[n]); ) n++;
  return n;
}
function f(t, s, e) {
  let n = e;
  for (; n > s && /\s/.test(t[n - 1]); ) n--;
  return n;
}
function M(t, s, e, n) {
  const o = n ? m(t, s, e, ",") : [], r = [];
  let i = s;
  for (const a of [...o, e]) {
    const l = t.slice(i, a).trim();
    l && r.push(l), i = a + 1;
  }
  return r;
}
function w(t, s) {
  const e = [];
  for (const n of s) {
    const o = n.spec.valueKind ?? "free-text";
    if (o === "free-text" || o === "key-value") continue;
    const r = {
      argumentIndex: n.argumentIndex,
      valueKind: o,
      values: M(
        t,
        n.contentStart,
        n.contentEnd,
        n.spec.list ?? !1
      )
    };
    n.signatureIndex !== void 0 && (r.signatureIndex = n.signatureIndex), e.push(r);
  }
  return e;
}
function K(t, s, e) {
  const n = s.spec.list ? m(t, s.contentStart, s.contentEnd, ",") : [];
  let o = s.contentStart, r = s.contentEnd, i = 0;
  for (const a of n)
    if (a < e)
      o = a + 1, i++;
    else {
      r = a;
      break;
    }
  return { start: o, end: r, listIndex: i };
}
function L(t, s, e) {
  const n = m(t, s.start, s.end, "=")[0];
  if (n === void 0) {
    const i = d(t, s.start, s.end);
    return { start: i, end: f(t, i, s.end), keyValuePosition: "key" };
  }
  const o = t.slice(
    d(t, s.start, n),
    f(t, s.start, n)
  );
  if (e <= n) {
    const i = d(t, s.start, n);
    return { start: i, end: f(t, i, n), keyValuePosition: "key", key: o };
  }
  const r = d(t, n + 1, s.end);
  return { start: r, end: f(t, r, s.end), keyValuePosition: "value", key: o };
}
function F(t, s, e) {
  const n = K(t, s, e), o = s.spec.valueKind === "key-value" ? L(t, n, e) : {
    start: d(t, n.start, n.end),
    end: f(t, n.start, n.end)
  };
  let { start: r, end: i } = o;
  e < r && (r = e), e > i && (i = e);
  const a = {
    prefix: t.slice(r, e),
    start: r,
    end: i,
    listIndex: n.listIndex
  };
  return "keyValuePosition" in o && (a.keyValuePosition = o.keyValuePosition), "key" in o && o.key && (a.key = o.key), a;
}
function T(t, s, e, n, o, r) {
  const i = F(t, r, s), a = r.spec.valueKind ?? "free-text", l = w(t, o.groups), u = r.spec.selectorArgumentIndex === void 0 ? void 0 : l.find((c) => c.signatureIndex === r.spec.selectorArgumentIndex);
  return {
    type: "argument",
    domain: a,
    documentPath: n,
    command: o.command,
    starred: o.starred,
    argumentIndex: r.argumentIndex,
    delimiter: r.delimiter,
    valueKind: a,
    list: r.spec.list ?? !1,
    listIndex: i.listIndex,
    prefix: i.prefix,
    replacementRange: h(e, i.start, i.end),
    relatedArguments: l,
    ...r.signatureIndex !== void 0 ? { signatureIndex: r.signatureIndex } : {},
    ...r.spec.keyFamily ? { keyFamily: r.spec.keyFamily } : {},
    ...i.keyValuePosition ? { keyValuePosition: i.keyValuePosition } : {},
    ...i.key ? { key: i.key } : {},
    ...u ? { selector: u } : {}
  };
}
function z(t, s, e, n, o, r) {
  for (let i = s.length - 1; i >= 0; i--) {
    const a = s[i];
    if (a.type !== "command" || a.start >= e) continue;
    const l = P(t, a, r);
    if (!l) continue;
    const u = l.groups.find(
      (c) => e >= c.contentStart && e <= c.contentEnd
    );
    if (u)
      return T(t, e, n, o, l, u);
  }
  return null;
}
function B(t, s, e) {
  try {
    const n = t.getText(), o = v(n), r = S(n, o, s), i = g(n), a = k(i);
    if (x(i, a, r)) return null;
    const l = C(n, a);
    return A(l, i, r, o, t.path) ?? z(l, i, r, o, t.path, e);
  } catch {
    return null;
  }
}
export {
  B as analyzeCompletionContext
};
