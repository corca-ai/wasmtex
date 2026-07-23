const p = /* @__PURE__ */ new Set([
  "__strace.tex",
  "_checkpoint.tex",
  "_preamble.tex",
  "tail.tex",
  "texmf.cnf"
]);
function f(t) {
  const e = [];
  for (const n of t.split("/"))
    if (!(!n || n === "."))
      if (n === "..") {
        if (e.length === 0) return null;
        e.pop();
      } else
        e.push(n);
  return e.length > 0 ? e.join("/") : null;
}
function s(t) {
  if (!t || t.includes("\0")) return null;
  let e = t.replaceAll("\\", "/");
  if (/^[A-Za-z]:\//.test(e) || e === "/work") return null;
  if (e.startsWith("/work/")) e = e.slice(6);
  else if (e.startsWith("/")) return null;
  return f(e);
}
function d(t) {
  const e = /* @__PURE__ */ new Set();
  for (const n of t) {
    const r = s(n);
    r && e.add(r);
  }
  return e;
}
function m(t, e) {
  const n = d(t);
  for (const r of e ?? []) {
    const o = s(r);
    o && n.delete(o);
  }
  for (const r of p) n.delete(r);
  return n;
}
function i(t, e) {
  const n = /* @__PURE__ */ new Set();
  for (const r of t) {
    const o = s(r);
    o && e.has(o) && n.add(o);
  }
  return n;
}
function g(t, e) {
  return i(
    (t.telemetry?.dependencies?.nodes ?? []).filter((n) => n.origin === "project").map((n) => n.id),
    e
  );
}
function l(t) {
  return !t.success || !t.pdf || t.errors.some((e) => e.severity === "error") ? !1 : !t.telemetry?.diagnostics.some((e) => e.severity === "error");
}
function v(t, e, n) {
  if (!l(t)) return "compile-failed";
  if (e) return e;
  if (n.some((r) => !r.complete)) return "auxiliary-stage-failed";
}
function j(t, e, n, r) {
  const o = i(e.inputFiles ?? [], n), c = e.inputFilesComplete === !0 && l(e) && o.has(r);
  return t !== "xelatex" ? {
    projectInputs: o,
    coverage: [{ stage: "latex", source: "recorder", complete: c }],
    ...c ? {} : { incompleteReason: "recorder-unavailable" }
  } : {
    projectInputs: /* @__PURE__ */ new Set([...o, ...g(e, n)]),
    coverage: [
      { stage: "latex", source: "recorder", complete: c },
      { stage: "pdf-conversion", source: "log", complete: !1 },
      { stage: "pdf-conversion", source: "xdv", complete: !1 }
    ],
    incompleteReason: c ? "pdf-conversion-recorder-unavailable" : "engine-recorder-unavailable"
  };
}
function h(t) {
  const e = t.auxiliaryStages ?? [], n = m(t.projectFiles, t.generatedFiles), r = s(t.root) ?? t.root, o = j(t.engine, t.result, n, r);
  for (const a of e) {
    for (const u of i(a.projectInputs, n))
      o.projectInputs.add(u);
    o.coverage.push({
      stage: a.stage,
      source: "backend-request",
      complete: a.complete
    });
  }
  const c = v(t.result, o.incompleteReason, e);
  return {
    version: 1,
    root: r,
    projectInputs: [...o.projectInputs].sort(),
    complete: c === void 0,
    coverage: o.coverage,
    ...c ? { incompleteReason: c } : {}
  };
}
function x(t, e) {
  const n = s(t) ?? t, r = new Set(e?.projectInputs ?? []);
  return r.add(n), {
    version: 1,
    root: n,
    projectInputs: [...r].sort(),
    complete: !1,
    coverage: [{ stage: "latex", source: "recorder", complete: !1 }],
    incompleteReason: "incremental-dependencies-unavailable"
  };
}
export {
  h as buildDependencyManifest,
  x as buildIncrementalDependencyManifest,
  s as normalizeProjectDependencyPath
};
