import * as n from "monaco-editor";
import { clampMarkerRange as l } from "./marker-range.js";
function m(r, t, e, i, a) {
  const c = /* @__PURE__ */ new Map();
  for (const o of r) {
    const s = t(o);
    if (!s) continue;
    const f = c.get(s) ?? [];
    f.push(o), c.set(s, f);
  }
  for (const o of i) {
    const s = o.uri.path.startsWith("/") ? o.uri.path.slice(1) : o.uri.path, u = (c.get(s) ?? []).map((g) => a(g, o));
    n.editor.setModelMarkers(o, e, u);
  }
}
function M(r, t) {
  return {
    severity: r.severity === "error" ? n.MarkerSeverity.Error : n.MarkerSeverity.Warning,
    // Whole-line highlight (col 1 → line end), clamped to a valid range via the same
    // helper as the diagnostics path.
    ...l(
      r.line,
      1,
      Number.POSITIVE_INFINITY,
      t.getLineCount(),
      (e) => t.getLineMaxColumn(e)
    ),
    message: r.message,
    source: "TeX",
    // Propagate the machine-readable classification (e.g. 'missing-package') so a host
    // reading getModelMarkers() can branch on marker.code, mirroring setDiagnosticMarkers.
    // Only when present, to avoid an explicit `code: undefined` on generic errors.
    ...r.code ? { code: r.code } : {}
  };
}
function y(r, t) {
  m(
    r,
    (e) => e.file && e.line > 0 ? e.file : void 0,
    "tex",
    t,
    (e, i) => M(e, i)
  );
}
const k = {
  error: n.MarkerSeverity.Error,
  warning: n.MarkerSeverity.Warning,
  info: n.MarkerSeverity.Info
};
function v(r, t) {
  m(
    r,
    (e) => e.file,
    "latex-diagnostics",
    t,
    (e, i) => ({
      severity: k[e.severity],
      // Clamp into a valid, non-inverted range — a stale diagnostic can point past the
      // current (shorter) document, and an unclamped startColumn would exceed endColumn.
      ...l(
        e.line,
        e.column,
        e.endColumn,
        i.getLineCount(),
        (a) => i.getLineMaxColumn(a)
      ),
      message: e.message,
      source: "LaTeX",
      code: e.code
    })
  );
}
export {
  M as errorToMarker,
  v as setDiagnosticMarkers,
  y as setErrorMarkers
};
