const x = [
  ["black", "gray", "0"],
  ["blue", "rgb", "0,0,1"],
  ["brown", "rgb", ".75,.5,.25"],
  ["cyan", "rgb", "0,1,1"],
  ["darkgray", "gray", ".25"],
  ["gray", "gray", ".5"],
  ["green", "rgb", "0,1,0"],
  ["lightgray", "gray", ".75"],
  ["lime", "rgb", ".75,1,0"],
  ["magenta", "rgb", "1,0,1"],
  ["olive", "rgb", ".5,.5,0"],
  ["orange", "rgb", "1,.5,0"],
  ["pink", "rgb", "1,.75,.75"],
  ["purple", "rgb", ".75,0,.25"],
  ["red", "rgb", "1,0,0"],
  ["teal", "rgb", "0,.5,.5"],
  ["violet", "rgb", ".5,0,.5"],
  ["white", "gray", "1"],
  ["yellow", "rgb", "1,1,0"]
], k = /* @__PURE__ */ new Set(["black", "blue", "cyan", "green", "magenta", "red", "white", "yellow"]);
function w(e) {
  return x.filter(([t]) => e || k.has(t)).map(
    ([t, n, a]) => ({
      name: t,
      kind: "define",
      model: n,
      value: a,
      source: e ? "WasmTex xcolor baseline" : "WasmTex color baseline",
      confidence: "exact",
      priority: -1
    })
  );
}
function $(e, t) {
  const n = t.provenance.map((a) => `${a.sourcePath}${a.line ? `:${a.line}` : ""}`).join(", ");
  return {
    name: t.name,
    kind: t.kind,
    ...t.model ? { model: t.model } : {},
    ...t.value ? { value: t.value } : {},
    ...t.alias ? { alias: t.alias } : {},
    source: n || e.scope.id,
    confidence: t.confidence,
    priority: t.priority ?? 0
  };
}
function M(e) {
  return {
    name: e.name,
    kind: e.kind,
    ...e.model ? { model: e.model } : {},
    ...e.value ? { value: e.value } : {},
    ...e.alias ? { alias: e.alias } : {},
    source: `${e.location.file}:${e.location.line}`,
    confidence: "project",
    priority: 100
  };
}
function c(e, t) {
  t.kind === "provide" && e.has(t.name) || e.set(t.name, t);
}
function N(e, t, n) {
  const a = e.availability?.anyOptions, i = e.availability?.deferredOptions;
  if ((!a || a.length === 0) && (!i || i.length === 0)) return !0;
  const s = /* @__PURE__ */ new Set([
    ...n.index.getClassOptions(n.document.path),
    ...n.index.getPackageOptions(t.scope.name, n.document.path)
  ]);
  return a?.some((r) => s.has(r)) ? !0 : i?.some((r) => s.has(r)) === !0 && n.index.getActiveColorNames(n.document.path).has(e.name);
}
function L(e, t) {
  const n = e.index.getLoadedPackages(e.document.path), a = /* @__PURE__ */ new Map(), i = n.has("xcolor") || t.some((r) => r.scope.id === "package/xcolor");
  if (i || n.has("color"))
    for (const r of w(i)) c(a, r);
  const s = t.flatMap(
    (r) => r.colors.filter((o) => N(o, r, e)).map((o) => $(r, o))
  ).sort((r, o) => r.priority - o.priority || r.name.localeCompare(o.name));
  for (const r of s) c(a, r);
  for (const r of e.index.getActiveColors(e.document.path))
    c(a, M(r));
  return a;
}
function O(e) {
  return Math.max(0, Math.min(255, Math.round(e)));
}
function u(e) {
  return e.length < 3 || e.slice(0, 3).some((t) => !Number.isFinite(t)) ? null : `#${e.slice(0, 3).map((t) => O(t).toString(16).padStart(2, "0")).join("")}`;
}
function S(e, t) {
  if (!e || !t) return null;
  if (e.toUpperCase() === "HTML" && /^[a-f0-9]{6}$/i.test(t))
    return `#${t.toLowerCase()}`;
  const n = t.split(",").map(Number);
  if (e === "rgb") return u(n.map((a) => a * 255));
  if (e === "RGB") return u(n);
  if (e === "gray" && Number.isFinite(n[0]))
    return u([n[0] * 255, n[0] * 255, n[0] * 255]);
  if (e === "cmyk" && n.length >= 4) {
    const [a, i, s, r] = n;
    return u([
      255 * (1 - Math.min(1, a + r)),
      255 * (1 - Math.min(1, i + r)),
      255 * (1 - Math.min(1, s + r))
    ]);
  }
  return null;
}
function h(e) {
  return !e || !/^#[a-f0-9]{6}$/i.test(e) ? null : [1, 3, 5].map((t) => Number.parseInt(e.slice(t, t + 2), 16));
}
function j(e, t, n) {
  const a = e.split("!"), i = a[0].startsWith("-"), s = a[0].replace(/^-/, "").trim(), r = t.get(s);
  let o = h(r ? m(r, t, n) : null);
  if (!o) return null;
  i && (o = o.map((l) => 255 - l));
  for (let l = 1; l < a.length; l += 2) {
    const p = Number(a[l]);
    if (!Number.isFinite(p)) return null;
    const b = a[l + 1]?.trim() || "white", f = t.get(b), g = h(f ? m(f, t, n) : null);
    if (!g) return null;
    const d = Math.max(0, Math.min(100, p)) / 100;
    o = o.map(
      (C, y) => C * d + g[y] * (1 - d)
    );
  }
  return u(o);
}
function m(e, t, n = /* @__PURE__ */ new Set()) {
  const a = S(e.model, e.value);
  return a || !e.alias || n.has(e.name) ? a : (n.add(e.name), j(e.alias, t, n));
}
function A(e) {
  const t = e.document.lineAt(e.position.line), n = Math.max(0, e.position.column - 1), a = /[!\s{},=[\]]/;
  let i = Math.min(n, t.length), s = i;
  for (; i > 0 && !a.test(t[i - 1]); ) i--;
  for (; s < t.length && !a.test(t[s]); ) s++;
  return t[i] === "-" && i++, {
    prefix: t.slice(i, n),
    range: {
      startLine: e.position.line,
      startColumn: i + 1,
      endLine: e.position.line,
      endColumn: s + 1
    }
  };
}
function B(e) {
  return [e.alias ? `Alias: \`${e.alias}\`` : [e.model, e.value].filter(Boolean).join(" "), `Source: \`${e.source}\``, `Confidence: ${e.confidence}`].filter(Boolean).join(`

`);
}
function T(e, t) {
  const n = A(e), a = L(e, t);
  return [...a.values()].filter((i) => i.name.startsWith(n.prefix)).sort((i, s) => i.name.localeCompare(s.name)).map((i) => {
    const s = m(i, a);
    return {
      label: i.name,
      kind: "variable",
      insertText: i.name,
      detail: i.alias ? `Color alias · ${i.source}` : `Color · ${i.source}`,
      documentation: B(i),
      replaceLength: n.prefix.length,
      replacementRange: n.range,
      data: {
        wasmtex: {
          domain: "color",
          ...s ? { color: { css: s } } : {},
          provenance: { source: i.source, confidence: i.confidence }
        }
      }
    };
  });
}
export {
  T as completeColors
};
