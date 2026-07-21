import { getCommandByName as a } from "./latex-commands.js";
function u(n) {
  const e = [];
  let r = n.startsWith("\\") ? 1 : 0;
  for (; r < n.length && /[a-zA-Z@*]/.test(n[r]); ) r++;
  for (; r < n.length; ) {
    for (; r < n.length && /\s/.test(n[r]); ) r++;
    const t = n[r];
    if (t !== "{" && t !== "[") break;
    const { content: o, end: i } = f(n, r);
    o.includes("$") && e.push({
      kind: t === "{" ? "required" : "optional",
      placeholder: g(o)
    }), r = i;
  }
  return e;
}
function f(n, e) {
  if (n[e] === "[") {
    const o = n.indexOf("]", e + 1), i = o < 0 ? n.length : o, d = o < 0 ? n.length : o + 1;
    return { content: n.slice(e + 1, i), end: d };
  }
  let t = 0;
  for (let o = e; o < n.length; o++)
    if (n[o] === "{") t++;
    else if (n[o] === "}" && --t === 0)
      return { content: n.slice(e + 1, o), end: o + 1 };
  return { content: n.slice(e + 1), end: n.length };
}
function g(n) {
  const e = n.match(/\$\{\d+:([^}]*)\}/);
  return e ? e[1] : "";
}
const c = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Set();
function l(n, e) {
  for (const r of e) {
    if (!r || typeof r.name != "string" || c.has(r.name)) continue;
    const t = { args: r.args ?? [], package: n };
    r.doc && (t.doc = r.doc), c.set(r.name, t);
  }
}
function h(n) {
  l(n.package, Array.isArray(n.commands) ? n.commands : []);
  for (const e of Array.isArray(n.environments) ? n.environments : [])
    !e || typeof e.name != "string" || s.add(e.name);
}
function p() {
  return s;
}
function y(n) {
  const e = a(n);
  return e ? u(e.snippet) : c.get(n)?.args;
}
function k(n) {
  const e = a(n);
  return e ? e.package : c.get(n)?.package;
}
function S(n, e) {
  const r = e.map(
    (t) => t.kind === "required" ? `{${t.placeholder ?? ""}}` : `[${t.placeholder ?? ""}]`
  );
  return `\\${n}${r.join("")}`;
}
export {
  S as formatSignature,
  k as getCommandPackage,
  y as getCommandSignature,
  p as getShardEnvironments,
  u as parseSignature,
  h as registerShard
};
