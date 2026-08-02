import { maskSpansFromTokens as k } from "./latex-parser.js";
import { tokenize as y } from "./latex-tokenizer.js";
import { getCommandSignature as g } from "./package-db.js";
import { buildLineStarts as v, offsetToLineCol as p } from "./source-position.js";
const I = (e) => ({
  kind: e,
  valueKind: "free-text"
});
function S(e, s, t) {
  const n = Math.min(Math.max(t.line - 1, 0), s.length - 1), r = s[n], i = n + 1 < s.length ? s[n + 1] - 1 : e.length;
  return Math.min(Math.max(r + t.column - 1, r), i);
}
function h(e, s, t) {
  const n = p(e, s), r = p(e, t);
  return {
    startLine: n.line,
    startColumn: n.column,
    endLine: r.line,
    endColumn: r.column
  };
}
function C(e, s) {
  if (s.length === 0) return e;
  const t = [];
  let n = 0;
  for (const [r, i] of [...s].sort((o, a) => o[0] - a[0])) {
    const o = Math.max(n, r), a = Math.min(e.length, i);
    a <= o || (o > n && t.push(e.slice(n, o)), t.push(e.slice(o, a).replace(/[^\n]/g, " ")), n = a);
  }
  return n < e.length && t.push(e.slice(n)), t.join("");
}
function E(e, s, t) {
  for (const n of e)
    if (n.type === "comment" && t > n.start && t <= n.end || n.type === "verb" && t >= n.start && t < n.end) return !0;
  return s.some(([n, r]) => t >= n && t < r);
}
function A(e, s, t, n, r) {
  for (let i = s.length - 1; i >= 0; i--) {
    const o = s[i];
    if (o.type !== "command" || t < o.start + 1 || t > o.end) continue;
    if (!/^[a-zA-Z@]*$/.test(o.value)) return null;
    const a = o.start + 1;
    return {
      type: "command",
      domain: "command",
      documentPath: r,
      prefix: e.slice(a, t),
      replacementRange: h(n, a, o.end)
    };
  }
  return null;
}
function V(e, s) {
  let t = s;
  for (; t < e.length && /\s/.test(e[t]); ) t++;
  return t;
}
function b(e, s) {
  const t = [e[s] === "{" ? "}" : "]"];
  for (let n = s + 1; n < e.length; n++) {
    const r = e[n];
    if (r === "\\") {
      n++;
      continue;
    }
    if (r === "{") t.push("}");
    else if (r === "[") t.push("]");
    else if (r === t[t.length - 1] && (t.pop(), t.length === 0))
      return { closed: !0, contentEnd: n, end: n + 1 };
  }
  return { closed: !1, contentEnd: e.length, end: e.length };
}
function K(e, s) {
  let t = 0;
  for (const n of e) {
    for (; t < s.length && s[t].kind === "optional" && n.delimiter !== "optional"; )
      t++;
    const r = s[t];
    r?.kind === n.delimiter && (n.signatureIndex = t, n.spec = r, t++);
  }
}
function P(e, s, t) {
  let n = s.end, r = !1;
  e[n] === "*" && (r = !0, n++);
  const i = [];
  for (let a = 0; a < 64; a++) {
    n = V(e, n);
    const l = e[n];
    if (l !== "{" && l !== "[") break;
    const c = l === "{" ? "required" : "optional", u = b(e, n);
    if (i.push({
      delimiter: c,
      open: n,
      contentStart: n + 1,
      contentEnd: u.contentEnd,
      end: u.end,
      closed: u.closed,
      argumentIndex: a,
      spec: I(c)
    }), n = u.end, !u.closed) break;
  }
  if (i.length === 0) return null;
  const o = t?.getCommandArguments(s.value) ?? g(s.value);
  return o && K(i, o), { command: s.value, starred: r, groups: i };
}
function m(e, s, t, n) {
  const r = [], i = [];
  for (let o = s; o < t; o++) {
    const a = e[o];
    if (a === "\\") {
      o++;
      continue;
    }
    a === "{" ? i.push("}") : a === "[" ? i.push("]") : a === i[i.length - 1] ? i.pop() : i.length === 0 && a === n && r.push(o);
  }
  return r;
}
function d(e, s, t) {
  let n = s;
  for (; n < t && /\s/.test(e[n]); ) n++;
  return n;
}
function f(e, s, t) {
  let n = t;
  for (; n > s && /\s/.test(e[n - 1]); ) n--;
  return n;
}
function x(e, s, t, n) {
  const r = n ? m(e, s, t, ",") : [], i = [];
  let o = s;
  for (const a of [...r, t]) {
    const l = e.slice(o, a).trim();
    l && i.push(l), o = a + 1;
  }
  return i;
}
function M(e, s) {
  const t = [];
  for (const n of s) {
    const r = n.spec.valueKind ?? "free-text";
    if (r === "free-text" || r === "key-value") continue;
    const i = {
      argumentIndex: n.argumentIndex,
      valueKind: r,
      values: x(
        e,
        n.contentStart,
        n.contentEnd,
        n.spec.list ?? !1
      )
    };
    n.signatureIndex !== void 0 && (i.signatureIndex = n.signatureIndex), t.push(i);
  }
  return t;
}
function w(e, s, t) {
  const n = s.spec.list ? m(e, s.contentStart, s.contentEnd, ",") : [];
  let r = s.contentStart, i = s.contentEnd, o = 0;
  for (const a of n)
    if (a < t)
      r = a + 1, o++;
    else {
      i = a;
      break;
    }
  return { start: r, end: i, listIndex: o };
}
function L(e, s, t) {
  const n = m(e, s.start, s.end, "=")[0];
  if (n === void 0) {
    const o = d(e, s.start, s.end);
    return { start: o, end: f(e, o, s.end), keyValuePosition: "key" };
  }
  const r = e.slice(
    d(e, s.start, n),
    f(e, s.start, n)
  );
  if (t <= n) {
    const o = d(e, s.start, n);
    return { start: o, end: f(e, o, n), keyValuePosition: "key", key: r };
  }
  const i = d(e, n + 1, s.end);
  return { start: i, end: f(e, i, s.end), keyValuePosition: "value", key: r };
}
function F(e, s, t) {
  const n = w(e, s, t), r = s.spec.valueKind === "key-value" ? L(e, n, t) : {
    start: d(e, n.start, n.end),
    end: f(e, n.start, n.end)
  };
  let { start: i, end: o } = r;
  t < i && (i = t), t > o && (o = t);
  const a = {
    prefix: e.slice(i, t),
    start: i,
    end: o,
    listIndex: n.listIndex
  };
  return "keyValuePosition" in r && (a.keyValuePosition = r.keyValuePosition), "key" in r && r.key && (a.key = r.key), a;
}
function T(e, s, t) {
  if (s.spec.valueKind !== "key-value") return [];
  const n = m(e, s.contentStart, s.contentEnd, ","), r = /* @__PURE__ */ new Set();
  let i = s.contentStart;
  for (const [o, a] of [...n, s.contentEnd].entries()) {
    if (o !== t) {
      const l = m(e, i, a, "=")[0] ?? a, c = e.slice(d(e, i, l), f(e, i, l));
      c && r.add(c);
    }
    i = a + 1;
  }
  return [...r].sort();
}
function q(e, s, t, n, r, i) {
  const o = F(e, i, s), a = i.spec.valueKind ?? "free-text", l = M(e, r.groups), c = i.spec.selectorArgumentIndex === void 0 ? void 0 : l.find((u) => u.signatureIndex === i.spec.selectorArgumentIndex);
  return {
    type: "argument",
    domain: a,
    documentPath: n,
    command: r.command,
    starred: r.starred,
    argumentIndex: i.argumentIndex,
    delimiter: i.delimiter,
    valueKind: a,
    list: i.spec.list ?? !1,
    listIndex: o.listIndex,
    usedKeys: T(e, i, o.listIndex),
    prefix: o.prefix,
    replacementRange: h(t, o.start, o.end),
    relatedArguments: l,
    ...i.signatureIndex !== void 0 ? { signatureIndex: i.signatureIndex } : {},
    ...i.spec.keyFamily ? { keyFamily: i.spec.keyFamily } : {},
    ...o.keyValuePosition ? { keyValuePosition: o.keyValuePosition } : {},
    ...o.key ? { key: o.key } : {},
    ...c ? { selector: c } : {}
  };
}
function z(e, s, t, n, r, i) {
  for (let o = s.length - 1; o >= 0; o--) {
    const a = s[o];
    if (a.type !== "command" || a.start >= t) continue;
    const l = P(e, a, i);
    if (!l) continue;
    const c = l.groups.find(
      (u) => t >= u.contentStart && t <= u.contentEnd
    );
    if (c)
      return q(e, t, n, r, l, c);
  }
  return null;
}
function G(e, s, t) {
  try {
    const n = e.getText(), r = v(n), i = S(n, r, s), o = y(n), a = k(o);
    if (E(o, a, i)) return null;
    const l = C(n, a);
    return A(l, o, i, r, e.path) ?? z(l, o, i, r, e.path, t);
  } catch {
    return null;
  }
}
export {
  G as analyzeCompletionContext
};
