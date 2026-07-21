import { REF_CMDS as l, INPUT_CMDS as a, ENV_CMDS as m } from "./latex-patterns.js";
import { sourceLocationToMonaco as f } from "./source-position-monaco.js";
function d(e, r) {
  let n = 0;
  for (let t = r - 1; t >= 0; t--)
    if (e[t] === "}") n++;
    else if (e[t] === "{") {
      if (n === 0) return t;
      n--;
    }
  return -1;
}
function g(e, r) {
  let n = 0;
  for (let t = r; t < e.length; t++)
    if (e[t] === "{") n++;
    else if (e[t] === "}" && (n--, n === 0))
      return t;
  return e.length;
}
function h(e, r) {
  let n = 0;
  for (const t of e.split(",")) {
    const o = n + t.length;
    if (r >= n && r <= o) return t;
    n = o + 1;
  }
  return e;
}
function p(e, r) {
  const n = d(e, r);
  if (n < 0) return null;
  const o = e.slice(0, n).match(/\\([a-zA-Z@]+)(?:\[.*?\])?\s*$/);
  if (!o) return null;
  const c = g(e, n), i = e.slice(n + 1, c), u = h(i, r - (n + 1));
  return { command: o[1], arg: u };
}
const E = /^(?:cite|citep|citet|parencite|textcite|autocite|nocite)$/, D = new RegExp(
  `^(?:${l}|cite|citep|citet|parencite|textcite|autocite|nocite|${a}|${m})$`
);
function b(e, r) {
  const n = e.matchAll(/\\[a-zA-Z@]+/g);
  for (const t of n) {
    const o = t.index, c = o + t[0].length;
    if (r >= o && r < c) {
      const i = t[0].slice(1);
      if (D.test(i)) {
        const s = e.slice(c).match(/^\s*(?:\[.*?\])?\s*\{([^}]*)\}/);
        if (s) return { command: i, arg: h(s[1], 0) };
      }
      return { command: i };
    }
  }
  return null;
}
function C(e, r) {
  const n = e.getLineContent(r.lineNumber), t = r.column - 1;
  return p(n, t) ?? b(n, t);
}
const $ = new RegExp(`^(?:${l})$`), _ = new RegExp(`^(?:${a})$`), R = new RegExp(`^(?:${m})$`);
function M(e, r, n) {
  const t = [e];
  /\.[^./]+$/.test(e) || t.push(`${e}.tex`);
  for (const i of t)
    if (r.hasFile(i))
      return f({ file: i, line: 1, column: 1 });
  const o = n.uri.path.replace(/^\//, ""), c = o.lastIndexOf("/");
  if (c >= 0) {
    const i = o.slice(0, c + 1);
    for (const u of t) {
      const s = i + u;
      if (r.hasFile(s))
        return f({ file: s, line: 1, column: 1 });
    }
  }
  return f({
    file: t[t.length - 1],
    line: 1,
    column: 1
  });
}
function T(e, r, n, t) {
  const o = r.trim();
  if ($.test(e)) {
    const c = n.findLabelDef(o);
    return c ? f(c.location) : null;
  }
  if (E.test(e)) {
    const c = n.findBibEntry(o);
    if (c) return f(c.location);
    const i = n.findBibitemDef(o);
    return i ? f(i.location) : null;
  }
  if (_.test(e))
    return M(o, n, t);
  if (R.test(e)) {
    const c = n.findEnvironmentDef(o);
    return c ? f(c.location) : null;
  }
  return null;
}
function A(e, r) {
  const n = r.findCommandDef(e);
  return n ? f(n.location) : null;
}
function P(e) {
  return {
    provideDefinition(r, n) {
      const t = C(r, n);
      return t ? "arg" in t ? T(t.command, t.arg, e, r) : A(t.command, e) : null;
    }
  };
}
export {
  P as createDefinitionProvider
};
